import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { award } from "./gamificationService.js";
import { shiftDayKey, userDayContext } from "./localDayService.js";
import { fetchJson } from "./integrationsCore.js";
import { recordWorldEvent } from "./livingWorldService.js";
import { abstractFromInverted, lookupDoi, normalizeDoi, type PaperAuthor } from "./researchProviders.js";
import { addPaperFromMetadata, type PaperDraft } from "./researchLibraryService.js";

/**
 * Radar de Artigos (Biblioteca do Mestrado) — toda semana procura artigos
 * novos nos temas do usuário no arXiv (preprints) e no OpenAlex (publicados),
 * ambos públicos e sem chave. O usuário salva com um clique ou dispensa.
 *
 * - Um artigo aparece uma única vez (chave estável: DOI, id do arXiv ou do OpenAlex),
 *   nunca reaparece em outra semana e não aparece se já estiver na biblioteca.
 * - Triagem completa da semana (nenhum "novo" restante) → +25 XP e 5 moedas,
 *   uma vez por semana (xp_events research/radar:<semana>/radar_triaged).
 * - Salvar usa o mesmo XP de "artigo salvo" da biblioteca (com o teto diário).
 */

export const RADAR_LIMITS = { maxTopics: 6, perSourcePerTopic: 5, maxPerWeek: 30, lookbackDays: 14, rescanMinutes: 60 } as const;
export const RADAR_REWARD = { xp: 25, coins: 5 } as const;

export class RadarError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 | 422 | 429 | 502 = 400) {
    super(message);
  }
}

/** Segunda-feira da semana (dia local). */
export function weekKeyOf(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  return shiftDayKey(day, -((d.getUTCDay() + 6) % 7));
}

export interface RadarCandidate {
  key: string;
  source: "arxiv" | "openalex";
  title: string;
  authors: string[];
  published: string | null;
  venue: string | null;
  doi: string | null;
  arxivId: string | null;
  openalexId: string | null;
  abstract: string | null;
  url: string | null;
  pdfUrl: string | null;
  citedBy: number | null;
}

const ARXIV_DOI = /^10\.48550\/arxiv\.(.+)$/i;
const stripVersion = (id: string) => id.replace(/v\d+$/i, "");

/** Chave estável: preprint do arXiv tem a mesma chave venha de onde vier. */
export function candidateKey(c: Pick<RadarCandidate, "doi" | "arxivId" | "openalexId">): string {
  const doi = c.doi ? normalizeDoi(c.doi) : null;
  const arxiv = c.arxivId ? stripVersion(c.arxivId) : doi?.match(ARXIV_DOI)?.[1] ? stripVersion(doi.match(ARXIV_DOI)![1]!) : null;
  if (arxiv) return `arxiv:${arxiv.toLowerCase()}`;
  if (doi) return `doi:${doi}`;
  return `oa:${c.openalexId ?? "?"}`;
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]!) : null;
};

/** Lê o Atom do arXiv (formato estável e simples; sem dependência de XML). */
export function parseArxivAtom(xml: string): RadarCandidate[] {
  const out: RadarCandidate[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1]!;
    const idUrl = tag(e, "id") ?? "";
    const arxivId = idUrl.match(/arxiv\.org\/abs\/([^\s<]+)/i)?.[1] ?? null;
    const title = tag(e, "title");
    if (!arxivId || !title) continue;
    const authors = [...e.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map((a) => decode(a[1]!)).slice(0, 8);
    const doi = tag(e, "arxiv:doi");
    const pdf = e.match(/<link[^>]*title="pdf"[^>]*href="([^"]+)"/)?.[1] ?? e.match(/<link[^>]*href="([^"]+)"[^>]*title="pdf"/)?.[1] ?? null;
    const c: RadarCandidate = {
      key: "",
      source: "arxiv",
      title,
      authors,
      published: tag(e, "published")?.slice(0, 10) ?? null,
      venue: e.match(/<arxiv:primary_category[^>]*term="([^"]+)"/)?.[1] ? `arXiv · ${e.match(/<arxiv:primary_category[^>]*term="([^"]+)"/)![1]}` : "arXiv",
      doi: doi ? normalizeDoi(doi) : null,
      arxivId: stripVersion(arxivId),
      openalexId: null,
      abstract: tag(e, "summary"),
      url: `https://arxiv.org/abs/${stripVersion(arxivId)}`,
      pdfUrl: pdf ? pdf.replace(/^http:/, "https:") : null,
      citedBy: null,
    };
    c.key = candidateKey(c);
    out.push(c);
  }
  return out;
}

type OAWork = {
  id: string;
  doi: string | null;
  display_name: string | null;
  publication_date: string | null;
  authorships?: Array<{ author: { display_name: string } }>;
  primary_location?: { landing_page_url?: string | null; pdf_url?: string | null; source?: { display_name?: string } | null } | null;
  cited_by_count?: number;
  abstract_inverted_index?: Record<string, number[]> | null;
};

export function mapOpenAlex(w: OAWork): RadarCandidate | null {
  if (!w.display_name) return null;
  const doi = w.doi ? normalizeDoi(w.doi) : null;
  const c: RadarCandidate = {
    key: "",
    source: "openalex",
    title: w.display_name.slice(0, 500),
    authors: (w.authorships ?? []).map((a) => a.author.display_name).slice(0, 8),
    published: w.publication_date ?? null,
    venue: w.primary_location?.source?.display_name ?? null,
    doi,
    arxivId: null,
    openalexId: w.id.replace("https://openalex.org/", ""),
    abstract: abstractFromInverted(w.abstract_inverted_index)?.slice(0, 4000) ?? null,
    url: w.primary_location?.landing_page_url ?? (doi ? `https://doi.org/${doi}` : null),
    pdfUrl: w.primary_location?.pdf_url ?? null,
    citedBy: w.cited_by_count ?? null,
  };
  c.key = candidateKey(c);
  return c;
}

async function searchArxiv(q: string, from: string): Promise<RadarCandidate[]> {
  const phrase = q.includes(" ") ? `"${q}"` : q;
  const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(`all:${phrase}`)}&sortBy=submittedDate&sortOrder=descending&max_results=${RADAR_LIMITS.perSourcePerTopic * 2}`;
  const xml = await fetchJson<string>(url, { headers: { "User-Agent": "LifeOS-Radar (https://github.com/ViniciusKanh/LifeOs)" } }, { label: "arXiv", responseType: "text", timeoutMs: 10_000, retries: 1 });
  return parseArxivAtom(xml ?? "").filter((c) => !c.published || c.published >= from).slice(0, RADAR_LIMITS.perSourcePerTopic);
}

async function searchOpenAlex(q: string, from: string): Promise<RadarCandidate[]> {
  const select = "id,doi,display_name,publication_date,authorships,primary_location,cited_by_count,abstract_inverted_index";
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(q)}&filter=from_publication_date:${from},type:article|preprint|proceedings-article&sort=publication_date:desc&per-page=${RADAR_LIMITS.perSourcePerTopic}&select=${select}`;
  const r = await fetchJson<{ results: OAWork[] }>(url, { headers: { Accept: "application/json", "User-Agent": "LifeOS-Radar (https://github.com/ViniciusKanh/LifeOs)" } }, { label: "OpenAlex", timeoutMs: 10_000, retries: 1 });
  return (r?.results ?? []).map(mapOpenAlex).filter((x): x is RadarCandidate => !!x);
}

export async function listTopics(db: Client, ownerId: string) {
  const r = await db.execute({ sql: "SELECT id, query FROM radar_topics WHERE owner_id = ? ORDER BY created_at", args: [ownerId] });
  return r.rows.map((x) => ({ id: String(x.id), query: String(x.query) }));
}

export async function addTopic(db: Client, ownerId: string, query: string) {
  const q = query.trim().replace(/\s+/g, " ");
  if (q.length < 3) throw new RadarError("Use pelo menos 3 letras no tema.", 422);
  const topics = await listTopics(db, ownerId);
  if (topics.length >= RADAR_LIMITS.maxTopics) throw new RadarError(`O Radar acompanha até ${RADAR_LIMITS.maxTopics} temas.`, 409);
  if (topics.some((t) => t.query.toLowerCase() === q.toLowerCase())) throw new RadarError("Esse tema já está no Radar.", 409);
  const id = nanoid();
  await db.execute({ sql: "INSERT INTO radar_topics (id, owner_id, query) VALUES (?, ?, ?)", args: [id, ownerId, q.slice(0, 80)] });
  return { id, query: q.slice(0, 80) };
}

export async function deleteTopic(db: Client, ownerId: string, id: string) {
  const r = await db.execute({ sql: "DELETE FROM radar_topics WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  if (!r.rowsAffected) throw new RadarError("Tema não encontrado.", 404);
}

/** Grava candidatos novos (exportada para testes). Devolve quantos entraram. */
export async function storeCandidates(db: Client, ownerId: string, week: string, byTopic: Array<{ topicId: string; query: string; items: RadarCandidate[] }>) {
  // O que já está na biblioteca não entra no Radar.
  const lib = await db.execute({ sql: "SELECT p.doi FROM user_papers up JOIN research_papers p ON p.id = up.paper_id WHERE up.owner_id = ? AND p.doi IS NOT NULL", args: [ownerId] });
  const libKeys = new Set(lib.rows.map((r) => candidateKey({ doi: String(r.doi), arxivId: null, openalexId: null })));
  const already = await db.execute({ sql: "SELECT COUNT(*) AS n FROM radar_items WHERE owner_id = ? AND week_key = ?", args: [ownerId, week] });
  let room = RADAR_LIMITS.maxPerWeek - Number(already.rows[0]?.n ?? 0);
  let inserted = 0;
  // Intercala os temas para nenhum dominar a semana.
  const max = Math.max(0, ...byTopic.map((t) => t.items.length));
  for (let i = 0; i < max && room > 0; i++) {
    for (const t of byTopic) {
      const c = t.items[i];
      if (!c || room <= 0 || libKeys.has(c.key)) continue;
      const r = await db.execute({
        sql: `INSERT INTO radar_items (owner_id, item_key, topic_id, topic_query, week_key, source, title, authors_json, published, venue, doi, arxiv_id, openalex_id, abstract, url, pdf_url, cited_by)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (owner_id, item_key) DO NOTHING`,
        args: [ownerId, c.key, t.topicId, t.query, week, c.source, c.title, JSON.stringify(c.authors), c.published, c.venue, c.doi, c.arxivId, c.openalexId, c.abstract, c.url, c.pdfUrl, c.citedBy],
      });
      if (r.rowsAffected) {
        inserted++;
        room--;
      }
    }
  }
  return inserted;
}

/** Varredura da semana. `force` permite repetir (no máximo 1x por hora). */
export async function scanRadar(db: Client, ownerId: string, opts: { force?: boolean } = {}) {
  const topics = await listTopics(db, ownerId);
  if (!topics.length) throw new RadarError("Adicione pelo menos um tema ao Radar.", 422);
  const { today } = await userDayContext(db, ownerId);
  const week = weekKeyOf(today);
  const prev = await db.execute({ sql: "SELECT scanned_at FROM radar_scans WHERE owner_id = ? AND week_key = ?", args: [ownerId, week] });
  if (prev.rows[0]) {
    if (!opts.force) return { week, found: 0, skipped: true as const, errors: [] as string[] };
    const last = Date.parse(String(prev.rows[0].scanned_at).replace(" ", "T") + "Z");
    if (Date.now() - last < RADAR_LIMITS.rescanMinutes * 60_000) throw new RadarError("O Radar já varreu há pouco. Tente de novo em até uma hora.", 429);
  }
  const from = shiftDayKey(today, -RADAR_LIMITS.lookbackDays);
  const errors: string[] = [];
  const results = await Promise.all(
    topics.map(async (t) => {
      const [ax, oa] = await Promise.all([
        searchArxiv(t.query, from).catch(() => {
          errors.push(`arXiv (${t.query})`);
          return [] as RadarCandidate[];
        }),
        searchOpenAlex(t.query, from).catch(() => {
          errors.push(`OpenAlex (${t.query})`);
          return [] as RadarCandidate[];
        }),
      ]);
      // Dentro do tema, alterna as fontes e tira repetidos (o mesmo preprint nas duas).
      const seen = new Set<string>();
      const items: RadarCandidate[] = [];
      for (let i = 0; i < Math.max(ax.length, oa.length); i++)
        for (const c of [ax[i], oa[i]]) if (c && !seen.has(c.key)) (seen.add(c.key), items.push(c));
      return { topicId: t.id, query: t.query, items };
    }),
  );
  if (errors.length === topics.length * 2) throw new RadarError("arXiv e OpenAlex não responderam agora. Tente de novo em instantes.", 502);
  const found = await storeCandidates(db, ownerId, week, results);
  await db.execute({
    sql: `INSERT INTO radar_scans (owner_id, week_key, found, errors_json, scanned_at) VALUES (?, ?, ?, ?, datetime('now'))
          ON CONFLICT (owner_id, week_key) DO UPDATE SET found = radar_scans.found + excluded.found, errors_json = excluded.errors_json, scanned_at = excluded.scanned_at`,
    args: [ownerId, week, found, JSON.stringify(errors)],
  });
  if (found > 0 && !prev.rows[0]) await recordWorldEvent(db, ownerId, { type: "radar.scanned", title: `O Radar de Artigos encontrou ${found} artigo(s) novo(s) na semana`, refId: week });
  return { week, found, skipped: false as const, errors };
}

async function getItem(db: Client, ownerId: string, key: string) {
  const r = await db.execute({ sql: "SELECT * FROM radar_items WHERE owner_id = ? AND item_key = ?", args: [ownerId, key] });
  const row = r.rows[0];
  if (!row) throw new RadarError("Artigo do Radar não encontrado.", 404);
  return row;
}

/** Fecha a triagem da semana se não restar nenhum "novo". Idempotente. */
async function maybeRewardTriage(db: Client, ownerId: string, week: string) {
  const r = await db.execute({ sql: "SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'novo' THEN 1 ELSE 0 END) AS pending FROM radar_items WHERE owner_id = ? AND week_key = ?", args: [ownerId, week] });
  if (Number(r.rows[0]?.total ?? 0) === 0 || Number(r.rows[0]?.pending ?? 0) > 0) return false;
  const { today } = await userDayContext(db, ownerId);
  const ok = await award(db, ownerId, { sourceType: "research", sourceId: `radar:${week}`, eventType: "radar_triaged", xp: RADAR_REWARD.xp, coins: RADAR_REWARD.coins, label: "Triagem do Radar de Artigos concluída" }, today);
  if (ok) await recordWorldEvent(db, ownerId, { type: "radar.triaged", title: "Triagem semanal do Radar de Artigos concluída", detail: `+${RADAR_REWARD.xp} XP`, refId: week });
  return ok;
}

function draftFromRow(row: Record<string, unknown>): PaperDraft {
  const authors = (JSON.parse(String(row.authors_json ?? "[]")) as string[]).map((name): PaperAuthor => {
    const parts = name.trim().split(/\s+/);
    return { name, given: parts.length > 1 ? parts.slice(0, -1).join(" ") : null, family: parts[parts.length - 1] ?? null };
  });
  const arxiv = row.arxiv_id == null ? null : String(row.arxiv_id);
  const published = row.published == null ? null : String(row.published);
  return {
    doi: row.doi == null ? (arxiv ? `10.48550/arxiv.${arxiv.toLowerCase()}` : null) : String(row.doi),
    openalexId: row.openalex_id == null ? null : String(row.openalex_id),
    title: String(row.title),
    authors,
    year: published ? Number(published.slice(0, 4)) : null,
    venue: row.venue == null ? null : String(row.venue),
    volume: null,
    issue: null,
    pages: null,
    publisher: null,
    abstract: row.abstract == null ? null : String(row.abstract),
    keywords: [],
    citedBy: row.cited_by == null ? null : Number(row.cited_by),
    citedBySource: row.cited_by == null ? null : "OpenAlex",
    url: row.url == null ? null : String(row.url),
    oaUrl: row.pdf_url == null ? null : String(row.pdf_url),
    type: arxiv ? "preprint" : "article",
    sources: [String(row.source) === "arxiv" ? "arXiv" : "OpenAlex", "Radar"],
  };
}

export async function decideRadarItem(db: Client, ownerId: string, key: string, decision: "salvar" | "dispensar" | "desfazer") {
  const row = await getItem(db, ownerId, key);
  const week = String(row.week_key);
  if (decision === "desfazer") {
    if (String(row.status) !== "dispensado") throw new RadarError("Só dá para desfazer um artigo dispensado.", 409);
    await db.execute({ sql: "UPDATE radar_items SET status = 'novo', decided_at = NULL WHERE owner_id = ? AND item_key = ?", args: [ownerId, key] });
    return { status: "novo" as const, paperId: null, xp: 0, triaged: false };
  }
  if (String(row.status) !== "novo") throw new RadarError("Esse artigo já foi decidido.", 409);
  if (decision === "dispensar") {
    await db.execute({ sql: "UPDATE radar_items SET status = 'dispensado', decided_at = datetime('now') WHERE owner_id = ? AND item_key = ?", args: [ownerId, key] });
    return { status: "dispensado" as const, paperId: null, xp: 0, triaged: await maybeRewardTriage(db, ownerId, week) };
  }
  // Salvar: metadados completos pelo DOI quando as bases respondem; senão, os do Radar.
  const draft = draftFromRow(row as Record<string, unknown>);
  let meta: PaperDraft = draft;
  if (draft.doi) {
    const found = await lookupDoi(draft.doi).catch(() => null);
    if (found) meta = { ...found.meta, oaUrl: found.meta.oaUrl ?? draft.oaUrl, sources: [...new Set([...found.meta.sources, "Radar"])] };
  }
  const tags = row.topic_query == null ? [] : [String(row.topic_query)];
  const r = await addPaperFromMetadata(db, ownerId, meta, { tags });
  await db.execute({ sql: "UPDATE radar_items SET status = 'salvo', user_paper_id = ?, decided_at = datetime('now') WHERE owner_id = ? AND item_key = ?", args: [r.id, ownerId, key] });
  return { status: "salvo" as const, paperId: r.id, xp: r.xp, triaged: await maybeRewardTriage(db, ownerId, week) };
}

const str = (v: unknown) => (v == null ? null : String(v));

export async function getRadarOverview(db: Client, ownerId: string) {
  const { today } = await userDayContext(db, ownerId);
  const week = weekKeyOf(today);
  const [topics, items, scan, triaged, savedTotal] = await Promise.all([
    listTopics(db, ownerId),
    db.execute({ sql: "SELECT * FROM radar_items WHERE owner_id = ? AND week_key = ? ORDER BY CASE status WHEN 'novo' THEN 0 WHEN 'salvo' THEN 1 ELSE 2 END, published DESC", args: [ownerId, week] }),
    db.execute({ sql: "SELECT scanned_at, found, errors_json FROM radar_scans WHERE owner_id = ? AND week_key = ?", args: [ownerId, week] }),
    db.execute({ sql: "SELECT source_id FROM xp_events WHERE owner_id = ? AND source_type = 'research' AND event_type = 'radar_triaged'", args: [ownerId] }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM radar_items WHERE owner_id = ? AND status = 'salvo'", args: [ownerId] }),
  ]);
  const triagedWeeks = new Set(triaged.rows.map((r) => String(r.source_id).replace("radar:", "")));
  // Sequência de semanas com triagem completa (a atual conta se já fechou; senão começa na anterior).
  let streak = 0;
  let cursor = triagedWeeks.has(week) ? week : shiftDayKey(week, -7);
  while (triagedWeeks.has(cursor)) {
    streak++;
    cursor = shiftDayKey(cursor, -7);
  }
  const list = items.rows.map((r) => ({
    key: String(r.item_key),
    source: String(r.source) as "arxiv" | "openalex",
    topic: str(r.topic_query),
    title: String(r.title),
    authors: JSON.parse(String(r.authors_json ?? "[]")) as string[],
    published: str(r.published),
    venue: str(r.venue),
    doi: str(r.doi),
    arxivId: str(r.arxiv_id),
    abstract: str(r.abstract),
    url: str(r.url),
    pdfUrl: str(r.pdf_url),
    citedBy: r.cited_by == null ? null : Number(r.cited_by),
    status: String(r.status) as "novo" | "salvo" | "dispensado",
    paperId: str(r.user_paper_id),
  }));
  const s = scan.rows[0];
  return {
    week,
    weekEnd: shiftDayKey(week, 6),
    topics,
    maxTopics: RADAR_LIMITS.maxTopics,
    items: list,
    counts: { total: list.length, novo: list.filter((i) => i.status === "novo").length, salvo: list.filter((i) => i.status === "salvo").length, dispensado: list.filter((i) => i.status === "dispensado").length },
    scan: s ? { at: String(s.scanned_at), found: Number(s.found), errors: JSON.parse(String(s.errors_json ?? "[]")) as string[] } : null,
    needsScan: topics.length > 0 && !s,
    triagedThisWeek: triagedWeeks.has(week),
    triagedWeeks: triagedWeeks.size,
    weekStreak: streak,
    savedTotal: Number(savedTotal.rows[0]?.n ?? 0),
    reward: RADAR_REWARD,
  };
}

/** Cron: varre a semana de quem tem temas e ainda não varreu (limite por execução). */
export async function radarWeeklyScans(db: Client, limit = 10) {
  const r = await db.execute({ sql: "SELECT DISTINCT owner_id FROM radar_topics LIMIT ?", args: [limit] });
  let n = 0;
  for (const row of r.rows) {
    const out = await scanRadar(db, String(row.owner_id)).catch(() => null);
    if (out && !out.skipped) n++;
  }
  return n;
}
