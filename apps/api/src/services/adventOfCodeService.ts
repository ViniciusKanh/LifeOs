import type { Client } from "@libsql/client";
import { award } from "./gamificationService.js";
import { decryptSecret, encryptSecret } from "./cryptoService.js";
import { fetchJson, IntegrationError } from "./integrationsCore.js";
import { localDayOfStored, userDayContext } from "./localDayService.js";
import { recordWorldEvent } from "./livingWorldService.js";

/**
 * Advent of Code (Forja do Código) — estrelas e ranking privado, lidos do JSON
 * do leaderboard privado com o cookie de sessão do próprio usuário (criptografado).
 *
 * Regras do AoC respeitadas: User-Agent identificando o app e no máximo uma
 * consulta a cada 15 min por ano. Desde 2025 o evento tem 12 dias (antes, 25).
 *
 * XP (fonte "code", soma no nível da Forja), só para estrelas ganhas depois da
 * conexão: parte 1 = +20 XP e 2 moedas; parte 2 = +30 XP e 3 moedas; derrotar o
 * chefe (as duas estrelas do último dia) = +100 XP; todas as estrelas do ano = +300 XP.
 */

export const AOC_XP = { part1: 20, part1Coins: 2, part2: 30, part2Coins: 3, boss: 100, full: 300, fullCoins: 30 } as const;
const AOC = "https://adventofcode.com";
const UA = "LifeOS/1.0 (+https://github.com/ViniciusKanh/LifeOs; app pessoal)";
const MIN_FETCH_MS = 15 * 60 * 1000;

export class AocError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 | 422 | 429 | 502 = 400) {
    super(message);
  }
}

export const aocDays = (year: number) => (year >= 2025 ? 12 : 25);

/** Ano do evento mais recente (o de dezembro corrente, ou o do ano anterior antes de dezembro). */
export function latestEventYear(now = new Date()) {
  return now.getUTCMonth() === 11 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

/** Cada dia abre à meia-noite de Nova York (UTC-5 em dezembro). */
export function unlockAt(year: number, day: number) {
  return new Date(Date.UTC(year, 11, day, 5, 0, 0)).toISOString();
}

type RawDayLevel = Record<string, { get_star_ts?: number }>;
interface RawMember { id: number | string; name?: string | null; stars?: number; local_score?: number; last_star_ts?: number; completion_day_level?: Record<string, RawDayLevel> }
interface RawBoard { owner_id?: number | string; event?: string; members?: Record<string, RawMember> }

export interface AocMember { id: string; name: string; stars: number; score: number; days: Record<string, [number | null, number | null]> }

/** Normaliza o JSON do leaderboard. Exportada para testes. */
export function parseBoard(raw: RawBoard): { ownerId: string | null; members: AocMember[] } {
  const members = Object.values(raw?.members ?? {}).map((m) => {
    const days: AocMember["days"] = {};
    for (const [d, lv] of Object.entries(m.completion_day_level ?? {})) days[d] = [lv["1"]?.get_star_ts ?? null, lv["2"]?.get_star_ts ?? null];
    return { id: String(m.id), name: (m.name ?? `anônimo #${m.id}`).slice(0, 60), stars: Number(m.stars ?? 0), score: Number(m.local_score ?? 0), days };
  });
  members.sort((a, b) => b.score - a.score || b.stars - a.stars);
  return { ownerId: raw?.owner_id == null ? null : String(raw.owner_id), members };
}

/** Aceita "53616c74…" ou "session=53616c74…" (como aparece no navegador). */
export const cleanSession = (raw: string) => raw.trim().replace(/^["']|["']$/g, "").replace(/^session=/i, "").split(";")[0]!.trim();

async function fetchBoard(session: string, year: number, leaderboardId: string): Promise<RawBoard> {
  let text: string;
  try {
    text = await fetchJson<string>(`${AOC}/${year}/leaderboard/private/view/${encodeURIComponent(leaderboardId)}.json`, { headers: { Cookie: `session=${session}`, "User-Agent": UA, Accept: "application/json" } }, { label: "Advent of Code", responseType: "text", retries: 1, timeoutMs: 12_000 });
  } catch (e) {
    if (e instanceof IntegrationError && e.status === 404) throw new AocError("Leaderboard não encontrado. Confira o código do seu leaderboard privado.", 404);
    if (e instanceof IntegrationError) throw new AocError(`Advent of Code: ${e.message}`, 502);
    throw e;
  }
  try {
    const j = JSON.parse(text) as RawBoard;
    if (!j || typeof j !== "object" || !j.members) throw new Error("sem membros");
    return j;
  } catch {
    // Sem sessão válida o site responde com página de login em vez do JSON.
    throw new AocError("O Advent of Code não aceitou a sessão. Copie de novo o cookie 'session' (ele expira em cerca de um mês) e confira se você participa desse leaderboard.", 422);
  }
}

async function account(db: Client, ownerId: string) {
  const r = await db.execute({ sql: "SELECT * FROM aoc_accounts WHERE owner_id = ?", args: [ownerId] });
  return r.rows[0] ?? null;
}

export async function connectAoc(db: Client, ownerId: string, input: { session: string; leaderboardId: string }) {
  const session = cleanSession(input.session);
  if (!/^[0-9a-f]{40,200}$/i.test(session)) throw new AocError("O cookie 'session' do Advent of Code é um código hexadecimal longo. Copie o valor completo.", 400);
  const leaderboardId = input.leaderboardId.trim().split("-")[0]!;
  if (!/^\d{3,12}$/.test(leaderboardId)) throw new AocError("Use o número do leaderboard privado (o começo do código de convite, antes do traço).", 400);
  const year = latestEventYear();
  const board = parseBoard(await fetchBoard(session, year, leaderboardId));
  await db.execute({
    sql: `INSERT INTO aoc_accounts (owner_id, session_enc, leaderboard_id, member_id) VALUES (?, ?, ?, ?)
          ON CONFLICT (owner_id) DO UPDATE SET session_enc = excluded.session_enc, leaderboard_id = excluded.leaderboard_id,
            member_id = COALESCE(aoc_accounts.member_id, excluded.member_id), last_sync_status = NULL, last_sync_error = NULL`,
    args: [ownerId, encryptSecret(session), leaderboardId, board.ownerId],
  });
  await storeYear(db, ownerId, year, board.members);
  await recordWorldEvent(db, ownerId, { type: "aoc.connected", title: "A Forja entrou no Advent of Code", detail: `Leaderboard ${leaderboardId}` });
  return { year, members: board.members.length, memberId: board.ownerId };
}

export async function disconnectAoc(db: Client, ownerId: string) {
  await db.execute({ sql: "DELETE FROM aoc_accounts WHERE owner_id = ?", args: [ownerId] });
}

export async function setAocMember(db: Client, ownerId: string, memberId: string) {
  const r = await db.execute({ sql: "UPDATE aoc_accounts SET member_id = ? WHERE owner_id = ?", args: [memberId, ownerId] });
  if (!r.rowsAffected) throw new AocError("Conecte o Advent of Code primeiro.", 404);
}

async function storeYear(db: Client, ownerId: string, year: number, members: AocMember[]) {
  await db.execute({
    sql: "INSERT INTO aoc_years (owner_id, year, members_json, synced_at) VALUES (?, ?, ?, ?) ON CONFLICT (owner_id, year) DO UPDATE SET members_json = excluded.members_json, synced_at = excluded.synced_at",
    args: [ownerId, year, JSON.stringify(members.slice(0, 200)), new Date().toISOString()],
  });
}

/**
 * Grava as estrelas do membro e paga XP só das ganhas depois da conexão.
 * Exportada para testes (idempotente: estrela repetida nunca paga de novo).
 */
export async function applyStars(db: Client, ownerId: string, year: number, me: AocMember | undefined, connectedAt: string, tz: string) {
  if (!me) return { xp: 0, newStars: 0 };
  let xp = 0;
  let newStars = 0;
  const max = aocDays(year);
  for (const [d, parts] of Object.entries(me.days)) {
    const day = Number(d);
    if (!(day >= 1 && day <= 25)) continue;
    for (const part of [1, 2] as const) {
      const ts = parts[part - 1];
      if (!ts) continue;
      const at = new Date(ts * 1000).toISOString();
      const ins = await db.execute({ sql: "INSERT OR IGNORE INTO aoc_stars (owner_id, year, day, part, earned_at) VALUES (?, ?, ?, ?, ?)", args: [ownerId, year, day, part, at] });
      newStars += ins.rowsAffected;
      if (at < connectedAt) continue;
      const dayKey = localDayOfStored(at, tz);
      const ok = await award(db, ownerId, { sourceType: "code", sourceId: `aoc:${year}:${day}`, eventType: `star_${part}`, xp: part === 1 ? AOC_XP.part1 : AOC_XP.part2, coins: part === 1 ? AOC_XP.part1Coins : AOC_XP.part2Coins, label: `Advent of Code ${year}, dia ${day}: estrela ${part}` }, dayKey);
      if (ok) xp += part === 1 ? AOC_XP.part1 : AOC_XP.part2;
      if (part === 2 && day === max && (await award(db, ownerId, { sourceType: "code", sourceId: `aoc:${year}`, eventType: "boss", xp: AOC_XP.boss, coins: 10, label: `Chefe do Advent of Code ${year} derrotado` }, dayKey))) {
        xp += AOC_XP.boss;
        await recordWorldEvent(db, ownerId, { type: "aoc.boss", title: `O chefe do Advent of Code ${year} foi derrotado` });
      }
    }
  }
  const total = await db.execute({ sql: "SELECT COUNT(*) AS n, MAX(earned_at) AS last FROM aoc_stars WHERE owner_id = ? AND year = ?", args: [ownerId, year] });
  const last = total.rows[0]?.last == null ? null : String(total.rows[0].last);
  if (Number(total.rows[0]?.n ?? 0) >= max * 2 && last && last >= connectedAt) {
    if (await award(db, ownerId, { sourceType: "code", sourceId: `aoc:${year}`, eventType: "full", xp: AOC_XP.full, coins: AOC_XP.fullCoins, label: `Todas as estrelas do Advent of Code ${year}` }, localDayOfStored(last, tz))) xp += AOC_XP.full;
  }
  return { xp, newStars };
}

export async function syncAoc(db: Client, ownerId: string, year: number, opts: { force?: boolean } = {}) {
  const acc = await account(db, ownerId);
  if (!acc) throw new AocError("Conecte o Advent of Code primeiro.", 404);
  if (year < 2015 || year > latestEventYear()) throw new AocError("Ano sem evento do Advent of Code.", 400);
  const cached = await db.execute({ sql: "SELECT synced_at FROM aoc_years WHERE owner_id = ? AND year = ?", args: [ownerId, year] });
  if (!opts.force && cached.rows[0] && Date.now() - Date.parse(String(cached.rows[0].synced_at)) < MIN_FETCH_MS) {
    throw new AocError("O Advent of Code pede no máximo uma consulta a cada 15 minutos. Já está atualizado.", 429);
  }
  const { tz } = await userDayContext(db, ownerId);
  try {
    const board = parseBoard(await fetchBoard(decryptSecret(String(acc.session_enc)), year, String(acc.leaderboard_id)));
    await storeYear(db, ownerId, year, board.members);
    const memberId = acc.member_id == null ? board.ownerId : String(acc.member_id);
    const connectedAt = new Date(Date.parse(`${String(acc.created_at).replace(" ", "T")}Z`)).toISOString();
    const r = await applyStars(db, ownerId, year, board.members.find((m) => m.id === memberId), connectedAt, tz);
    await db.execute({ sql: "UPDATE aoc_accounts SET last_sync_at = ?, last_sync_status = 'ok', last_sync_error = NULL WHERE owner_id = ?", args: [new Date().toISOString(), ownerId] });
    return { ok: true as const, year, ...r };
  } catch (err) {
    await db.execute({ sql: "UPDATE aoc_accounts SET last_sync_at = ?, last_sync_status = 'erro', last_sync_error = ? WHERE owner_id = ?", args: [new Date().toISOString(), (err instanceof Error ? err.message : "Falha.").slice(0, 300), ownerId] });
    throw err;
  }
}

export async function getAocOverview(db: Client, ownerId: string, yearParam?: number) {
  const latest = latestEventYear();
  const year = yearParam && yearParam >= 2015 && yearParam <= latest ? yearParam : latest;
  let acc = await account(db, ownerId);
  const now = new Date();
  // Durante o evento, atualiza sozinho respeitando o intervalo mínimo de 15 min.
  if (acc) {
    const cached = await db.execute({ sql: "SELECT synced_at FROM aoc_years WHERE owner_id = ? AND year = ?", args: [ownerId, year] });
    const stale = !cached.rows[0] || Date.now() - Date.parse(String(cached.rows[0].synced_at)) >= MIN_FETCH_MS;
    if (stale && (year === latest || !cached.rows[0])) {
      await syncAoc(db, ownerId, year, { force: true }).catch(() => undefined);
      acc = await account(db, ownerId);
    }
  }
  const max = aocDays(year);
  const nextEventYear = now.getUTCMonth() === 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  const base = { year, latestYear: latest, years: Array.from({ length: latest - 2014 }, (_, i) => latest - i), days: max, nextEvent: { year: nextEventYear, startsAt: unlockAt(nextEventYear, 1), days: aocDays(nextEventYear) }, rules: AOC_XP };
  if (!acc) return { connected: false as const, ...base };
  const [yr, stars, totals, xp] = await Promise.all([
    db.execute({ sql: "SELECT members_json, synced_at FROM aoc_years WHERE owner_id = ? AND year = ?", args: [ownerId, year] }),
    db.execute({ sql: "SELECT day, part, earned_at FROM aoc_stars WHERE owner_id = ? AND year = ?", args: [ownerId, year] }),
    db.execute({ sql: "SELECT year, COUNT(*) AS n FROM aoc_stars WHERE owner_id = ? GROUP BY year", args: [ownerId] }),
    db.execute({ sql: "SELECT COALESCE(SUM(xp), 0) AS xp FROM xp_events WHERE owner_id = ? AND source_type = 'code' AND source_id LIKE 'aoc:%'", args: [ownerId] }),
  ]);
  const members = JSON.parse(String(yr.rows[0]?.members_json ?? "[]")) as AocMember[];
  const memberId = acc.member_id == null ? null : String(acc.member_id);
  const mine = new Map<number, { part1: string | null; part2: string | null }>();
  for (const s of stars.rows) {
    const d = Number(s.day);
    const cur = mine.get(d) ?? { part1: null, part2: null };
    if (Number(s.part) === 1) cur.part1 = String(s.earned_at);
    else cur.part2 = String(s.earned_at);
    mine.set(d, cur);
  }
  const grid = Array.from({ length: max }, (_, i) => {
    const day = i + 1;
    const at = unlockAt(year, day);
    const m = mine.get(day);
    return { day, unlockAt: at, open: Date.parse(at) <= now.getTime(), boss: day === max, part1: m?.part1 ?? null, part2: m?.part2 ?? null };
  });
  const myStars = stars.rows.length;
  return {
    connected: true as const,
    ...base,
    account: { leaderboardId: String(acc.leaderboard_id), memberId, lastSyncAt: acc.last_sync_at == null ? null : String(acc.last_sync_at), lastSyncStatus: acc.last_sync_status == null ? null : (String(acc.last_sync_status) as "ok" | "erro"), lastSyncError: acc.last_sync_error == null ? null : String(acc.last_sync_error) },
    syncedAt: yr.rows[0]?.synced_at == null ? null : String(yr.rows[0].synced_at),
    grid,
    myStars,
    maxStars: max * 2,
    leaderboard: members.slice(0, 20).map((m, i) => ({ rank: i + 1, id: m.id, name: m.name, stars: m.stars, score: m.score, me: m.id === memberId })),
    members: members.map((m) => ({ id: m.id, name: m.name })),
    starsByYear: totals.rows.map((r) => ({ year: Number(r.year), stars: Number(r.n), max: aocDays(Number(r.year)) * 2 })),
    xpTotal: Number(xp.rows[0]?.xp ?? 0),
  };
}
