import type { Client } from "@libsql/client";
import { award } from "./gamificationService.js";
import { normalizeStoredUtc } from "./healthService.js";
import { IntegrationError, fetchJson, getIntegrationSecret, parseSettings } from "./integrationsCore.js";
import { localDayOfStored, localDaysWhere, shiftDayKey, userDayContext } from "./localDayService.js";
import { recordWorldEvent } from "./livingWorldService.js";
import { grantCollectionItem, revokeCollectionItem } from "./adventureCollection.js";

/**
 * Tempo de Jogo (Steam). A Steam não usa OAuth: a conta é identificada pelo
 * login OpenID 2.0 oficial (prova de posse) ou, como alternativa, por SteamID/URL
 * pública. Os dados vêm da Steam Web API com a chave do servidor.
 *
 * A API NÃO fornece histórico diário: o LifeOS grava snapshots do tempo total
 * (appid 0 = soma de todos os jogos, um por dia) e o gráfico diário é a
 * diferença entre snapshots consecutivos. Antes da conexão não existe dado.
 */

const API = "https://api.steampowered.com";
const MIN_SYNC_MS = 30 * 60_000;
const ACH_REFRESH_MS = 12 * 3_600_000;
export const STEAM_XP = { perAchievement: 5, dailyCap: 10 } as const;
export const STEAM_OPENID = "https://steamcommunity.com/openid/login";
export const STEAM_CALLBACK_PATH = "/api/integrations/steam/callback";

export interface SteamSettings {
  weeklyLimitHours: number | null;
  achievementXp: boolean;
}
const DEFAULTS: SteamSettings = { weeklyLimitHours: null, achievementXp: true };

export async function steamApiKey(db: Client) {
  return getIntegrationSecret(db, "steam", "web_api_key", "STEAM_WEB_API_KEY");
}

export function buildSteamLoginUrl(returnTo: string, realm: string) {
  const p = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo,
    "openid.realm": realm,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  return `${STEAM_OPENID}?${p.toString()}`;
}

/** Valida a resposta OpenID direto com a Steam e devolve o SteamID64. */
export async function verifySteamOpenId(query: Record<string, unknown>): Promise<string> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (k.startsWith("openid.") && typeof v === "string") params.set(k, v);
  if (params.get("openid.op_endpoint") !== STEAM_OPENID) throw new IntegrationError(400, "Resposta de login da Steam inválida.");
  params.set("openid.mode", "check_authentication");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(STEAM_OPENID, { method: "POST", body: params, signal: ctrl.signal, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    const text = await res.text();
    if (!/is_valid\s*:\s*true/.test(text)) throw new IntegrationError(401, "A Steam não confirmou o login.");
  } finally {
    clearTimeout(timer);
  }
  const m = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/.exec(String(query["openid.claimed_id"] ?? ""));
  if (!m) throw new IntegrationError(400, "SteamID não encontrado na resposta.");
  return m[1]!;
}

async function steamGet<T>(db: Client, path: string, params: Record<string, string>, opts: { retries?: number; timeoutMs?: number } = {}): Promise<T> {
  const key = await steamApiKey(db);
  if (!key) throw new IntegrationError(503, "Steam não configurada pelo administrador.", "nao_configurado");
  const p = new URLSearchParams({ ...params, key, format: "json" });
  return fetchJson<T>(`${API}/${path}?${p.toString()}`, {}, { label: "Steam", ...opts });
}

/** Aceita SteamID64, URL de perfil (/profiles/ ou /id/) ou nome personalizado. */
export async function resolveSteamId(db: Client, input: string): Promise<string> {
  const s = input.trim();
  const direct = /(?:^|\/profiles\/)(\d{17})\/?$/.exec(s);
  if (direct) return direct[1]!;
  const vanity = /\/id\/([^/]+)\/?$/.exec(s)?.[1] ?? (/^[A-Za-z0-9_-]{2,32}$/.test(s) ? s : null);
  if (!vanity) throw new IntegrationError(400, "Informe o SteamID64, a URL do perfil ou o nome personalizado.");
  const r = await steamGet<{ response: { success: number; steamid?: string } }>(db, "ISteamUser/ResolveVanityURL/v1/", { vanityurl: vanity });
  if (r.response.success !== 1 || !r.response.steamid) throw new IntegrationError(404, "Perfil Steam não encontrado.");
  return r.response.steamid;
}

interface PlayerSummary {
  steamid: string;
  personaname: string;
  avatarfull?: string;
  profileurl?: string;
  communityvisibilitystate?: number;
}

export async function connectSteam(db: Client, ownerId: string, steamId: string) {
  const r = await steamGet<{ response: { players: PlayerSummary[] } }>(db, "ISteamUser/GetPlayerSummaries/v2/", { steamids: steamId });
  const p = r.response.players[0];
  if (!p) throw new IntegrationError(404, "Perfil Steam não encontrado.");
  await db.execute({
    sql: `INSERT INTO steam_accounts (owner_id, steam_id, persona_name, avatar_url, profile_url, visibility) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (owner_id) DO UPDATE SET steam_id = excluded.steam_id, persona_name = excluded.persona_name, avatar_url = excluded.avatar_url,
            profile_url = excluded.profile_url, visibility = excluded.visibility, last_error = NULL,
            connected_at = CASE WHEN steam_accounts.steam_id = excluded.steam_id THEN steam_accounts.connected_at ELSE datetime('now') END`,
    args: [ownerId, steamId, p.personaname, p.avatarfull ?? null, p.profileurl ?? null, p.communityvisibilitystate ?? null],
  });
  await recordWorldEvent(db, ownerId, { type: "steam_connected", title: "Steam conectada à Sala do Aventureiro", detail: p.personaname });
  return syncSteam(db, ownerId, { force: true }).catch(() => null);
}

interface OwnedGame {
  appid: number;
  name?: string;
  playtime_forever: number;
  playtime_2weeks?: number;
  img_icon_url?: string;
  rtime_last_played?: number;
}

/** Snapshot do dia: total geral (appid 0) sempre; por jogo só quando mudou. */
export async function writeSnapshots(db: Client, ownerId: string, day: string, games: OwnedGame[], at: string) {
  const prev = await db.execute({
    sql: `SELECT s.appid, s.playtime_forever FROM steam_playtime_snapshots s
          JOIN (SELECT appid, MAX(day_key) AS d FROM steam_playtime_snapshots WHERE owner_id = ? AND day_key < ? GROUP BY appid) m
            ON m.appid = s.appid AND m.d = s.day_key WHERE s.owner_id = ?`,
    args: [ownerId, day, ownerId],
  });
  const last = new Map(prev.rows.map((r) => [Number(r.appid), Number(r.playtime_forever)]));
  const rows: Array<[number, number]> = [[0, games.reduce((a, g) => a + g.playtime_forever, 0)]];
  for (const g of games) if (g.playtime_forever > 0 && last.get(g.appid) !== g.playtime_forever) rows.push([g.appid, g.playtime_forever]);
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    await db.execute({
      sql: `INSERT INTO steam_playtime_snapshots (owner_id, appid, day_key, playtime_forever, taken_at) VALUES ${chunk.map(() => "(?, ?, ?, ?, ?)").join(", ")}
            ON CONFLICT (owner_id, appid, day_key) DO UPDATE SET playtime_forever = excluded.playtime_forever, taken_at = excluded.taken_at`,
      args: chunk.flatMap(([appid, pf]) => [ownerId, appid, day, pf, at]),
    });
  }
}

/**
 * Tempo por dia a partir dos snapshots do total (appid 0). Dia com snapshot e
 * snapshot no dia anterior = estimativa diária; com intervalo maior, o valor é
 * acumulado e marcado como agrupado. Sem snapshot = sem dado (nunca zero inventado).
 */
export function dailyFromSnapshots(snaps: Array<{ day: string; total: number }>, from: string, to: string) {
  const sorted = [...snaps].sort((a, b) => a.day.localeCompare(b.day));
  const out: Array<{ day: string; minutes: number | null; spanDays: number }> = [];
  for (let d = from; d <= to; d = shiftDayKey(d, 1)) {
    const idx = sorted.findIndex((s) => s.day === d);
    if (idx <= 0) {
      out.push({ day: d, minutes: null, spanDays: 0 });
      continue;
    }
    const prev = sorted[idx - 1]!;
    const span = Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${prev.day}T12:00:00Z`)) / 86_400_000);
    out.push({ day: d, minutes: Math.max(0, sorted[idx]!.total - prev.total), spanDays: span });
  }
  return out;
}

interface PlayerAch {
  apiname: string;
  achieved: number;
  unlocktime: number;
  name?: string;
  description?: string;
}
interface SchemaAch {
  name: string;
  displayName: string;
  description?: string;
  icon?: string;
  icongray?: string;
  hidden?: number;
}

/** Conquistas do jogador + esquema (nomes/ícones). Uma tentativa só: 4xx da Steam é definitivo. */
async function fetchAchievements(db: Client, steamId: string, appid: number) {
  const [player, schema] = await Promise.all([
    steamGet<{ playerstats: { success?: boolean; error?: string; achievements?: PlayerAch[] } }>(
      db,
      "ISteamUserStats/GetPlayerAchievements/v1/",
      { steamid: steamId, appid: String(appid), l: "brazilian" },
      { retries: 0, timeoutMs: 8000 }
    ),
    steamGet<{ game?: { availableGameStats?: { achievements?: SchemaAch[] } } }>(db, "ISteamUserStats/GetSchemaForGame/v2/", { appid: String(appid), l: "brazilian" }, { retries: 0, timeoutMs: 8000 }).catch(() => null),
  ]);
  if (player.playerstats?.success === false) throw new IntegrationError(400, player.playerstats.error ?? "Jogo sem estatísticas.", "requisicao_invalida");
  const list = player.playerstats?.achievements ?? [];
  const schemaList = schema?.game?.availableGameStats?.achievements ?? [];
  const bySchema = new Map(schemaList.map((a) => [a.name, a]));
  const all = list.map((a) => {
    const sc = bySchema.get(a.apiname);
    return {
      apiname: a.apiname,
      achieved: a.achieved === 1,
      unlocktime: a.unlocktime,
      displayName: a.name || sc?.displayName || a.apiname,
      desc: a.description || sc?.description || null,
      icon: sc?.icon ?? null,
      iconGray: sc?.icongray ?? null,
      hidden: sc?.hidden === 1,
    };
  });
  return { total: all.length, all, unlocked: all.filter((a) => a.achieved) };
}

/** Classifica o erro da Steam para mostrar o motivo real na tela. */
function achStatusFromError(err: unknown): { status: "sem_conquistas" | "privado" | "erro"; message: string } {
  if (err instanceof IntegrationError) {
    if (err.code === "requisicao_invalida" || err.code === "nao_encontrado") return { status: "sem_conquistas", message: "Este jogo não tem conquistas na Steam." };
    if (err.code === "acesso_negado") return { status: "privado", message: "A Steam negou acesso às conquistas (detalhes de jogo privados)." };
    return { status: "erro", message: err.message.slice(0, 200) };
  }
  return { status: "erro", message: "Falha inesperada ao ler conquistas." };
}

/** Grava conquistas desbloqueadas novas e dá XP só às desbloqueadas depois da conexão (teto diário). */
async function storeUnlocked(db: Client, ownerId: string, appid: number, unlocked: Array<{ apiname: string; displayName: string; desc: string | null; icon: string | null; unlocktime: number }>, ctx: { connectedMs: number; tz: string; xpOn: boolean }) {
  let added = 0;
  const known = await db.execute({ sql: "SELECT api_name FROM steam_achievements WHERE owner_id = ? AND appid = ?", args: [ownerId, appid] });
  const knownSet = new Set(known.rows.map((r) => String(r.api_name)));
  for (const a of unlocked) {
    if (knownSet.has(a.apiname)) continue;
    await db.execute({
      sql: `INSERT INTO steam_achievements (owner_id, appid, api_name, name, description, icon, unlock_time) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (owner_id, appid, api_name) DO NOTHING`,
      args: [ownerId, appid, a.apiname, a.displayName.slice(0, 200), a.desc?.slice(0, 400) ?? null, a.icon, a.unlocktime],
    });
    added++;
    if (ctx.xpOn && a.unlocktime * 1000 >= ctx.connectedMs) {
      const day = localDayOfStored(new Date(a.unlocktime * 1000).toISOString(), ctx.tz);
      const n = await db.execute({ sql: "SELECT COUNT(*) AS n FROM xp_events WHERE owner_id = ? AND source_type = 'steam' AND day_key = ?", args: [ownerId, day] });
      if (Number(n.rows[0]?.n ?? 0) < STEAM_XP.dailyCap) {
        await award(db, ownerId, { sourceType: "steam", sourceId: `${appid}:${a.apiname}`, eventType: "achievement", xp: STEAM_XP.perAchievement, coins: 0, label: `Conquista Steam: ${a.displayName}`.slice(0, 120) }, day);
      }
    }
  }
  return added;
}

/**
 * Lê conquistas em lotes, dentro de um orçamento de tempo (a função serverless
 * não pode ficar presa). Jogos jogados primeiro; cada jogo é revisitado a cada
 * 12 h. Chamado pela tela em sequência até não restar pendência.
 */
export async function syncSteamAchievements(db: Client, ownerId: string, opts: { budgetMs?: number; force?: boolean } = {}) {
  const acc = await db.execute({ sql: "SELECT steam_id, connected_at, settings_json FROM steam_accounts WHERE owner_id = ?", args: [ownerId] });
  const row = acc.rows[0];
  if (!row) throw new IntegrationError(404, "Steam não conectada.", "desconectado");
  const steamId = String(row.steam_id);
  const settings = parseSettings(row.settings_json, DEFAULTS);
  const connectedMs = Date.parse(normalizeStoredUtc(String(row.connected_at)));
  const { tz } = await userDayContext(db, ownerId);
  const staleBefore = new Date(Date.now() - (opts.force ? 0 : ACH_REFRESH_MS)).toISOString();
  const pendingSql = `FROM steam_games WHERE owner_id = ? AND playtime_forever > 0 AND (ach_checked_at IS NULL OR ach_checked_at < ?)`;
  const pend = await db.execute({ sql: `SELECT appid ${pendingSql} ORDER BY COALESCE(rtime_last_played, 0) DESC, playtime_forever DESC LIMIT 40`, args: [ownerId, staleBefore] });
  const started = Date.now();
  const budget = opts.budgetMs ?? 20_000;
  let checked = 0;
  let added = 0;
  const queue = pend.rows.map((r) => Number(r.appid));
  // 3 jogos em paralelo; para ao estourar o orçamento.
  const worker = async () => {
    while (queue.length && Date.now() - started < budget) {
      const appid = queue.shift()!;
      const now = new Date().toISOString();
      try {
        const res = await fetchAchievements(db, steamId, appid);
        added += await storeUnlocked(db, ownerId, appid, res.unlocked, { connectedMs, tz, xpOn: settings.achievementXp });
        await db.execute({
          sql: "UPDATE steam_games SET ach_total = ?, ach_unlocked = ?, ach_checked_at = ?, ach_status = ?, ach_error = NULL WHERE owner_id = ? AND appid = ?",
          args: [res.total, res.unlocked.length, now, res.total ? "ok" : "sem_conquistas", ownerId, appid],
        });
      } catch (err) {
        const st = achStatusFromError(err);
        // Erro transitório volta à fila em ~1 h; os definitivos esperam o ciclo normal.
        const checkedAt = st.status === "erro" ? new Date(Date.now() - ACH_REFRESH_MS + 3_600_000).toISOString() : now;
        await db.execute({ sql: "UPDATE steam_games SET ach_checked_at = ?, ach_status = ?, ach_error = ? WHERE owner_id = ? AND appid = ?", args: [checkedAt, st.status, st.message, ownerId, appid] });
      }
      checked++;
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  const left = await db.execute({ sql: `SELECT COUNT(*) AS n ${pendingSql}`, args: [ownerId, new Date(Date.now() - ACH_REFRESH_MS).toISOString()] });
  return { checked, newAchievements: added, pending: Number(left.rows[0]?.n ?? 0) };
}

const gameCache = new Map<string, { at: number; value: unknown }>();

/** Detalhe de um jogo: todas as conquistas (com bloqueadas) e raridade global. Também importa as novas. */
export async function getSteamGame(db: Client, ownerId: string, appid: number) {
  const acc = await db.execute({ sql: "SELECT steam_id, connected_at, settings_json FROM steam_accounts WHERE owner_id = ?", args: [ownerId] });
  const row = acc.rows[0];
  if (!row) throw new IntegrationError(404, "Steam não conectada.", "desconectado");
  const g = await db.execute({ sql: "SELECT * FROM steam_games WHERE owner_id = ? AND appid = ?", args: [ownerId, appid] });
  if (!g.rows[0]) throw new IntegrationError(404, "Jogo não encontrado na sua biblioteca.");
  const key = `${ownerId}:${appid}`;
  const hit = gameCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.value as Awaited<ReturnType<typeof loadGame>>;
  const value = await loadGame(db, ownerId, String(row.steam_id), appid, g.rows[0] as Record<string, unknown>, {
    connectedMs: Date.parse(normalizeStoredUtc(String(row.connected_at))),
    xpOn: parseSettings(row.settings_json, DEFAULTS).achievementXp,
  });
  gameCache.set(key, { at: Date.now(), value });
  return value;
}

async function loadGame(db: Client, ownerId: string, steamId: string, appid: number, g: Record<string, unknown>, ctx: { connectedMs: number; xpOn: boolean }) {
  const { tz } = await userDayContext(db, ownerId);
  const pinned = await db.execute({ sql: "SELECT item_key FROM inventory_transactions WHERE owner_id = ? AND type = 'acquire' AND item_key LIKE ?", args: [ownerId, `trophy:steam:${appid}:%`] });
  const pinnedSet = new Set(pinned.rows.map((r) => String(r.item_key)));
  let achievements: Array<{ apiName: string; name: string; description: string | null; icon: string | null; achieved: boolean; unlockedAt: string | null; globalPct: number | null; hidden: boolean; pinned: boolean }> = [];
  let status: string = "ok";
  let error: string | null = null;
  try {
    const [res, global] = await Promise.all([
      fetchAchievements(db, steamId, appid),
      fetchJson<{ achievementpercentages?: { achievements?: Array<{ name: string; percent: number | string }> } }>(
        `${API}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${appid}`,
        {},
        { label: "Steam", retries: 0, timeoutMs: 8000 }
      ).catch(() => null),
    ]);
    await storeUnlocked(db, ownerId, appid, res.unlocked, { connectedMs: ctx.connectedMs, tz, xpOn: ctx.xpOn });
    await db.execute({
      sql: "UPDATE steam_games SET ach_total = ?, ach_unlocked = ?, ach_checked_at = ?, ach_status = ?, ach_error = NULL WHERE owner_id = ? AND appid = ?",
      args: [res.total, res.unlocked.length, new Date().toISOString(), res.total ? "ok" : "sem_conquistas", ownerId, appid],
    });
    const pct = new Map((global?.achievementpercentages?.achievements ?? []).map((a) => [a.name, Number(a.percent)]));
    achievements = res.all
      .map((a) => ({
        apiName: a.apiname,
        name: a.displayName,
        // Conquista oculta e bloqueada: não revela a descrição.
        description: a.hidden && !a.achieved ? null : a.desc,
        icon: a.achieved ? a.icon : a.iconGray ?? a.icon,
        achieved: a.achieved,
        unlockedAt: a.achieved && a.unlocktime ? new Date(a.unlocktime * 1000).toISOString() : null,
        globalPct: pct.has(a.apiname) ? Math.round(pct.get(a.apiname)! * 10) / 10 : null,
        hidden: a.hidden,
        pinned: pinnedSet.has(`trophy:steam:${appid}:${a.apiname}`),
      }))
      .sort((x, y) => Number(y.achieved) - Number(x.achieved) || (y.unlockedAt ?? "").localeCompare(x.unlockedAt ?? "") || (y.globalPct ?? 0) - (x.globalPct ?? 0));
    if (!res.total) status = "sem_conquistas";
  } catch (err) {
    const st = achStatusFromError(err);
    status = st.status;
    error = st.message;
    await db.execute({ sql: "UPDATE steam_games SET ach_checked_at = ?, ach_status = ?, ach_error = ? WHERE owner_id = ? AND appid = ?", args: [new Date().toISOString(), st.status, st.message, ownerId, appid] });
  }
  return {
    appid,
    name: String(g.name),
    header: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`,
    totalMin: Number(g.playtime_forever),
    recentMin: Number(g.playtime_2weeks),
    lastPlayed: g.rtime_last_played ? new Date(Number(g.rtime_last_played) * 1000).toISOString() : null,
    storeUrl: `https://store.steampowered.com/app/${appid}`,
    status,
    error,
    achievements,
  };
}

export async function syncSteam(db: Client, ownerId: string, opts: { force?: boolean } = {}) {
  const acc = await db.execute({ sql: "SELECT steam_id, last_sync_at, connected_at, settings_json FROM steam_accounts WHERE owner_id = ?", args: [ownerId] });
  const row = acc.rows[0];
  if (!row) throw new IntegrationError(404, "Steam não conectada.", "desconectado");
  const last = row.last_sync_at ? Date.parse(normalizeStoredUtc(String(row.last_sync_at))) : 0;
  if (!opts.force && last && Date.now() - last < MIN_SYNC_MS) return { skipped: true, games: 0, newAchievements: 0 };
  const steamId = String(row.steam_id);
  const { today } = await userDayContext(db, ownerId);
  const now = new Date().toISOString();
  try {
    const owned = await steamGet<{ response: { game_count?: number; games?: OwnedGame[] } }>(db, "IPlayerService/GetOwnedGames/v1/", {
      steamid: steamId,
      include_appinfo: "1",
      include_played_free_games: "1",
    });
    const games = owned.response.games;
    if (!games) {
      await db.execute({ sql: "UPDATE steam_accounts SET last_sync_at = ?, last_error = ? WHERE owner_id = ?", args: [now, "Os detalhes de jogos do perfil estão privados na Steam.", ownerId] });
      return { skipped: false, games: 0, newAchievements: 0, privateProfile: true };
    }
    for (let i = 0; i < games.length; i += 50) {
      const chunk = games.slice(i, i + 50);
      await db.execute({
        sql: `INSERT INTO steam_games (owner_id, appid, name, img_icon_url, playtime_forever, playtime_2weeks, rtime_last_played, updated_at)
              VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ")}
              ON CONFLICT (owner_id, appid) DO UPDATE SET name = excluded.name, img_icon_url = excluded.img_icon_url, playtime_forever = excluded.playtime_forever,
                playtime_2weeks = excluded.playtime_2weeks, rtime_last_played = excluded.rtime_last_played, updated_at = excluded.updated_at`,
        args: chunk.flatMap((g) => [ownerId, g.appid, g.name ?? `App ${g.appid}`, g.img_icon_url ?? null, g.playtime_forever, g.playtime_2weeks ?? 0, g.rtime_last_played ?? null, now]),
      });
    }
    await writeSnapshots(db, ownerId, today, games, now);

    await db.execute({ sql: "UPDATE steam_accounts SET last_sync_at = ?, last_error = NULL WHERE owner_id = ?", args: [now, ownerId] });
    // Conquistas num orçamento curto aqui; a tela continua o resto em /steam/achievements/sync.
    const ach = await syncSteamAchievements(db, ownerId, { budgetMs: 8_000 }).catch(() => ({ newAchievements: 0, pending: 0, checked: 0 }));
    return { skipped: false, games: games.length, newAchievements: ach.newAchievements, pendingAchievements: ach.pending };
  } catch (err) {
    await db.execute({ sql: "UPDATE steam_accounts SET last_error = ? WHERE owner_id = ?", args: [err instanceof IntegrationError ? err.message : "Falha ao sincronizar com a Steam.", ownerId] });
    throw err;
  }
}

/** Minutos registrados no LifeOS por dia (tarefas cronometradas, estudo, leitura e treinos). */
async function registeredMinutes(db: Client, ownerId: string, tz: string, from: string, to: string) {
  const map = new Map<string, number>();
  const add = (day: string, m: number) => map.set(day, (map.get(day) ?? 0) + Math.max(0, m));
  const q = async (table: string, col: string, dur: string) => {
    const w = localDaysWhere(col, from, to, tz);
    const r = await db.execute({ sql: `SELECT ${col} AS at, ${dur} AS m FROM ${table} WHERE owner_id = ? AND ${w.sql}`, args: [ownerId, ...w.args] });
    for (const x of r.rows) add(localDayOfStored(String(x.at), tz), Number(x.m ?? 0));
  };
  await Promise.all([
    q("time_entries", "started_at", "duration_minutes"),
    q("reading_sessions", "started_at", "duration_minutes"),
    q("workouts", "performed_at", "duration_minutes"),
    db.execute({ sql: "SELECT occurred_at, duration_minutes FROM study_sessions WHERE owner_id = ? AND occurred_at >= ? AND occurred_at <= ?", args: [ownerId, from, `${to}T23:59:59`] }).then((r) => {
      for (const x of r.rows) add(String(x.occurred_at).slice(0, 10), Number(x.duration_minutes ?? 0));
    }),
  ]);
  return map;
}

export async function getSteamOverview(db: Client, ownerId: string, rangeDays: 7 | 14 | 30 = 7) {
  const key = await steamApiKey(db);
  const acc = await db.execute({ sql: "SELECT * FROM steam_accounts WHERE owner_id = ?", args: [ownerId] });
  const row = acc.rows[0];
  const { tz, today } = await userDayContext(db, ownerId);
  const from = shiftDayKey(today, -(rangeDays - 1));
  const prevFrom = shiftDayKey(from, -rangeDays);
  if (!row) return { configured: Boolean(key), account: null, today };
  const settings = parseSettings(row.settings_json, DEFAULTS);
  const [games, snaps, achRecent, achCount, pinned] = await Promise.all([
    db.execute({ sql: "SELECT * FROM steam_games WHERE owner_id = ? ORDER BY playtime_2weeks DESC, playtime_forever DESC", args: [ownerId] }),
    db.execute({ sql: "SELECT day_key, playtime_forever FROM steam_playtime_snapshots WHERE owner_id = ? AND appid = 0 AND day_key >= ? ORDER BY day_key", args: [ownerId, shiftDayKey(prevFrom, -1)] }),
    db.execute({
      sql: `SELECT a.appid, a.api_name, a.name, a.description, a.icon, a.unlock_time, g.name AS game FROM steam_achievements a
            LEFT JOIN steam_games g ON g.owner_id = a.owner_id AND g.appid = a.appid WHERE a.owner_id = ? ORDER BY a.unlock_time DESC LIMIT 400`,
      args: [ownerId],
    }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM steam_achievements WHERE owner_id = ?", args: [ownerId] }),
    db.execute({ sql: "SELECT item_key FROM inventory_transactions WHERE owner_id = ? AND type = 'acquire' AND item_key LIKE 'trophy:steam:%'", args: [ownerId] }),
  ]);
  const gameRows = games.rows.map((g) => ({
    appid: Number(g.appid),
    name: String(g.name),
    icon: g.img_icon_url ? `https://media.steampowered.com/steamcommunity/public/images/apps/${String(g.appid)}/${String(g.img_icon_url)}.jpg` : null,
    header: `https://cdn.cloudflare.steamstatic.com/steam/apps/${String(g.appid)}/capsule_184x69.jpg`,
    totalMin: Number(g.playtime_forever),
    recentMin: Number(g.playtime_2weeks),
    lastPlayed: g.rtime_last_played ? new Date(Number(g.rtime_last_played) * 1000).toISOString() : null,
    achTotal: g.ach_total == null ? null : Number(g.ach_total),
    achUnlocked: g.ach_unlocked == null ? null : Number(g.ach_unlocked),
    achStatus: g.ach_status == null ? (g.ach_checked_at ? "ok" : "pendente") : String(g.ach_status),
    achError: g.ach_error == null ? null : String(g.ach_error),
    storeUrl: `https://store.steampowered.com/app/${String(g.appid)}`,
    launchUrl: `steam://run/${String(g.appid)}`,
  }));
  const snapList = snaps.rows.map((s) => ({ day: String(s.day_key), total: Number(s.playtime_forever) }));
  const daily = dailyFromSnapshots(snapList, from, today);
  const prevDaily = dailyFromSnapshots(snapList, prevFrom, shiftDayKey(from, -1));
  const sumKnown = (xs: typeof daily) => xs.reduce((a, d) => a + (d.minutes ?? 0), 0);
  const coveredDays = daily.filter((d) => d.minutes != null).length;
  const prevCovered = prevDaily.filter((d) => d.minutes != null).length;
  const gameMin = sumKnown(daily);
  const prodMap = await registeredMinutes(db, ownerId, tz, from, today);
  const prodMin = Math.round([...prodMap.values()].reduce((a, b) => a + b, 0));
  const pinnedSet = new Set(pinned.rows.map((p) => String(p.item_key)));
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  const weekStart = shiftDayKey(today, -((dow + 6) % 7));
  const weekGame = sumKnown(dailyFromSnapshots(snapList, weekStart, today));

  return {
    configured: Boolean(key),
    today,
    account: {
      steamId: String(row.steam_id),
      personaName: row.persona_name == null ? null : String(row.persona_name),
      avatarUrl: row.avatar_url == null ? null : String(row.avatar_url),
      profileUrl: row.profile_url == null ? null : String(row.profile_url),
      publicProfile: Number(row.visibility ?? 0) === 3,
      connectedAt: String(row.connected_at),
      lastSyncAt: row.last_sync_at == null ? null : String(row.last_sync_at),
      lastError: row.last_error == null ? null : String(row.last_error),
      settings,
    },
    totals: {
      games: gameRows.length,
      playedGames: gameRows.filter((g) => g.totalMin > 0).length,
      totalMin: gameRows.reduce((a, g) => a + g.totalMin, 0),
      // Valor oficial da Steam (últimas 2 semanas), independente dos snapshots.
      last14Min: gameRows.reduce((a, g) => a + g.recentMin, 0),
      achievements: Number(achCount.rows[0]?.n ?? 0),
    },
    period: {
      rangeDays,
      from,
      to: today,
      gameMin,
      coveredDays,
      prevGameMin: prevCovered > 0 ? sumKnown(prevDaily) : null,
      estimated: true,
      note: "Estimado pela diferença entre snapshots que o LifeOS coleta (a Steam não informa histórico diário). Dias sem snapshot ficam sem dado.",
    },
    daily: daily.map((d) => ({ ...d, productiveMin: Math.round(prodMap.get(d.day) ?? 0) })),
    balance: {
      gameMin,
      productiveMin: prodMin,
      productiveSources: "Cronômetro de tarefas, estudo, leitura e treinos",
      weekGameMin: weekGame,
      weeklyLimitHours: settings.weeklyLimitHours,
    },
    games: gameRows,
    achievementSync: (() => {
      const played = gameRows.filter((g) => g.totalMin > 0);
      const count = (st: string) => played.filter((g) => g.achStatus === st).length;
      return { playedGames: played.length, withAchievements: count("ok"), noAchievements: count("sem_conquistas"), privateGames: count("privado"), errors: count("erro"), pending: count("pendente"), lastError: played.find((g) => g.achStatus === "erro")?.achError ?? null };
    })(),
    recentAchievements: achRecent.rows.map((a) => ({
      appid: Number(a.appid),
      apiName: String(a.api_name),
      name: String(a.name),
      description: a.description == null ? null : String(a.description),
      icon: a.icon == null ? null : String(a.icon),
      unlockedAt: new Date(Number(a.unlock_time) * 1000).toISOString(),
      game: a.game == null ? null : String(a.game),
      pinned: pinnedSet.has(`trophy:steam:${String(a.appid)}:${String(a.api_name)}`),
    })),
    pinnedTrophies: pinnedSet.size,
    xpRules: STEAM_XP,
  };
}

export async function updateSteamSettings(db: Client, ownerId: string, patch: Partial<SteamSettings>) {
  const r = await db.execute({ sql: "SELECT settings_json FROM steam_accounts WHERE owner_id = ?", args: [ownerId] });
  if (!r.rows[0]) throw new IntegrationError(404, "Steam não conectada.", "desconectado");
  await db.execute({ sql: "UPDATE steam_accounts SET settings_json = ? WHERE owner_id = ?", args: [JSON.stringify({ ...parseSettings(r.rows[0].settings_json, DEFAULTS), ...patch }), ownerId] });
}

/** Fixa/desfixa uma conquista Steam como troféu cosmético da Coleção (sem XP). */
export async function pinSteamTrophy(db: Client, ownerId: string, appid: number, apiName: string, pin: boolean) {
  const r = await db.execute({
    sql: "SELECT a.name, g.name AS game FROM steam_achievements a LEFT JOIN steam_games g ON g.owner_id = a.owner_id AND g.appid = a.appid WHERE a.owner_id = ? AND a.appid = ? AND a.api_name = ?",
    args: [ownerId, appid, apiName],
  });
  const a = r.rows[0];
  if (!a) throw new IntegrationError(404, "Conquista não encontrada.");
  const key = `trophy:steam:${appid}:${apiName}`;
  if (pin) await grantCollectionItem(db, ownerId, key, "steam", `${appid}:${apiName}`, `${String(a.name)} · ${String(a.game ?? "Steam")}`);
  else await revokeCollectionItem(db, ownerId, key);
}

export async function disconnectSteam(db: Client, ownerId: string, opts: { deleteData: boolean }) {
  await db.execute({ sql: "DELETE FROM steam_accounts WHERE owner_id = ?", args: [ownerId] });
  if (opts.deleteData) {
    for (const t of ["steam_games", "steam_playtime_snapshots", "steam_achievements"]) await db.execute({ sql: `DELETE FROM ${t} WHERE owner_id = ?`, args: [ownerId] });
  }
}

/** Snapshot diário via cron (sem esperar o usuário abrir a tela). */
export async function steamDailySnapshots(db: Client, limit = 50) {
  const r = await db.execute({ sql: "SELECT owner_id FROM steam_accounts ORDER BY COALESCE(last_sync_at, '') ASC LIMIT ?", args: [limit] });
  let ok = 0;
  for (const row of r.rows) {
    try {
      await syncSteam(db, String(row.owner_id), { force: false });
      ok++;
    } catch {
      /* segue para o próximo usuário */
    }
  }
  return ok;
}
