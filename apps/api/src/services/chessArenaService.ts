import type { Client } from "@libsql/client";
import { award } from "./gamificationService.js";
import { decryptSecret, encryptSecret } from "./cryptoService.js";
import { fetchJson, IntegrationError } from "./integrationsCore.js";
import { localDayOfStored, userDayContext } from "./localDayService.js";
import { recordWorldEvent } from "./livingWorldService.js";

/**
 * Arena de Xadrez (Aventuras) — perfil, partidas e puzzles do Lichess.
 * Dados públicos pelo nome de usuário; o token pessoal (opcional, escopo
 * puzzle:read) libera o histórico de puzzles. O token fica criptografado.
 *
 * XP (fonte "chess"), só para atividade depois da conexão (nada retroativo):
 *  - vitória em partida ranqueada: +15 XP e 1 moeda (até 6 por dia); empate +5;
 *  - puzzle resolvido: +5 XP (até 10 por dia); puzzle do dia resolvido: +15;
 *  - nova centena de rating em qualquer ritmo (recorde pessoal): +50 XP e 5 moedas.
 */

export const CHESS_XP = { win: 15, winCoins: 1, winCap: 6, draw: 5, puzzle: 5, puzzleCap: 10, daily: 15, record: 50, recordCoins: 5 } as const;
const LICHESS = "https://lichess.org";
const PERFS = ["bullet", "blitz", "rapid", "classical", "correspondence", "puzzle"] as const;
const SYNC_EVERY_MS = 20 * 60 * 1000;
const MIN_SYNC_MS = 60 * 1000;

export class ChessError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 | 422 | 429 | 502 = 400) {
    super(message);
  }
}

function friendly(err: unknown): never {
  if (err instanceof IntegrationError) {
    if (err.status === 404) throw new ChessError("Usuário não encontrado no Lichess.", 404);
    if (err.status === 401 || err.status === 403) throw new ChessError("O Lichess recusou o token. Gere um token pessoal com a permissão de leitura de puzzles.", 422);
    if (err.status === 429) throw new ChessError("O Lichess pediu uma pausa nas consultas. Tente em um minuto.", 429);
    throw new ChessError(err.message, 502);
  }
  throw err;
}

const headers = (token?: string | null, ndjson = false) => ({ Accept: ndjson ? "application/x-ndjson" : "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) });
const parseNdjson = <T>(text: string): T[] =>
  String(text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as T];
      } catch {
        return [];
      }
    });

type Perf = { games?: number; rating?: number; rd?: number; prog?: number; prov?: boolean };
interface RawUser { id: string; username: string; perfs?: Record<string, Perf>; count?: { all?: number; win?: number; loss?: number; draw?: number }; createdAt?: number; seenAt?: number; url?: string; disabled?: boolean; tosViolation?: boolean }
type RawPlayer = { user?: { name?: string; id?: string }; rating?: number; ratingDiff?: number; aiLevel?: number };
export interface RawGame { id: string; rated?: boolean; speed?: string; createdAt?: number; lastMoveAt?: number; status?: string; winner?: "white" | "black"; players?: { white?: RawPlayer; black?: RawPlayer }; opening?: { name?: string } }
export interface RawPuzzleActivity { date?: number; win?: boolean; puzzle?: { id?: string; rating?: number } }

/** Converte uma partida do Lichess do ponto de vista do usuário. Exportada para testes. */
export function gameFromRaw(g: RawGame, userId: string, tz: string) {
  const white = g.players?.white;
  const black = g.players?.black;
  const color = white?.user?.id?.toLowerCase() === userId.toLowerCase() ? "white" : "black";
  const me = color === "white" ? white : black;
  const opp = color === "white" ? black : white;
  const result: "vitoria" | "derrota" | "empate" = !g.winner ? "empate" : g.winner === color ? "vitoria" : "derrota";
  const at = new Date(g.lastMoveAt ?? g.createdAt ?? Date.now()).toISOString();
  return {
    gameId: g.id,
    playedAt: at,
    day: localDayOfStored(at, tz),
    speed: g.speed ?? null,
    rated: !!g.rated,
    result,
    color,
    myRating: me?.rating ?? null,
    ratingDiff: me?.ratingDiff ?? null,
    opponent: opp?.user?.name ?? (opp?.aiLevel ? `Stockfish nível ${opp.aiLevel}` : "Anônimo"),
    opponentRating: opp?.rating ?? null,
    opening: g.opening?.name?.slice(0, 120) ?? null,
  };
}

async function getAccount(db: Client, ownerId: string) {
  const r = await db.execute({ sql: "SELECT * FROM lichess_accounts WHERE owner_id = ?", args: [ownerId] });
  return r.rows[0] ?? null;
}
const tokenOf = (row: Record<string, unknown>) => {
  try {
    return row.token_enc ? decryptSecret(String(row.token_enc)) : null;
  } catch {
    return null;
  }
};
const ratingsOf = (u: RawUser) => Object.fromEntries(PERFS.flatMap((p) => (u.perfs?.[p]?.rating && !u.perfs[p]!.prov ? [[p, u.perfs[p]!.rating!]] : [])));

export async function connectLichess(db: Client, ownerId: string, input: { username: string; token?: string | null }) {
  const username = input.username.trim();
  const u = await fetchJson<RawUser>(`${LICHESS}/api/user/${encodeURIComponent(username)}`, { headers: headers() }, { label: "Lichess", retries: 1 }).catch(friendly);
  if (!u?.id || u.disabled) throw new ChessError("Essa conta do Lichess não está ativa.", 404);
  const token = input.token?.trim() || null;
  if (token) {
    const me = await fetchJson<{ id?: string }>(`${LICHESS}/api/account`, { headers: headers(token) }, { label: "Lichess", retries: 1 }).catch(friendly);
    if (me?.id?.toLowerCase() !== u.id.toLowerCase()) throw new ChessError("Esse token é de outra conta do Lichess.", 422);
  }
  // O recorde de partida começa no rating atual: só centenas novas pagam XP.
  await db.execute({
    sql: `INSERT INTO lichess_accounts (owner_id, username, token_enc, profile_json, peak_json) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (owner_id) DO UPDATE SET username = excluded.username, token_enc = excluded.token_enc, profile_json = excluded.profile_json,
            peak_json = CASE WHEN lower(lichess_accounts.username) = lower(excluded.username) THEN lichess_accounts.peak_json ELSE excluded.peak_json END,
            last_sync_status = NULL, last_sync_error = NULL, created_at = CASE WHEN lower(lichess_accounts.username) = lower(excluded.username) THEN lichess_accounts.created_at ELSE datetime('now') END`,
    args: [ownerId, u.username, token ? encryptSecret(token) : null, JSON.stringify({ user: u }), JSON.stringify(ratingsOf(u))],
  });
  await recordWorldEvent(db, ownerId, { type: "chess.connected", title: `A Arena de Xadrez foi ligada ao Lichess (${u.username})` });
  return { username: u.username, hasToken: !!token };
}

export async function disconnectLichess(db: Client, ownerId: string) {
  // Partidas, puzzles e XP já registrados continuam (são histórico real).
  await db.execute({ sql: "DELETE FROM lichess_accounts WHERE owner_id = ?", args: [ownerId] });
}

/**
 * Grava partidas e paga XP das que aconteceram depois da conexão.
 * Exportada para testes: repetir as mesmas partidas nunca paga de novo.
 */
export async function importGames(db: Client, ownerId: string, userId: string, games: RawGame[], since: string, tz: string) {
  let xp = 0;
  let added = 0;
  for (const raw of games) {
    if (!raw?.id) continue;
    const g = gameFromRaw(raw, userId, tz);
    const ins = await db.execute({
      sql: `INSERT OR IGNORE INTO lichess_games (owner_id, game_id, played_at, day_key, speed, rated, result, color, my_rating, rating_diff, opponent, opponent_rating, opening)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [ownerId, g.gameId, g.playedAt, g.day, g.speed, g.rated ? 1 : 0, g.result, g.color, g.myRating, g.ratingDiff, g.opponent, g.opponentRating, g.opening],
    });
    added += ins.rowsAffected;
    if (g.playedAt < since || !g.rated || g.result === "derrota") continue;
    const cap = await db.execute({ sql: "SELECT COUNT(*) AS n FROM xp_events WHERE owner_id = ? AND source_type = 'chess' AND event_type IN ('win', 'draw') AND day_key = ?", args: [ownerId, g.day] });
    if (Number(cap.rows[0]?.n ?? 0) >= CHESS_XP.winCap) continue;
    const win = g.result === "vitoria";
    const ok = await award(db, ownerId, { sourceType: "chess", sourceId: `game:${g.gameId}`, eventType: win ? "win" : "draw", xp: win ? CHESS_XP.win : CHESS_XP.draw, coins: win ? CHESS_XP.winCoins : 0, label: `${win ? "Vitória" : "Empate"} no Lichess contra ${g.opponent}` }, g.day);
    if (ok) xp += win ? CHESS_XP.win : CHESS_XP.draw;
  }
  return { added, xp };
}

/** Grava puzzles do histórico e paga os resolvidos depois da conexão. Exportada para testes. */
export async function importPuzzles(db: Client, ownerId: string, list: RawPuzzleActivity[], since: string, tz: string) {
  let xp = 0;
  for (const p of list) {
    const id = p.puzzle?.id;
    if (!id || !p.date) continue;
    const at = new Date(p.date).toISOString();
    const day = localDayOfStored(at, tz);
    await db.execute({ sql: "INSERT OR IGNORE INTO lichess_puzzles (owner_id, puzzle_id, played_at, day_key, win, rating) VALUES (?, ?, ?, ?, ?, ?)", args: [ownerId, id, at, day, p.win ? 1 : 0, p.puzzle?.rating ?? null] });
    if (!p.win || at < since) continue;
    const cap = await db.execute({ sql: "SELECT COUNT(*) AS n FROM xp_events WHERE owner_id = ? AND source_type = 'chess' AND event_type = 'puzzle' AND day_key = ?", args: [ownerId, day] });
    if (Number(cap.rows[0]?.n ?? 0) >= CHESS_XP.puzzleCap) continue;
    if (await award(db, ownerId, { sourceType: "chess", sourceId: `puzzle:${id}`, eventType: "puzzle", xp: CHESS_XP.puzzle, coins: 0, label: "Puzzle resolvido no Lichess" }, day)) xp += CHESS_XP.puzzle;
  }
  return { xp };
}

/** Recordes: paga cada nova centena acima do maior rating já visto. Exportada para testes. */
export async function applyRecords(db: Client, ownerId: string, current: Record<string, number>, today: string) {
  const r = await db.execute({ sql: "SELECT peak_json FROM lichess_accounts WHERE owner_id = ?", args: [ownerId] });
  const peak = JSON.parse(String(r.rows[0]?.peak_json ?? "{}")) as Record<string, number>;
  let xp = 0;
  const records: string[] = [];
  for (const [perf, rating] of Object.entries(current)) {
    const prev = peak[perf];
    if (prev != null && Math.floor(rating / 100) > Math.floor(prev / 100)) {
      const hundred = Math.floor(rating / 100) * 100;
      const label = perf === "puzzle" ? "puzzles" : perf;
      if (await award(db, ownerId, { sourceType: "chess", sourceId: `record:${perf}:${hundred}`, eventType: "record", xp: CHESS_XP.record, coins: CHESS_XP.recordCoins, label: `Recorde no Lichess: ${hundred} em ${label}` }, today)) {
        xp += CHESS_XP.record;
        records.push(`${label} ${hundred}`);
      }
    }
    if (prev == null || rating > prev) peak[perf] = rating;
  }
  await db.execute({ sql: "UPDATE lichess_accounts SET peak_json = ? WHERE owner_id = ?", args: [JSON.stringify(peak), ownerId] });
  if (records.length) await recordWorldEvent(db, ownerId, { type: "chess.record", title: `Novo recorde na Arena de Xadrez: ${records.join(", ")}` });
  return { xp, records };
}

export async function syncLichess(db: Client, ownerId: string, opts: { force?: boolean } = {}) {
  const acc = await getAccount(db, ownerId);
  if (!acc) throw new ChessError("Conecte sua conta do Lichess primeiro.", 404);
  if (!opts.force && acc.last_sync_at && Date.now() - Date.parse(String(acc.last_sync_at)) < MIN_SYNC_MS) throw new ChessError("Acabou de sincronizar. Aguarde um minuto.", 429);
  const { tz, today } = await userDayContext(db, ownerId);
  const token = tokenOf(acc);
  const username = String(acc.username);
  // Paga só o que aconteceu depois da conexão (sem XP retroativo).
  const since = new Date(Date.parse(`${String(acc.created_at).replace(" ", "T")}Z`)).toISOString();
  try {
    const u = await fetchJson<RawUser>(`${LICHESS}/api/user/${encodeURIComponent(username)}`, { headers: headers(token) }, { label: "Lichess" }).catch(friendly);
    const history = await fetchJson<Array<{ name: string; points: Array<[number, number, number, number]> }>>(`${LICHESS}/api/user/${encodeURIComponent(username)}/rating-history`, { headers: headers(token) }, { label: "Lichess", retries: 1 }).catch(() => []);
    const lastGame = await db.execute({ sql: "SELECT MAX(played_at) AS m FROM lichess_games WHERE owner_id = ?", args: [ownerId] });
    const sinceMs = lastGame.rows[0]?.m ? Date.parse(String(lastGame.rows[0].m)) - 60_000 : Date.now() - 30 * 86400_000;
    const gamesText = await fetchJson<string>(`${LICHESS}/api/games/user/${encodeURIComponent(username)}?max=60&since=${sinceMs}&moves=false&opening=true`, { headers: headers(token, true) }, { label: "Lichess", responseType: "text", timeoutMs: 15_000 }).catch(friendly);
    const games = await importGames(db, ownerId, u.id, parseNdjson<RawGame>(gamesText), since, tz);
    let puzzles = { xp: 0 };
    let partial = false;
    if (token) {
      try {
        const text = await fetchJson<string>(`${LICHESS}/api/puzzle/activity?max=100`, { headers: headers(token, true) }, { label: "Lichess", responseType: "text" });
        puzzles = await importPuzzles(db, ownerId, parseNdjson<RawPuzzleActivity>(text), since, tz);
      } catch {
        partial = true;
      }
    }
    const records = await applyRecords(db, ownerId, ratingsOf(u), today);
    const compactHistory = (history ?? []).filter((h) => h.points?.length).map((h) => ({ name: h.name, points: h.points.slice(-40).map(([y, m, d, r]) => ({ day: `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`, rating: r })) }));
    await db.execute({
      sql: "UPDATE lichess_accounts SET profile_json = ?, last_sync_at = ?, last_sync_status = ?, last_sync_error = NULL WHERE owner_id = ?",
      args: [JSON.stringify({ user: u, history: compactHistory }), new Date().toISOString(), partial ? "parcial" : "ok", ownerId],
    });
    return { ok: true as const, games: games.added, xp: games.xp + puzzles.xp + records.xp, records: records.records };
  } catch (err) {
    await db.execute({ sql: "UPDATE lichess_accounts SET last_sync_at = ?, last_sync_status = 'erro', last_sync_error = ? WHERE owner_id = ?", args: [new Date().toISOString(), (err instanceof Error ? err.message : "Falha.").slice(0, 300), ownerId] });
    throw err;
  }
}

/* Puzzle do dia: igual para todos, cache em memória por 1 h. */
type RawDaily = { game?: { id?: string; perf?: { name?: string }; players?: Array<{ name?: string; rating?: number; color?: string }> }; puzzle?: { id?: string; rating?: number; plays?: number; themes?: string[]; initialPly?: number } };
let dailyMemo: { at: number; data: RawDaily } | null = null;
export function resetChessDailyForTests() {
  dailyMemo = null;
}
async function dailyPuzzle(): Promise<RawDaily | null> {
  if (dailyMemo && Date.now() - dailyMemo.at < 3600_000) return dailyMemo.data;
  try {
    const d = await fetchJson<RawDaily>(`${LICHESS}/api/puzzle/daily`, { headers: headers() }, { label: "Lichess", retries: 1 });
    dailyMemo = { at: Date.now(), data: d };
    return d;
  } catch {
    return dailyMemo?.data ?? null;
  }
}

export async function getChessOverview(db: Client, ownerId: string) {
  let acc = await getAccount(db, ownerId);
  if (acc && (!acc.last_sync_at || Date.now() - Date.parse(String(acc.last_sync_at)) > SYNC_EVERY_MS)) {
    await syncLichess(db, ownerId, { force: true }).catch(() => undefined);
    acc = await getAccount(db, ownerId);
  }
  const { today } = await userDayContext(db, ownerId);
  const daily = await dailyPuzzle();
  const dailyId = daily?.puzzle?.id ?? null;
  if (!acc) {
    return { connected: false as const, daily: daily ? dailyOut(daily, false) : null, rules: CHESS_XP };
  }
  const [games, stats, puzzles, xp, solvedDaily] = await Promise.all([
    db.execute({ sql: "SELECT * FROM lichess_games WHERE owner_id = ? ORDER BY played_at DESC LIMIT 15", args: [ownerId] }),
    db.execute({ sql: "SELECT result, COUNT(*) AS n FROM lichess_games WHERE owner_id = ? GROUP BY result", args: [ownerId] }),
    db.execute({ sql: "SELECT COUNT(*) AS total, SUM(win) AS wins, SUM(CASE WHEN day_key = ? AND win = 1 THEN 1 ELSE 0 END) AS today FROM lichess_puzzles WHERE owner_id = ?", args: [today, ownerId] }),
    db.execute({ sql: "SELECT COALESCE(SUM(xp), 0) AS xp FROM xp_events WHERE owner_id = ? AND source_type = 'chess'", args: [ownerId] }),
    dailyId ? db.execute({ sql: "SELECT win FROM lichess_puzzles WHERE owner_id = ? AND puzzle_id = ?", args: [ownerId, dailyId] }) : Promise.resolve({ rows: [] as Array<Record<string, unknown>> }),
  ]);
  const solved = !!Number(solvedDaily.rows[0]?.win ?? 0);
  // Bônus do puzzle do dia: pago uma vez quando aparece resolvido no histórico.
  if (solved && dailyId) await award(db, ownerId, { sourceType: "chess", sourceId: `daily:${dailyId}`, eventType: "daily_puzzle", xp: CHESS_XP.daily, coins: 1, label: "Puzzle do dia resolvido no Lichess" }, today);
  const profile = JSON.parse(String(acc.profile_json ?? "{}")) as { user?: RawUser; history?: Array<{ name: string; points: Array<{ day: string; rating: number }> }> };
  const u = profile.user;
  const by = Object.fromEntries(stats.rows.map((r) => [String(r.result), Number(r.n)]));
  return {
    connected: true as const,
    account: {
      username: String(acc.username),
      hasToken: !!acc.token_enc,
      url: `${LICHESS}/@/${encodeURIComponent(String(acc.username))}`,
      lastSyncAt: acc.last_sync_at == null ? null : String(acc.last_sync_at),
      lastSyncStatus: acc.last_sync_status == null ? null : (String(acc.last_sync_status) as "ok" | "parcial" | "erro"),
      lastSyncError: acc.last_sync_error == null ? null : String(acc.last_sync_error),
    },
    perfs: PERFS.filter((p) => u?.perfs?.[p]?.games).map((p) => ({ key: p, rating: u!.perfs![p]!.rating ?? null, games: u!.perfs![p]!.games ?? 0, prog: u!.perfs![p]!.prog ?? 0, provisional: !!u!.perfs![p]!.prov })),
    peak: JSON.parse(String(acc.peak_json ?? "{}")) as Record<string, number>,
    lifetime: { all: u?.count?.all ?? 0, win: u?.count?.win ?? 0, loss: u?.count?.loss ?? 0, draw: u?.count?.draw ?? 0 },
    tracked: { win: by.vitoria ?? 0, loss: by.derrota ?? 0, draw: by.empate ?? 0 },
    history: profile.history ?? [],
    games: games.rows.map((g) => ({
      id: String(g.game_id),
      url: `${LICHESS}/${String(g.game_id)}`,
      playedAt: String(g.played_at),
      speed: g.speed == null ? null : String(g.speed),
      rated: !!Number(g.rated),
      result: String(g.result) as "vitoria" | "derrota" | "empate",
      color: g.color == null ? null : String(g.color),
      ratingDiff: g.rating_diff == null ? null : Number(g.rating_diff),
      myRating: g.my_rating == null ? null : Number(g.my_rating),
      opponent: g.opponent == null ? null : String(g.opponent),
      opponentRating: g.opponent_rating == null ? null : Number(g.opponent_rating),
      opening: g.opening == null ? null : String(g.opening),
    })),
    puzzles: { total: Number(puzzles.rows[0]?.total ?? 0), solved: Number(puzzles.rows[0]?.wins ?? 0), today: Number(puzzles.rows[0]?.today ?? 0) },
    daily: daily ? dailyOut(daily, solved) : null,
    xpTotal: Number(xp.rows[0]?.xp ?? 0),
    rules: CHESS_XP,
  };
}

function dailyOut(d: RawDaily, solved: boolean) {
  const id = d.puzzle?.id ?? "";
  return {
    id,
    rating: d.puzzle?.rating ?? null,
    plays: d.puzzle?.plays ?? null,
    themes: (d.puzzle?.themes ?? []).slice(0, 5),
    url: `${LICHESS}/training/${encodeURIComponent(id)}`,
    imageUrl: id ? `https://lichess1.org/training/export/gif/thumbnail/${encodeURIComponent(id)}.gif` : null,
    perf: d.game?.perf?.name ?? null,
    solved,
  };
}

export async function chessTimelineEvents(db: Client, ownerId: string, from: string, to: string) {
  const r = await db.execute({ sql: "SELECT day_key, SUM(result = 'vitoria') AS w, COUNT(*) AS n FROM lichess_games WHERE owner_id = ? AND day_key >= ? AND day_key <= ? GROUP BY day_key", args: [ownerId, from, to] });
  return r.rows.map((x) => ({ type: "chess", icon: "♞", id: `chess-${String(x.day_key)}`, label: `${Number(x.n)} partida(s) de xadrez, ${Number(x.w)} vitória(s)`, at: `${String(x.day_key)}T21:00:00.000Z` }));
}

/** Cron: sincroniza quem tem Lichess conectado. */
export async function lichessDailySync(db: Client, limit = 15) {
  const r = await db.execute({ sql: "SELECT owner_id FROM lichess_accounts ORDER BY last_sync_at ASC LIMIT ?", args: [limit] });
  let n = 0;
  for (const row of r.rows) if (await syncLichess(db, String(row.owner_id), { force: true }).then(() => true).catch(() => false)) n++;
  return n;
}
