/**
 * Forja do Código — atividade real do GitHub vira XP, eventos na Crônica e
 * evolução da oficina do ferreiro na Vila.
 *
 * Fontes (API oficial do GitHub, REST + GraphQL):
 * - commits: GET /repos/{repo}/commits?author=&since= nos repositórios monitorados;
 * - PRs abertas/mescladas: Search API (type:pr author:);
 * - issues resolvidas e releases: eventos do usuário (/users/{u}/events, ~90 dias);
 * - calendário oficial de contribuições (12 meses): GraphQL, só com token.
 *
 * Idempotência em duas camadas: code_events UNIQUE (owner, kind, external_id)
 * e xp_events UNIQUE (owner, 'code', source_id, kind). Reprocessar a mesma
 * janela nunca soma XP de novo.
 */
import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { award } from "./gamificationService.js";
import { localDayOfStored, shiftDayKey, userDayContext } from "./localDayService.js";
import { decryptSecret, encryptSecret } from "./cryptoService.js";
import { recordWorldEvent } from "./livingWorldService.js";

export type CodeKind = "commit" | "pr_opened" | "pr_merged" | "issue_closed" | "release";
export const CODE_KINDS: CodeKind[] = ["commit", "pr_opened", "pr_merged", "issue_closed", "release"];

/** Regras padrão de XP por atividade + teto diário de itens que rendem XP (anti-abuso). */
export const CODE_XP: Record<CodeKind, { xp: number; dailyCap: number; label: string }> = {
  commit: { xp: 10, dailyCap: 15, label: "Commit" },
  pr_opened: { xp: 25, dailyCap: 5, label: "Pull request aberta" },
  pr_merged: { xp: 60, dailyCap: 5, label: "Pull request mesclada" },
  issue_closed: { xp: 30, dailyCap: 8, label: "Issue resolvida" },
  release: { xp: 100, dailyCap: 2, label: "Release publicada" },
};

/** Níveis da oficina: XP acumulado para chegar ao nível L = 120 × (L−1) × L / 2. */
export const forgeXpForLevel = (level: number) => (120 * (level - 1) * level) / 2;
export function forgeLevelFromXp(xp: number): { level: number; current: number; next: number } {
  let level = 1;
  while (level < 99 && xp >= forgeXpForLevel(level + 1)) level++;
  return { level, current: forgeXpForLevel(level), next: forgeXpForLevel(level + 1) };
}

/** Evoluções visuais da oficina (persistidas pelo nível, que vem do XP real). */
export const FORGE_UNLOCKS = [
  { level: 1, key: "oficina", title: "Oficina simples", description: "Bigorna, fornalha e a bancada do ferreiro." },
  { level: 5, key: "ferramentas", title: "Ferramentas aprimoradas", description: "Martelos e tenazes novos na parede." },
  { level: 10, key: "fornalha", title: "Fornalha avançada", description: "Chamas mais fortes e um fole de couro." },
  { level: 15, key: "bancada", title: "Bancada especial", description: "Bancada de engenheiro com pergaminhos e cristais." },
  { level: 20, key: "estandarte", title: "Estandarte do desenvolvedor", description: "Estandarte com o símbolo do código." },
  { level: 25, key: "oficina_expandida", title: "Oficina expandida", description: "A forja ganha um segundo ambiente iluminado." },
] as const;

/** Mensagens de commit que não rendem XP (o commit continua registrado). */
const TRIVIAL_COMMIT = /^(merge (branch|pull request|remote-tracking)|wip\b|\.|fix typo|typo|update readme\.?md?)$/i;
const MERGE_COMMIT = /^merge (branch|pull request|remote-tracking)/i;

export class CodeForgeError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 | 422 | 429 | 502 = 400) {
    super(message);
  }
}

/* ───────────────────────────── Cliente GitHub ───────────────────────────── */

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; headers: { get(name: string): string | null }; json(): Promise<unknown> }>;
let githubFetch: FetchLike = (url, init) => fetch(url, init) as unknown as ReturnType<FetchLike>;
/** Só para testes: troca o fetch do GitHub por um falso. */
export function setGithubFetchForTests(f: FetchLike | null) {
  githubFetch = f ?? ((url, init) => fetch(url, init) as unknown as ReturnType<FetchLike>);
}

class RateLimited extends Error {
  constructor(public resetAt: string | null) {
    super("rate_limited");
  }
}

async function gh<T>(path: string, token: string | null, init?: { method?: string; body?: string }): Promise<T> {
  const res = await githubFetch(`https://api.github.com${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "LifeOS-Forja-do-Codigo",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body,
  });
  if (res.status === 429 || (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0")) {
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    throw new RateLimited(Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000).toISOString() : null);
  }
  if (res.status === 401) throw new CodeForgeError("O token do GitHub foi recusado (expirado ou sem permissão). Conecte de novo.", 422);
  if (res.status === 404) throw new CodeForgeError("Não encontrado no GitHub.", 404);
  if (!res.ok) throw new CodeForgeError(`O GitHub respondeu ${res.status}.`, 502);
  return (await res.json()) as T;
}

/* ───────────────────────────── Integração ───────────────────────────── */

interface IntegrationRow {
  owner_id: string;
  username: string;
  mode: "public" | "token";
  token_enc: string | null;
  rules_json: string;
  forge_level: number;
  stats_json: string;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  coverage_from: string | null;
}

export type CodeRules = Record<CodeKind, boolean>;
const DEFAULT_RULES: CodeRules = { commit: true, pr_opened: true, pr_merged: true, issue_closed: true, release: true };

async function getIntegration(db: Client, ownerId: string): Promise<IntegrationRow | null> {
  const r = await db.execute({ sql: "SELECT * FROM code_integrations WHERE owner_id = ?", args: [ownerId] });
  return (r.rows[0] as unknown as IntegrationRow | undefined) ?? null;
}

const parse = <T>(raw: unknown, fb: T): T => {
  try {
    return typeof raw === "string" && raw ? { ...fb, ...(JSON.parse(raw) as object) } : fb;
  } catch {
    return fb;
  }
};

const USERNAME = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;

/**
 * Conecta: modo público (só o usuário) ou com token pessoal só-leitura. O
 * token é validado no GitHub, criptografado e nunca devolvido ao frontend.
 */
export async function connectGithub(db: Client, ownerId: string, input: { username?: string; token?: string | null }) {
  const token = input.token?.trim() || null;
  let username = input.username?.trim() ?? "";
  if (token) {
    const me = await gh<{ login: string }>("/user", token).catch((e) => {
      if (e instanceof CodeForgeError && e.status === 404) throw new CodeForgeError("Token inválido.", 422);
      throw e;
    });
    username = me.login;
  } else {
    if (!USERNAME.test(username)) throw new CodeForgeError("Nome de usuário do GitHub inválido.");
    await gh<{ login: string }>(`/users/${encodeURIComponent(username)}`, null).then((u) => (username = u.login));
  }
  await db.execute({
    sql: `INSERT INTO code_integrations (owner_id, username, mode, token_enc) VALUES (?, ?, ?, ?)
          ON CONFLICT (owner_id) DO UPDATE SET username = excluded.username, mode = excluded.mode, token_enc = excluded.token_enc,
            last_sync_status = NULL, last_sync_error = NULL, updated_at = datetime('now')`,
    args: [ownerId, username, token ? "token" : "public", token ? encryptSecret(token) : null],
  });
  await recordWorldEvent(db, ownerId, { type: "code.connected", title: `Forja do Código conectada ao GitHub (${username})` });
  return { username, mode: token ? "token" : "public" };
}

/** Desconecta e apaga o token. Atividade já importada (e o XP dela) continua — é histórico real. */
export async function disconnectGithub(db: Client, ownerId: string) {
  await db.batch(
    [
      { sql: "DELETE FROM code_integrations WHERE owner_id = ?", args: [ownerId] },
      { sql: "DELETE FROM code_repos WHERE owner_id = ?", args: [ownerId] },
      { sql: "DELETE FROM code_contrib_days WHERE owner_id = ?", args: [ownerId] },
    ],
    "write",
  );
}

export async function updateRules(db: Client, ownerId: string, rules: Partial<CodeRules>) {
  const integ = await getIntegration(db, ownerId);
  if (!integ) throw new CodeForgeError("Conecte o GitHub primeiro.", 404);
  const next = { ...parse<CodeRules>(integ.rules_json, DEFAULT_RULES), ...rules };
  await db.execute({ sql: "UPDATE code_integrations SET rules_json = ?, updated_at = datetime('now') WHERE owner_id = ?", args: [JSON.stringify(next), ownerId] });
  return next;
}

export async function updateRepo(db: Client, ownerId: string, repoId: number, patch: { monitored?: boolean; favorite?: boolean }) {
  const sets: string[] = [];
  const args: Array<string | number> = [];
  if (patch.monitored !== undefined) (sets.push("monitored = ?"), args.push(patch.monitored ? 1 : 0));
  if (patch.favorite !== undefined) (sets.push("favorite = ?"), args.push(patch.favorite ? 1 : 0));
  if (!sets.length) return;
  const r = await db.execute({ sql: `UPDATE code_repos SET ${sets.join(", ")}, updated_at = datetime('now') WHERE owner_id = ? AND repo_id = ?`, args: [...args, ownerId, repoId] });
  if (!r.rowsAffected) throw new CodeForgeError("Repositório não encontrado.", 404);
}

/* ───────────────────────────── Sincronização ───────────────────────────── */

interface Activity {
  kind: CodeKind;
  externalId: string;
  repo: string;
  title: string | null;
  url: string | null;
  at: string;
}

const MIN_SYNC_INTERVAL_MS = 2 * 60 * 1000;
const BACKFILL_DAYS = 90;
const MAX_REPOS_PER_SYNC = 12;

type GhRepo = { id: number; full_name: string; description: string | null; language: string | null; html_url: string; private: boolean; pushed_at: string | null; fork: boolean };
type GhCommit = { sha: string; html_url: string; commit: { message: string; author: { date: string } | null; committer: { date: string } | null } };
type GhSearch = { total_count: number; items: Array<{ id: number; number: number; title: string; html_url: string; created_at: string; closed_at: string | null; repository_url: string; pull_request?: { merged_at: string | null } }> };
type GhEvent = { id: string; type: string; created_at: string; repo: { name: string }; payload: { action?: string; issue?: { id: number; title: string; html_url: string; pull_request?: unknown }; release?: { id: number; name: string | null; tag_name: string; html_url: string } } };

const repoFromUrl = (u: string) => u.replace("https://api.github.com/repos/", "");

async function collect(username: string, token: string | null, since: string, monitored: string[]) {
  const acts: Activity[] = [];
  const sinceDay = since.slice(0, 10);
  // Commits por repositório monitorado (fonte mais confiável para commits).
  for (const repo of monitored.slice(0, MAX_REPOS_PER_SYNC)) {
    const commits = await gh<GhCommit[]>(`/repos/${repo}/commits?author=${encodeURIComponent(username)}&since=${encodeURIComponent(since)}&per_page=100`, token).catch((e) => {
      if (e instanceof CodeForgeError && (e.status === 404 || e.status === 502)) return [] as GhCommit[]; // repositório vazio/removido
      throw e;
    });
    for (const c of commits) acts.push({ kind: "commit", externalId: c.sha, repo, title: c.commit.message.split("\n")[0]!.slice(0, 200), url: c.html_url, at: c.commit.author?.date ?? c.commit.committer?.date ?? since });
  }
  // PRs abertas e mescladas (Search API cobre repositórios de terceiros também).
  const opened = await gh<GhSearch>(`/search/issues?q=${encodeURIComponent(`type:pr author:${username} created:>=${sinceDay}`)}&per_page=100`, token);
  for (const it of opened.items) acts.push({ kind: "pr_opened", externalId: String(it.id), repo: repoFromUrl(it.repository_url), title: it.title, url: it.html_url, at: it.created_at });
  const merged = await gh<GhSearch>(`/search/issues?q=${encodeURIComponent(`type:pr author:${username} is:merged merged:>=${sinceDay}`)}&per_page=100`, token);
  for (const it of merged.items) acts.push({ kind: "pr_merged", externalId: String(it.id), repo: repoFromUrl(it.repository_url), title: it.title, url: it.html_url, at: it.pull_request?.merged_at ?? it.closed_at ?? it.created_at });
  const openNow = await gh<GhSearch>(`/search/issues?q=${encodeURIComponent(`type:pr author:${username} is:open`)}&per_page=1`, token);
  // Issues fechadas pelo usuário e releases publicadas (eventos recentes).
  for (let page = 1; page <= 3; page++) {
    const events = await gh<GhEvent[]>(`/users/${encodeURIComponent(username)}/events?per_page=100&page=${page}`, token).catch(() => [] as GhEvent[]);
    for (const e of events) {
      if (e.created_at < since) continue;
      if (e.type === "IssuesEvent" && e.payload.action === "closed" && e.payload.issue && !e.payload.issue.pull_request)
        acts.push({ kind: "issue_closed", externalId: String(e.payload.issue.id), repo: e.repo.name, title: e.payload.issue.title, url: e.payload.issue.html_url, at: e.created_at });
      if (e.type === "ReleaseEvent" && e.payload.action === "published" && e.payload.release)
        acts.push({ kind: "release", externalId: String(e.payload.release.id), repo: e.repo.name, title: e.payload.release.name || e.payload.release.tag_name, url: e.payload.release.html_url, at: e.created_at });
    }
    if (events.length < 100) break;
  }
  return { acts, openPrs: openNow.total_count };
}

type GqlCalendar = { data?: { viewer?: { contributionsCollection: { contributionCalendar: { totalContributions: number; weeks: Array<{ contributionDays: Array<{ date: string; contributionCount: number }> }> } } } } };

/** Sincroniza. Idempotente; respeita intervalo mínimo e rate limit do GitHub. */
export async function syncGithub(db: Client, ownerId: string, opts: { force?: boolean } = {}) {
  const integ = await getIntegration(db, ownerId);
  if (!integ) throw new CodeForgeError("Conecte o GitHub primeiro.", 404);
  if (!opts.force && integ.last_sync_at && Date.now() - Date.parse(integ.last_sync_at) < MIN_SYNC_INTERVAL_MS) {
    throw new CodeForgeError("A Forja acabou de sincronizar. Aguarde alguns minutos.", 429);
  }
  const token = integ.mode === "token" && integ.token_enc ? decryptSecret(integ.token_enc) : null;
  const { tz, today } = await userDayContext(db, ownerId);
  const rules = parse<CodeRules>(integ.rules_json, DEFAULT_RULES);
  const nowIso = new Date().toISOString();
  // Janela: desde a última sincronização (com 2 dias de folga) ou 90 dias na primeira vez.
  const since = integ.last_sync_at ? new Date(Date.parse(integ.last_sync_at) - 2 * 86_400_000).toISOString() : new Date(Date.now() - BACKFILL_DAYS * 86_400_000).toISOString();
  const coverageFrom = integ.coverage_from ?? since.slice(0, 10);

  try {
    // Repositórios (novos entram monitorados; preferências do usuário são preservadas).
    const repos = token
      ? await gh<GhRepo[]>("/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator", token)
      : await gh<GhRepo[]>(`/users/${encodeURIComponent(integ.username)}/repos?per_page=100&sort=pushed`, null);
    if (repos.length) {
      await db.batch(
        repos.map((r) => ({
          sql: `INSERT INTO code_repos (owner_id, repo_id, full_name, description, language, html_url, is_private, pushed_at, monitored)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (owner_id, repo_id) DO UPDATE SET full_name = excluded.full_name, description = excluded.description, language = excluded.language,
                  html_url = excluded.html_url, is_private = excluded.is_private, pushed_at = excluded.pushed_at, updated_at = datetime('now')`,
          args: [ownerId, r.id, r.full_name, r.description, r.language, r.html_url, r.private ? 1 : 0, r.pushed_at, r.fork ? 0 : 1],
        })),
        "write",
      );
    }
    const mon = await db.execute({ sql: "SELECT full_name FROM code_repos WHERE owner_id = ? AND monitored = 1 AND (pushed_at IS NULL OR pushed_at >= ?) ORDER BY pushed_at DESC", args: [ownerId, since] });
    const monitored = mon.rows.map((r) => String(r.full_name));
    const allMonitored = new Set((await db.execute({ sql: "SELECT full_name FROM code_repos WHERE owner_id = ? AND monitored = 1", args: [ownerId] })).rows.map((r) => String(r.full_name)));
    const { acts, openPrs } = await collect(integ.username, token, since, monitored);

    // Calendário oficial de contribuições (12 meses) — só com token.
    if (token) {
      const cal = await gh<GqlCalendar>("/graphql", token, { method: "POST", body: JSON.stringify({ query: "query { viewer { contributionsCollection { contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } } } } }" }) }).catch(() => null);
      const days = cal?.data?.viewer?.contributionsCollection.contributionCalendar.weeks.flatMap((w) => w.contributionDays) ?? [];
      for (let i = 0; i < days.length; i += 100) {
        await db.batch(
          days.slice(i, i + 100).map((d) => ({ sql: "INSERT INTO code_contrib_days (owner_id, day_key, count) VALUES (?, ?, ?) ON CONFLICT (owner_id, day_key) DO UPDATE SET count = excluded.count", args: [ownerId, d.date, d.contributionCount] })),
          "write",
        );
      }
    }

    const imported = await importActivities(db, ownerId, acts, { tz, rules, monitored: allMonitored });
    await db.execute({
      sql: `UPDATE code_integrations SET last_sync_at = ?, last_sync_status = 'ok', last_sync_error = NULL, coverage_from = ?, stats_json = ?, updated_at = datetime('now') WHERE owner_id = ?`,
      args: [nowIso, coverageFrom, JSON.stringify({ openPrs }), ownerId],
    });
    await checkLevelUp(db, ownerId, integ.forge_level, today);
    return { ok: true as const, ...imported };
  } catch (err) {
    if (err instanceof RateLimited) {
      await db.execute({ sql: "UPDATE code_integrations SET last_sync_status = 'rate_limited', last_sync_error = ? WHERE owner_id = ?", args: [err.resetAt ? `Limite do GitHub atingido; libera às ${err.resetAt}.` : "Limite do GitHub atingido.", ownerId] });
      throw new CodeForgeError(`O GitHub limitou as consultas por enquanto${err.resetAt ? ` (libera às ${new Date(err.resetAt).toLocaleTimeString("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" })})` : ""}. ${token ? "" : "Conectar um token aumenta o limite."}`.trim(), 429);
    }
    const msg = err instanceof Error ? err.message : "Falha desconhecida.";
    await db.execute({ sql: "UPDATE code_integrations SET last_sync_status = 'error', last_sync_error = ? WHERE owner_id = ?", args: [msg.slice(0, 300), ownerId] });
    throw err;
  }
}

/**
 * Grava atividades e concede XP com tetos diários. Exportada para testes:
 * a deduplicação é por (kind, external_id) — repetir a lista não muda nada.
 */
export async function importActivities(db: Client, ownerId: string, acts: Activity[], ctx: { tz: string; rules: CodeRules; monitored: Set<string> }) {
  // Mesmo commit pode aparecer em dois repositórios (fork): o SHA é a chave.
  const seen = new Set<string>();
  const unique = acts.filter((a) => {
    const k = `${a.kind}:${a.externalId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  unique.sort((a, b) => a.at.localeCompare(b.at));
  // XP já concedido por dia e tipo (para respeitar o teto diário).
  const used = new Map<string, number>();
  const prev = await db.execute({ sql: "SELECT day_key, kind, COUNT(*) AS n FROM code_events WHERE owner_id = ? AND xp > 0 GROUP BY day_key, kind", args: [ownerId] });
  for (const r of prev.rows) used.set(`${String(r.day_key)}:${String(r.kind)}`, Number(r.n));
  let inserted = 0;
  let xpTotal = 0;
  const merged: Activity[] = [];
  const releases: Activity[] = [];
  for (const a of unique) {
    const day = localDayOfStored(a.at, ctx.tz);
    const capKey = `${day}:${a.kind}`;
    const rule = CODE_XP[a.kind];
    const trivial = a.kind === "commit" && (MERGE_COMMIT.test(a.title ?? "") || TRIVIAL_COMMIT.test((a.title ?? "").trim()));
    // Repositório que o usuário tirou da Forja não pontua (a atividade fica registrada).
    const repoCounts = ctx.monitored.size === 0 || ctx.monitored.has(a.repo) || a.kind !== "commit";
    const eligible = ctx.rules[a.kind] && !trivial && repoCounts && (used.get(capKey) ?? 0) < rule.dailyCap;
    const xp = eligible ? rule.xp : 0;
    const r = await db.execute({
      sql: `INSERT INTO code_events (id, owner_id, kind, external_id, repo_full_name, title, url, occurred_at, day_key, xp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (owner_id, kind, external_id) DO NOTHING`,
      args: [nanoid(), ownerId, a.kind, a.externalId, a.repo, a.title, a.url, a.at, day, xp],
    });
    if (!r.rowsAffected) continue;
    inserted++;
    if (xp > 0) {
      used.set(capKey, (used.get(capKey) ?? 0) + 1);
      const granted = await award(db, ownerId, { sourceType: "code", sourceId: `${a.kind}:${a.externalId}`, eventType: a.kind, xp, coins: Math.floor(xp / 10), label: `${rule.label} · ${a.repo}` }, day);
      if (granted) xpTotal += xp;
    }
    if (a.kind === "pr_merged") merged.push(a);
    if (a.kind === "release") releases.push(a);
  }
  // Crônica: só marcos (PR mesclada, release) — commits viram um resumo por sincronização.
  for (const m of merged.slice(-5)) await recordWorldEvent(db, ownerId, { type: "github.pull_request_merged", title: `PR mesclada em ${m.repo}`, detail: m.title, refId: m.externalId });
  for (const rel of releases) await recordWorldEvent(db, ownerId, { type: "github.release_published", title: `Release em ${rel.repo}`, detail: rel.title, refId: rel.externalId });
  const commits = unique.filter((a) => a.kind === "commit").length;
  if (inserted > 0 && commits > 0) await recordWorldEvent(db, ownerId, { type: "github.commit_recorded", title: `A Forja registrou ${inserted} atividade(s) do GitHub`, detail: `+${xpTotal} XP de código` });
  return { inserted, xp: xpTotal };
}

async function totalCodeXp(db: Client, ownerId: string) {
  const r = await db.execute({ sql: "SELECT COALESCE(SUM(xp), 0) AS xp FROM xp_events WHERE owner_id = ? AND source_type = 'code'", args: [ownerId] });
  return Number(r.rows[0]?.xp ?? 0);
}

async function checkLevelUp(db: Client, ownerId: string, prevLevel: number, today: string) {
  const { level } = forgeLevelFromXp(await totalCodeXp(db, ownerId));
  if (level <= prevLevel) return;
  await db.execute({ sql: "UPDATE code_integrations SET forge_level = ? WHERE owner_id = ?", args: [level, ownerId] });
  const unlocked = FORGE_UNLOCKS.filter((u) => u.level > prevLevel && u.level <= level);
  await recordWorldEvent(db, ownerId, { type: "forge.level_up", title: `A Forja do Código chegou ao nível ${level}`, detail: unlocked.length ? `Desbloqueado: ${unlocked.map((u) => u.title).join(", ")}` : null, meta: { level, day: today } });
}

/* ───────────────────────────── Leitura ───────────────────────────── */

export async function getForgeOverview(db: Client, ownerId: string, range: "90d" | "6m" | "12m" = "12m") {
  const integ = await getIntegration(db, ownerId);
  const { today } = await userDayContext(db, ownerId);
  const xp = await totalCodeXp(db, ownerId);
  const lvl = forgeLevelFromXp(xp);
  const weekStart = shiftDayKey(today, -6);
  const [weekXp, counts, repos, recent, contrib, evDays] = await Promise.all([
    db.execute({ sql: "SELECT COALESCE(SUM(xp), 0) AS xp FROM xp_events WHERE owner_id = ? AND source_type = 'code' AND day_key >= ?", args: [ownerId, weekStart] }),
    db.execute({ sql: "SELECT kind, COUNT(*) AS n FROM code_events WHERE owner_id = ? GROUP BY kind", args: [ownerId] }),
    db.execute({
      sql: `SELECT r.repo_id, r.full_name, r.description, r.language, r.html_url, r.is_private, r.pushed_at, r.monitored, r.favorite,
                   COALESCE(SUM(CASE WHEN e.kind = 'commit' THEN 1 ELSE 0 END), 0) AS commits,
                   COALESCE(SUM(CASE WHEN e.kind IN ('pr_opened','pr_merged') THEN 1 ELSE 0 END), 0) AS prs,
                   COALESCE(SUM(CASE WHEN e.kind = 'issue_closed' THEN 1 ELSE 0 END), 0) AS issues,
                   COALESCE(SUM(e.xp), 0) AS xp, MAX(e.occurred_at) AS last_activity
              FROM code_repos r LEFT JOIN code_events e ON e.owner_id = r.owner_id AND e.repo_full_name = r.full_name
             WHERE r.owner_id = ? GROUP BY r.repo_id ORDER BY r.favorite DESC, COALESCE(MAX(e.occurred_at), r.pushed_at) DESC LIMIT 60`,
      args: [ownerId],
    }),
    db.execute({ sql: "SELECT kind, repo_full_name, title, url, occurred_at, xp FROM code_events WHERE owner_id = ? ORDER BY occurred_at DESC LIMIT 25", args: [ownerId] }),
    db.execute({ sql: "SELECT day_key, count FROM code_contrib_days WHERE owner_id = ? AND day_key >= ? ORDER BY day_key", args: [ownerId, shiftDayKey(today, -370)] }),
    db.execute({ sql: "SELECT day_key, COUNT(*) AS n FROM code_events WHERE owner_id = ? AND day_key >= ? GROUP BY day_key", args: [ownerId, shiftDayKey(today, -370)] }),
  ]);
  const byKind = Object.fromEntries(CODE_KINDS.map((k) => [k, 0])) as Record<CodeKind, number>;
  for (const r of counts.rows) byKind[String(r.kind) as CodeKind] = Number(r.n);
  const rangeDays = range === "90d" ? 90 : range === "6m" ? 182 : 365;
  const from = shiftDayKey(today, -(rangeDays - 1));
  // Mapa de calor: calendário oficial (token) ou atividade importada (público), com a janela coberta explícita.
  const official = contrib.rows.length > 0;
  const source = official ? contrib.rows.map((r) => [String(r.day_key), Number(r.count)] as const) : evDays.rows.map((r) => [String(r.day_key), Number(r.n)] as const);
  const map = new Map(source);
  const coveredFrom = official ? (contrib.rows[0] ? String(contrib.rows[0].day_key) : from) : integ?.coverage_from ?? null;
  const days: Array<{ day: string; count: number | null }> = [];
  for (let d = from; d <= today; d = shiftDayKey(d, 1)) days.push({ day: d, count: coveredFrom && d >= coveredFrom ? map.get(d) ?? 0 : null });
  // Sequência: dias seguidos com atividade, terminando hoje ou ontem.
  let streak = 0;
  let cursor = map.get(today) ? today : shiftDayKey(today, -1);
  while ((map.get(cursor) ?? 0) > 0) {
    streak++;
    cursor = shiftDayKey(cursor, -1);
  }
  const stats = parse<{ openPrs: number | null }>(integ?.stats_json, { openPrs: null });
  return {
    connected: !!integ,
    integration: integ
      ? {
          username: integ.username,
          mode: integ.mode,
          rules: parse<CodeRules>(integ.rules_json, DEFAULT_RULES),
          lastSyncAt: integ.last_sync_at,
          lastSyncStatus: integ.last_sync_status,
          lastSyncError: integ.last_sync_error,
          coverageFrom: integ.coverage_from,
        }
      : null,
    xp: { total: xp, week: Number(weekXp.rows[0]?.xp ?? 0), level: lvl.level, currentLevelXp: lvl.current, nextLevelXp: lvl.next },
    counts: { ...byKind, openPrs: stats.openPrs },
    streak,
    unlocks: FORGE_UNLOCKS.map((u) => ({ ...u, unlocked: lvl.level >= u.level })),
    rules: CODE_XP,
    heatmap: { source: official ? "github_calendar" : "imported_activity", coveredFrom, range, days },
    repos: repos.rows.map((r) => ({
      id: Number(r.repo_id),
      fullName: String(r.full_name),
      description: r.description == null ? null : String(r.description),
      language: r.language == null ? null : String(r.language),
      url: String(r.html_url),
      private: Number(r.is_private) === 1,
      pushedAt: r.pushed_at == null ? null : String(r.pushed_at),
      monitored: Number(r.monitored) === 1,
      favorite: Number(r.favorite) === 1,
      commits: Number(r.commits),
      prs: Number(r.prs),
      issues: Number(r.issues),
      xp: Number(r.xp),
      lastActivity: r.last_activity == null ? null : String(r.last_activity),
    })),
    recent: recent.rows.map((r) => ({ kind: String(r.kind) as CodeKind, repo: String(r.repo_full_name), title: r.title == null ? null : String(r.title), url: r.url == null ? null : String(r.url), at: String(r.occurred_at), xp: Number(r.xp) })),
  };
}

/** Eventos para a Timeline/Crônica geral: marcos (PR mesclada, release) e dias de commit agrupados. */
export async function codeTimelineEvents(db: Client, ownerId: string, from: string, to: string) {
  const r = await db.execute({
    sql: `SELECT kind, repo_full_name, title, occurred_at, external_id, day_key FROM code_events
           WHERE owner_id = ? AND day_key >= ? AND day_key <= ? AND kind IN ('pr_merged', 'release')`,
    args: [ownerId, from, to],
  });
  const c = await db.execute({
    sql: `SELECT day_key, COUNT(*) AS n, MAX(occurred_at) AS at, GROUP_CONCAT(DISTINCT repo_full_name) AS repos FROM code_events
           WHERE owner_id = ? AND kind = 'commit' AND day_key >= ? AND day_key <= ? GROUP BY day_key`,
    args: [ownerId, from, to],
  });
  return [
    ...r.rows.map((x) => ({
      type: "code",
      icon: x.kind === "release" ? "🚀" : "🔀",
      id: `code-${String(x.kind)}-${String(x.external_id)}`,
      label: `${x.kind === "release" ? "Release" : "PR mesclada"} em ${String(x.repo_full_name)}${x.title ? `: ${String(x.title)}` : ""}`,
      at: String(x.occurred_at),
    })),
    ...c.rows.map((x) => ({ type: "code", icon: "⚒️", id: `code-commits-${String(x.day_key)}`, label: `${Number(x.n)} commit(s) em ${String(x.repos)}`, at: String(x.at) })),
  ];
}
