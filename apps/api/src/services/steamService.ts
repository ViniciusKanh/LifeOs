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
const ACH_GAMES_PER_SYNC = 6;
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

async function steamGet<T>(db: Client, path: string, params: Record<string, string>): Promise<T> {
  const key = await steamApiKey(db);
  if (!key) throw new IntegrationError(503, "Steam não configurada pelo administrador.", "nao_configurado");
  const p = new URLSearchParams({ ...params, key, format: "json" });
  return fetchJson<T>(`${API}/${path}?${p.toString()}`, {}, { label: "Steam" });
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

async function fetchAchievements(db: Client, ownerId: string, steamId: string, appid: number) {
  const [player, schema] = await Promise.all([
    steamGet<{ playerstats: { success?: boolean; achievements?: Array<{ apiname: string; achieved: number; unlocktime: number; name?: string; description?: string }> } }>(
      db,
      "ISteamUserStats/GetPlayerAchievements/v1/",
      { steamid: steamId, appid: String(appid), l: "brazilian" }
    ),
    steamGet<{ game?: { availableGameStats?: { achievements?: Array<{ name: string; displayName: string; description?: string; icon?: string }> } } }>(db, "ISteamUserStats/GetSchemaForGame/v2/", {
      appid: String(appid),
      l: "brazilian",
    }).catch(() => null),
  ]);
  const list = player.playerstats.achievements ?? [];
  const icons = new Map((schema?.game?.availableGameStats?.achievements ?? []).map((a) => [a.name, a]));
  return { total: list.length, unlocked: list.filter((a) => a.achieved === 1).map((a) => ({ ...a, icon: icons.get(a.apiname)?.icon ?? null, displayName: a.name ?? icons.get(a.apiname)?.displayName ?? a.apiname, desc: a.description ?? icons.get(a.apiname)?.description ?? null })) };
}

export async function syncSteam(db: Client, ownerId: string, opts: { force?: boolean } = {}) {
  const acc = await db.execute({ sql: "SELECT steam_id, last_sync_at, connected_at, settings_json FROM steam_accounts WHERE owner_id = ?", args: [ownerId] });
  const row = acc.rows[0];
  if (!row) throw new IntegrationError(404, "Steam não conectada.", "desconectado");
  const last = row.last_sync_at ? Date.parse(normalizeStoredUtc(String(row.last_sync_at))) : 0;
  if (!opts.force && last && Date.now() - last < MIN_SYNC_MS) return { skipped: true, games: 0, newAchievements: 0 };
  const steamId = String(row.steam_id);
  const settings = parseSettings(row.settings_json, DEFAULTS);
  const connectedMs = Date.parse(normalizeStoredUtc(String(row.connected_at)));
  const { tz, today } = await userDayContext(db, ownerId);
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

    // Conquistas: jogos jogados recentemente primeiro, com intervalo mínimo por jogo.
    const candidates = await db.execute({
      sql: `SELECT appid, name, ach_checked_at FROM steam_games WHERE owner_id = ? AND playtime_forever > 0
            ORDER BY playtime_2weeks DESC, rtime_last_played DESC LIMIT 25`,
      args: [ownerId],
    });
    let checked = 0;
    let newAch = 0;
    for (const g of candidates.rows) {
      if (checked >= ACH_GAMES_PER_SYNC) break;
      const at = g.ach_checked_at ? Date.parse(String(g.ach_checked_at)) : 0;
      if (at && Date.now() - at < ACH_REFRESH_MS) continue;
      checked++;
      const appid = Number(g.appid);
      try {
        const res = await fetchAchievements(db, ownerId, steamId, appid);
        for (const a of res.unlocked) {
          const ins = await db.execute({
            sql: `INSERT INTO steam_achievements (owner_id, appid, api_name, name, description, icon, unlock_time) VALUES (?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT (owner_id, appid, api_name) DO NOTHING`,
            args: [ownerId, appid, a.apiname, a.displayName.slice(0, 200), a.desc?.slice(0, 400) ?? null, a.icon, a.unlocktime],
          });
          if (ins.rowsAffected > 0) {
            newAch++;
            // XP só para conquistas desbloqueadas depois da conexão (sem backfill), com teto diário.
            if (settings.achievementXp && a.unlocktime * 1000 >= connectedMs) {
              const day = localDayOfStored(new Date(a.unlocktime * 1000).toISOString(), tz);
              const n = await db.execute({ sql: "SELECT COUNT(*) AS n FROM xp_events WHERE owner_id = ? AND source_type = 'steam' AND day_key = ?", args: [ownerId, day] });
              if (Number(n.rows[0]?.n ?? 0) < STEAM_XP.dailyCap) {
                await award(db, ownerId, { sourceType: "steam", sourceId: `${appid}:${a.apiname}`, eventType: "achievement", xp: STEAM_XP.perAchievement, coins: 0, label: `Conquista Steam: ${a.displayName}`.slice(0, 120) }, day);
              }
            }
          }
        }
        await db.execute({ sql: "UPDATE steam_games SET ach_total = ?, ach_unlocked = ?, ach_checked_at = ? WHERE owner_id = ? AND appid = ?", args: [res.total, res.unlocked.length, now, ownerId, appid] });
      } catch {
        // Jogo sem conquistas ou estatísticas privadas: marca como verificado para não insistir.
        await db.execute({ sql: "UPDATE steam_games SET ach_checked_at = ? WHERE owner_id = ? AND appid = ?", args: [now, ownerId, appid] });
      }
    }
    await db.execute({ sql: "UPDATE steam_accounts SET last_sync_at = ?, last_error = NULL WHERE owner_id = ?", args: [now, ownerId] });
    return { skipped: false, games: games.length, newAchievements: newAch };
  } catch (err) {
    await db.execute({ sql: "UPDATE steam_accounts SET last_error = ? WHERE owner_id = ?", args: [err instanceof IntegrationError ? err.message : "Falha ao sincronizar com a Steam.", ownerId] });
    throw err;
  }
}

/** Minutos registrados no LifeOS por dia (tarefas cronometradas, estudo, leitura, treinos, sessões). */
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
    q("music_sessions", "started_at", "(julianday(COALESCE(ended_at, started_at)) - julianday(started_at)) * 1440"),
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
            LEFT JOIN steam_games g ON g.owner_id = a.owner_id AND g.appid = a.appid WHERE a.owner_id = ? ORDER BY a.unlock_time DESC LIMIT 12`,
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
      productiveSources: "Cronômetro de tarefas, estudo, leitura, treinos e sessões da Trilha Sonora",
      weekGameMin: weekGame,
      weeklyLimitHours: settings.weeklyLimitHours,
    },
    games: gameRows.slice(0, 40),
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
