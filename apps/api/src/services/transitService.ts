import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { award } from "./gamificationService.js";
import { fetchJson, IntegrationError } from "./integrationsCore.js";
import { normalizeStoredUtc } from "./healthService.js";
import { shiftDayKey, userDayContext } from "./localDayService.js";
import { holidayMap } from "./holidayService.js";
import { nominatim, type NominatimPlace } from "./atlasService.js";
import { estimateWalk, walkMinutes } from "./walkService.js";
import {
  directLegs,
  feedStatus,
  frequenciesOf,
  getStops,
  headwayAt,
  linesAtStops,
  nearbyStops,
  scheduledPasses,
  searchGtfsStops,
  serviceDaysFor,
  tripInfo,
  tripPath,
  type ServiceDay,
} from "./gtfsService.js";
import { resolvePublicKey } from "./publicApiKeysService.js";

/**
 * Estação das Carruagens — transporte de São Paulo numa tela própria.
 *
 * Três fontes, sempre identificadas na tela:
 * - GTFS da SPTrans (gtfsService): linhas, pontos e frequências PROGRAMADAS
 *   ("~08:18 · a cada 12 min"). É a base: funciona sem token nenhum.
 * - Olho Vivo (opcional): previsão em tempo real. Quando o token do usuário é
 *   aceito, as passagens daquela linha no ponto viram "ao vivo".
 * - OSRM (walkService): minutos a pé, calculados ao guardar ponto/jornada.
 *
 * Nada é rastreado: o usuário guarda pontos e jornadas (origem → ponto → linha →
 * ponto → destino). "Hora de partir" = passagem escolhida − caminhada − agora;
 * com compromisso na Agenda, escolhe a última que ainda chega com 5 min de folga.
 *
 * Missão "Chegar sem atraso" (fonte "transit"): +15 XP e 2 moedas por dia ao tocar
 * em "Parti agora" quando ainda dá para pegar a passagem recomendada.
 */

export const TRANSIT_XP = { onTime: 15, coins: 2, bufferMinutes: 5, graceMinutes: 2 } as const;
const SP_TZ = "America/Sao_Paulo";
const BASES = [process.env.SPTRANS_BASE_URL?.trim().replace(/\/+$/, "") || "https://api.olhovivo.sptrans.com.br/v2.1", "http://api.olhovivo.sptrans.com.br/v2.1"];

export class TransitError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 | 422 | 429 | 502 = 400) {
    super(message);
  }
}

/* Sessão do Olho Vivo: cookie apiCredentials, guardado só em memória por token. */
const sessions = new Map<string, { cookie: string; base: string; at: number }>();
const SESSION_MS = 15 * 60 * 1000;
/* Token recusado: lembra por 10 min para a tela não refazer o login a cada atualização. */
const refusedAt = new Map<string, number>();
export function resetTransitSessionsForTests() {
  sessions.clear();
  refusedAt.clear();
}

const UA = "LifeOS/1.0 (+https://github.com/ViniciusKanh/LifeOs)";
/** O Olho Vivo responde true/false (texto ou JSON, às vezes com aspas ou espaços). */
export const isLoginOk = (body: unknown) => /^\s*"?true"?\s*$/i.test(String(body ?? ""));

/**
 * Login no Olho Vivo. Tenta https e depois o endereço http oficial — os dois,
 * sempre: o https pode responder com algo diferente de "true" (página, redirect)
 * mesmo com o token válido. Só declara "recusado" quando nenhum endereço aceitou.
 */
export async function sptransLogin(token: string, fresh = false): Promise<{ cookie: string; base: string }> {
  const hit = sessions.get(token);
  if (hit && Date.now() - hit.at < SESSION_MS) return hit;
  if (!fresh && Date.now() - (refusedAt.get(token) ?? 0) < 10 * 60_000) throw new TransitError("A SPTrans recusou o token do Olho Vivo. Usando os horários programados.", 422);
  let lastErr: unknown = null;
  let refused = false;
  for (const base of [...new Set(BASES)]) {
    let cookie = "";
    try {
      const body = await fetchJson<string>(`${base}/Login/Autenticar?token=${encodeURIComponent(token.trim())}`, { method: "POST", body: "", headers: { Accept: "application/json", "User-Agent": UA } }, {
        label: "SPTrans",
        responseType: "text",
        retries: 1,
        onHeaders: (h) => {
          const list = typeof (h as Headers & { getSetCookie?: () => string[] }).getSetCookie === "function" ? (h as Headers & { getSetCookie: () => string[] }).getSetCookie() : [h.get("set-cookie") ?? ""];
          cookie = list.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
        },
      });
      if (!isLoginOk(body)) {
        refused = true;
        continue;
      }
      const s = { cookie, base, at: Date.now() };
      sessions.set(token, s);
      return s;
    } catch (e) {
      lastErr = e;
    }
  }
  if (refused) refusedAt.set(token, Date.now());
  if (refused) throw new TransitError("A SPTrans recusou o token. Confira se copiou o token inteiro (sem aspas). Token recém-criado pode levar alguns minutos para valer.", 422);
  if (lastErr instanceof IntegrationError) throw new TransitError(`SPTrans: ${lastErr.message}`, 502);
  throw new TransitError("A SPTrans não respondeu agora.", 502);
}

async function call<T>(db: Client, ownerId: string, path: string): Promise<T> {
  const { key } = await resolvePublicKey(db, ownerId, "sptrans");
  if (!key) throw new TransitError("Configure o token do Olho Vivo (SPTrans) para ver os ônibus.", 422);
  const s = await sptransLogin(key);
  try {
    return await fetchJson<T>(`${s.base}${path}`, { headers: { "User-Agent": UA, ...(s.cookie ? { Cookie: s.cookie } : {}) } }, { label: "SPTrans", timeoutMs: 10_000, retries: 1 });
  } catch (e) {
    if (e instanceof IntegrationError && (e.status === 401 || e.status === 403)) {
      sessions.delete(key);
      const again = await sptransLogin(key);
      return fetchJson<T>(`${again.base}${path}`, { headers: { "User-Agent": UA, ...(again.cookie ? { Cookie: again.cookie } : {}) } }, { label: "SPTrans", timeoutMs: 10_000, retries: 0 });
    }
    if (e instanceof IntegrationError) throw new TransitError(e.message, 502);
    throw e;
  }
}

type RawStop = { cp: number; np?: string; ed?: string; py?: number; px?: number };
type RawPrediction = { hr?: string; p?: { cp?: number; np?: string; l?: Array<{ c?: string; cl?: number; sl?: number; lt0?: string; lt1?: string; qv?: number; vs?: Array<{ p?: string | number; t?: string; a?: boolean }> }> } | null };

const toMin = (hhmm: string | undefined) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export interface Arrival { line: string; destination: string; inMinutes: number; at: string; accessible: boolean }

/** Converte a previsão do Olho Vivo em chegadas ordenadas. Exportada para testes. */
export function parsePrediction(raw: RawPrediction | null, linesFilter: string[] = []): { now: string | null; arrivals: Arrival[] } {
  const now = toMin(raw?.hr);
  const out: Arrival[] = [];
  for (const l of raw?.p?.l ?? []) {
    const line = String(l.c ?? "?");
    if (linesFilter.length && !linesFilter.includes(line)) continue;
    const destination = String((l.sl === 2 ? l.lt0 : l.lt1) ?? "").slice(0, 80);
    for (const v of l.vs ?? []) {
      const t = toMin(v.t);
      if (t == null || now == null) continue;
      let diff = t - now;
      if (diff < -720) diff += 1440; // virada da meia-noite
      if (diff < 0) continue;
      out.push({ line, destination, inMinutes: diff, at: v.t!, accessible: !!v.a });
    }
  }
  out.sort((a, b) => a.inMinutes - b.inMinutes);
  return { now: raw?.hr ?? null, arrivals: out.slice(0, 12) };
}

/**
 * Escolhe a passagem recomendada (em minutos a partir de agora). Exportada para testes.
 * - com compromisso e tempo de viagem: a última que ainda chega com folga;
 * - sem isso: a primeira que dá para alcançar caminhando.
 */
export function recommend<T extends { inMinutes: number }>(arrivals: T[], walk: number, opts: { minutesToEvent?: number | null; ride?: number | null } = {}) {
  const reachable = arrivals.filter((a) => a.inMinutes >= walk);
  if (!reachable.length) return null;
  let pick = reachable[0]!;
  let fitsEvent: boolean | null = null;
  if (opts.minutesToEvent != null && opts.ride != null) {
    const ok = reachable.filter((a) => a.inMinutes + opts.ride! + TRANSIT_XP.bufferMinutes <= opts.minutesToEvent!);
    fitsEvent = ok.length > 0;
    if (ok.length) pick = ok[ok.length - 1]!;
  }
  const next = reachable[reachable.indexOf(pick) + 1] ?? null;
  return { ...pick, leaveInMinutes: pick.inMinutes - walk, fitsEvent, next };
}

/* ─────────────────────────── Relógio de São Paulo ─────────────────────────── */

interface SpClock extends ServiceDay { dayKey: string; clock: string; holiday: string | null; weekdayLabel: string }
const WEEKDAYS = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

async function spClock(db: Client, ownerId: string, now = new Date()): Promise<SpClock> {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: SP_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short", hourCycle: "h23" }).formatToParts(now).map((p) => [p.type, p.value]));
  const dayKey = `${parts.year}-${parts.month}-${parts.day}`;
  const nowSec = Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second);
  const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(String(parts.weekday));
  const holiday = (await holidayMap(db, ownerId, dayKey, dayKey).catch(() => new Map<string, string>())).get(dayKey) ?? null;
  // Feriado roda a programação de domingo (regra da SPTrans).
  return { dayKey, nowSec, weekday: holiday ? 6 : Math.max(0, wd), clock: `${parts.hour}:${parts.minute}`, holiday, weekdayLabel: WEEKDAYS[Math.max(0, wd)]! };
}

const hhmmOf = (sec: number) => {
  const s = ((sec % 86400) + 86400) % 86400;
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
};

/* ─────────────────────────── Passagens (programadas + ao vivo) ─────────────────────────── */

export interface Pass {
  stopId: number;
  tripId: string | null;
  line: string;
  headsign: string | null;
  color: string | null;
  textColor: string | null;
  routeType: number;
  atSec: number;
  at: string;
  inMinutes: number;
  headwayMin: number | null;
  source: "programado" | "ao vivo";
  accessible: boolean;
}

async function scheduleFor(db: Client, stopIds: number[], clock: SpClock, horizonMin: number, perLine = 3): Promise<Map<number, Pass[]>> {
  const out = new Map<number, Pass[]>();
  const lines = await linesAtStops(db, stopIds);
  const all = [...lines.values()].flat();
  const [active, freqs] = await Promise.all([serviceDaysFor(db, [...new Set(all.map((l) => l.serviceId))], clock), frequenciesOf(db, all.map((l) => l.tripId))]);
  for (const [stopId, list] of lines) {
    const passes: Pass[] = [];
    for (const l of list) {
      if (!active.has(l.serviceId)) continue;
      const f = freqs.get(l.tripId) ?? [];
      for (const p of scheduledPasses(f, l.offsetSec, clock.nowSec, clock.nowSec + horizonMin * 60, perLine)) {
        passes.push({ stopId, tripId: l.tripId, line: l.line, headsign: l.headsign, color: l.color, textColor: l.textColor, routeType: l.routeType, atSec: p.atSec, at: hhmmOf(p.atSec), inMinutes: Math.max(0, Math.round((p.atSec - clock.nowSec) / 60)), headwayMin: Math.round(p.headwaySecs / 60), source: "programado", accessible: false });
      }
    }
    out.set(stopId, passes.sort((a, b) => a.atSec - b.atSec));
  }
  return out;
}

/** Olho Vivo: previsão de cada ponto. Sem token ou com token recusado, devolve só o motivo. */
async function liveFor(db: Client, ownerId: string, codes: number[]): Promise<{ byStop: Map<number, Arrival[]>; error: string | null; enabled: boolean }> {
  const { key } = await resolvePublicKey(db, ownerId, "sptrans");
  if (!key || !codes.length) return { byStop: new Map(), error: null, enabled: !!key };
  const byStop = new Map<number, Arrival[]>();
  try {
    await sptransLogin(key);
    for (const code of codes.slice(0, 4)) {
      const raw = await call<RawPrediction>(db, ownerId, `/Previsao/Parada?codigoParada=${code}`);
      byStop.set(code, parsePrediction(raw).arrivals);
    }
    return { byStop, error: null, enabled: true };
  } catch (e) {
    return { byStop, error: e instanceof Error ? e.message : "Olho Vivo indisponível.", enabled: true };
  }
}

/** Troca as passagens programadas de uma linha pelas ao vivo quando o Olho Vivo tem aquela linha no ponto. */
export function mergeLive(scheduled: Pass[], live: Arrival[], stopId: number, nowSec: number): Pass[] {
  if (!live.length) return scheduled;
  const liveLines = new Set(live.map((a) => a.line));
  const style = new Map(scheduled.map((p) => [p.line, p]));
  const keep = scheduled.filter((p) => !liveLines.has(p.line));
  const fromLive: Pass[] = live.map((a) => {
    const s = style.get(a.line);
    const atSec = nowSec + a.inMinutes * 60;
    return { stopId, tripId: s?.tripId ?? null, line: a.line, headsign: a.destination || s?.headsign || null, color: s?.color ?? null, textColor: s?.textColor ?? null, routeType: s?.routeType ?? 3, atSec, at: a.at, inMinutes: a.inMinutes, headwayMin: s?.headwayMin ?? null, source: "ao vivo", accessible: a.accessible };
  });
  return [...keep, ...fromLive].sort((a, b) => a.atSec - b.atSec);
}

/* ─────────────────────────── Pontos guardados ─────────────────────────── */

interface StopRow { id: string; code: number; name: string; address: string | null; walk: number; ride: number | null; lines: string[]; position: number; lat: number | null; lon: number | null }
async function listStops(db: Client, ownerId: string): Promise<StopRow[]> {
  const r = await db.execute({ sql: "SELECT * FROM transit_stops WHERE owner_id = ? ORDER BY position, created_at", args: [ownerId] });
  return r.rows.map((s) => ({ id: String(s.id), code: Number(s.stop_code), name: String(s.name), address: s.address == null ? null : String(s.address), walk: Number(s.walk_minutes), ride: s.ride_minutes == null ? null : Number(s.ride_minutes), lines: JSON.parse(String(s.lines_json ?? "[]")) as string[], position: Number(s.position), lat: s.lat == null ? null : Number(s.lat), lon: s.lon == null ? null : Number(s.lon) }));
}

export async function searchStops(db: Client, ownerId: string, q: string) {
  const feed = await feedStatus(db);
  if (feed.status === "pronto" || (feed.counts.stops ?? 0) > 0) {
    const found = await searchGtfsStops(db, q);
    const lines = await linesAtStops(db, found.map((s) => s.stopId));
    return found.map((s) => ({ code: s.stopId, name: s.name, address: s.ref, lat: s.lat, lon: s.lon, lines: summarizeLines(lines.get(s.stopId) ?? []) }));
  }
  const raw = (await call<RawStop[]>(db, ownerId, `/Parada/Buscar?termosBusca=${encodeURIComponent(q)}`)) ?? [];
  return raw.slice(0, 15).map((s) => ({ code: Number(s.cp), name: String(s.np ?? "Ponto").slice(0, 120), address: s.ed ? String(s.ed).slice(0, 160) : null, lat: s.py ?? null, lon: s.px ?? null, lines: [] as LineChip[] }));
}

export interface LineChip { line: string; headsign: string | null; color: string | null; textColor: string | null; routeType: number }
function summarizeLines(list: Array<{ line: string; headsign: string | null; color: string | null; textColor: string | null; routeType: number }>, max = 10): LineChip[] {
  const seen = new Map<string, LineChip>();
  for (const l of list) if (!seen.has(`${l.line}|${l.headsign}`)) seen.set(`${l.line}|${l.headsign}`, { line: l.line, headsign: l.headsign, color: l.color, textColor: l.textColor, routeType: l.routeType });
  return [...seen.values()].sort((a, b) => a.line.localeCompare(b.line)).slice(0, max);
}

/** Pontos perto de uma coordenada (ex.: um lugar do Atlas), com caminhada estimada e linhas. */
export async function stopsNear(db: Client, lat: number, lon: number) {
  const feed = await feedStatus(db);
  if (feed.status !== "pronto") throw new TransitError("Os horários da SPTrans ainda não foram importados. Peça ao administrador para importar o GTFS.", 409);
  const near = await nearbyStops(db, lat, lon, 500, 12);
  const lines = await linesAtStops(db, near.map((s) => s.stopId));
  return near.map((s) => ({ code: s.stopId, name: s.name, address: s.ref, lat: s.lat, lon: s.lon, meters: s.meters, walkMinutes: estimateWalk([lat, lon], [s.lat, s.lon]).minutes, lines: summarizeLines(lines.get(s.stopId) ?? []) }));
}

/** Busca de endereço (Nominatim, limitado à Grande São Paulo) para origem/destino. */
export async function geocode(q: string) {
  const list = await nominatim<NominatimPlace[]>(`search?q=${encodeURIComponent(q)}&format=jsonv2&limit=6&countrycodes=br&viewbox=-47.0,-23.2,-46.2,-23.95&bounded=1`);
  return (list ?? []).map((p) => ({ label: (p.name || p.display_name.split(",")[0] || "Lugar").slice(0, 80), detail: p.display_name.slice(0, 160), lat: Number(p.lat), lon: Number(p.lon) }));
}

export async function addStop(db: Client, ownerId: string, p: { code: number; name?: string; address?: string | null; walkMinutes?: number; rideMinutes?: number | null; lines?: string[]; from?: { lat: number; lon: number } | null }) {
  const n = await db.execute({ sql: "SELECT COUNT(*) AS n FROM transit_stops WHERE owner_id = ?", args: [ownerId] });
  if (Number(n.rows[0]?.n ?? 0) >= 6) throw new TransitError("Guarde no máximo 6 pontos.", 409);
  // Com o GTFS importado, nome e posição vêm da fonte oficial (não do cliente).
  const g = (await getStops(db, [p.code])).get(p.code);
  if (!g && !p.name) throw new TransitError("Ponto não encontrado nos dados da SPTrans.", 404);
  const walk = p.from && g ? (await walkMinutes([p.from.lat, p.from.lon], [g.lat, g.lon])).minutes : (p.walkMinutes ?? 5);
  const id = nanoid();
  try {
    await db.execute({
      sql: "INSERT INTO transit_stops (id, owner_id, stop_code, name, address, walk_minutes, ride_minutes, lines_json, position, lat, lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [id, ownerId, p.code, (g?.name ?? p.name!).slice(0, 120), (g?.ref ?? p.address ?? null)?.slice(0, 160) ?? null, Math.min(60, walk), p.rideMinutes ?? null, JSON.stringify(p.lines ?? []), Number(n.rows[0]?.n ?? 0), g?.lat ?? null, g?.lon ?? null],
    });
  } catch {
    throw new TransitError("Esse ponto já está guardado.", 409);
  }
  return { id, walkMinutes: Math.min(60, walk) };
}

export async function updateStop(db: Client, ownerId: string, id: string, p: { walkMinutes?: number; rideMinutes?: number | null; lines?: string[]; first?: boolean }) {
  const r = await db.execute({ sql: "SELECT id FROM transit_stops WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  if (!r.rows[0]) throw new TransitError("Ponto não encontrado.", 404);
  if (p.walkMinutes !== undefined) await db.execute({ sql: "UPDATE transit_stops SET walk_minutes = ? WHERE id = ? AND owner_id = ?", args: [p.walkMinutes, id, ownerId] });
  if (p.rideMinutes !== undefined) await db.execute({ sql: "UPDATE transit_stops SET ride_minutes = ? WHERE id = ? AND owner_id = ?", args: [p.rideMinutes, id, ownerId] });
  if (p.lines !== undefined) await db.execute({ sql: "UPDATE transit_stops SET lines_json = ? WHERE id = ? AND owner_id = ?", args: [JSON.stringify(p.lines), id, ownerId] });
  if (p.first) {
    await db.execute({ sql: "UPDATE transit_stops SET position = position + 1 WHERE owner_id = ?", args: [ownerId] });
    await db.execute({ sql: "UPDATE transit_stops SET position = 0 WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  }
}

export async function deleteStop(db: Client, ownerId: string, id: string) {
  const r = await db.execute({ sql: "DELETE FROM transit_stops WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  if (!r.rowsAffected) throw new TransitError("Ponto não encontrado.", 404);
}

/* ─────────────────────────── Oráculo de rotas (linhas diretas) ─────────────────────────── */

export interface Place { label: string; lat: number; lon: number }

/**
 * Viagens diretas entre dois lugares: pontos a até 600 m de cada lado, linhas
 * que passam nos dois (embarque antes do desembarque), espera pela próxima
 * passagem programada. Baldeações não entram — a tela diz isso.
 */
export async function planRoute(db: Client, ownerId: string, from: Place, to: Place) {
  const feed = await feedStatus(db);
  if (feed.status !== "pronto") throw new TransitError("Os horários da SPTrans ainda não foram importados. Peça ao administrador para importar o GTFS.", 409);
  const clock = await spClock(db, ownerId);
  const walkAll = estimateWalk([from.lat, from.lon], [to.lat, to.lon]);
  const [a, b] = await Promise.all([nearbyStops(db, from.lat, from.lon, 600, 25), nearbyStops(db, to.lat, to.lon, 600, 25)]);
  const legs = await directLegs(db, a.map((s) => s.stopId), b.map((s) => s.stopId));
  const stopA = new Map(a.map((s) => [s.stopId, s]));
  const stopB = new Map(b.map((s) => [s.stopId, s]));
  const info = await tripInfo(db, legs.map((l) => l.tripId));
  const [active, freqs] = await Promise.all([serviceDaysFor(db, [...new Set([...info.values()].map((i) => i.serviceId))], clock), frequenciesOf(db, [...new Set(legs.map((l) => l.tripId))])]);
  const offsets = await boardOffsets(db, legs);

  type Opt = { tripId: string; board: number; boardSeq: number; alight: number; alightSeq: number; walkTo: number; walkFrom: number; ride: number; wait: number; busAtSec: number; total: number; estimated: boolean };
  const evaluate = (l: (typeof legs)[number], walkTo: number, walkFrom: number, estimated: boolean): Opt | null => {
    const i = info.get(l.tripId);
    if (!i || !active.has(i.serviceId)) return null;
    const pass = scheduledPasses(freqs.get(l.tripId) ?? [], offsets.get(`${l.tripId}:${l.boardSeq}`) ?? 0, clock.nowSec + walkTo * 60, clock.nowSec + 3 * 3600, 1)[0];
    if (!pass) return null;
    const wait = Math.round((pass.atSec - clock.nowSec) / 60) - walkTo;
    const ride = Math.round(l.rideSec / 60);
    return { tripId: l.tripId, board: l.board, boardSeq: l.boardSeq, alight: l.alight, alightSeq: l.alightSeq, walkTo, walkFrom, ride, wait, busAtSec: pass.atSec, total: walkTo + wait + ride + walkFrom, estimated };
  };
  const best = new Map<string, Opt>();
  for (const l of legs) {
    const sa = stopA.get(l.board)!;
    const sb = stopB.get(l.alight)!;
    const o = evaluate(l, estimateWalk([from.lat, from.lon], [sa.lat, sa.lon]).minutes, estimateWalk([sb.lat, sb.lon], [to.lat, to.lon]).minutes, true);
    if (!o) continue;
    const i = info.get(l.tripId)!;
    const key = `${i.line}|${i.headsign}`;
    if (!best.has(key) || best.get(key)!.total > o.total) best.set(key, o);
  }
  const ranked = [...best.values()].sort((x, y) => x.total - y.total).slice(0, 4);
  // Refina as três melhores com a caminhada real do OSRM.
  const refined: Opt[] = [];
  for (const [idx, o] of ranked.entries()) {
    if (idx > 2) {
      refined.push(o);
      continue;
    }
    const sa = stopA.get(o.board)!;
    const sb = stopB.get(o.alight)!;
    const [w1, w2] = await Promise.all([walkMinutes([from.lat, from.lon], [sa.lat, sa.lon]), walkMinutes([sb.lat, sb.lon], [to.lat, to.lon])]);
    const leg = legs.find((l) => l.tripId === o.tripId && l.board === o.board && l.alight === o.alight)!;
    refined.push(evaluate(leg, w1.minutes, w2.minutes, w1.estimated || w2.estimated) ?? o);
  }
  refined.sort((x, y) => x.total - y.total);
  const options = await Promise.all(
    refined.map(async (o) => {
      const i = info.get(o.tripId)!;
      return {
        tripId: o.tripId,
        line: i.line,
        headsign: i.headsign,
        longName: i.longName,
        color: i.color,
        textColor: i.textColor,
        routeType: i.routeType,
        board: { stopId: o.board, seq: o.boardSeq, name: stopA.get(o.board)!.name, lat: stopA.get(o.board)!.lat, lon: stopA.get(o.board)!.lon },
        alight: { stopId: o.alight, seq: o.alightSeq, name: stopB.get(o.alight)!.name, lat: stopB.get(o.alight)!.lat, lon: stopB.get(o.alight)!.lon },
        walkTo: o.walkTo,
        walkFrom: o.walkFrom,
        wait: o.wait,
        ride: o.ride,
        total: o.total,
        busAt: hhmmOf(o.busAtSec),
        arriveAt: hhmmOf(o.busAtSec + (o.ride + o.walkFrom) * 60),
        headwayMin: headwayAt(freqs.get(o.tripId) ?? [], o.busAtSec - (offsets.get(`${o.tripId}:${o.boardSeq}`) ?? 0)),
        walkEstimated: o.estimated,
        path: await tripPath(db, o.tripId, o.boardSeq, o.alightSeq),
      };
    }),
  );
  return { from, to, options, walkOnlyMinutes: walkAll.minutes, closeEnough: walkAll.minutes <= 12, clock: clock.clock };
}

async function boardOffsets(db: Client, legs: Array<{ tripId: string; boardSeq: number }>) {
  const out = new Map<string, number>();
  const keys = [...new Set(legs.map((l) => `${l.tripId}:${l.boardSeq}`))];
  for (let i = 0; i < keys.length; i += 300) {
    const chunk = keys.slice(i, i + 300).map((k) => k.split(":"));
    const r = await db.execute({ sql: `SELECT trip_id, seq, offset_sec FROM gtfs_stop_times WHERE ${chunk.map(() => "(trip_id = ? AND seq = ?)").join(" OR ")}`, args: chunk.flatMap(([t, s]) => [t!, Number(s)]) });
    for (const x of r.rows) out.set(`${String(x.trip_id)}:${Number(x.seq)}`, Number(x.offset_sec));
  }
  return out;
}

/* ─────────────────────────── Jornadas ─────────────────────────── */

interface JourneyRow { id: string; name: string; originLabel: string; originLat: number; originLon: number; destLabel: string; destLat: number; destLon: number; boardStopId: number; boardSeq: number; alightStopId: number; alightSeq: number; tripId: string; walkTo: number; walkFrom: number; walkEstimated: boolean; ride: number; primary: boolean }
async function listJourneys(db: Client, ownerId: string): Promise<JourneyRow[]> {
  const r = await db.execute({ sql: "SELECT * FROM transit_journeys WHERE owner_id = ? ORDER BY is_primary DESC, created_at", args: [ownerId] });
  return r.rows.map((j) => ({ id: String(j.id), name: String(j.name), originLabel: String(j.origin_label), originLat: Number(j.origin_lat), originLon: Number(j.origin_lon), destLabel: String(j.dest_label), destLat: Number(j.dest_lat), destLon: Number(j.dest_lon), boardStopId: Number(j.board_stop_id), boardSeq: Number(j.board_seq), alightStopId: Number(j.alight_stop_id), alightSeq: Number(j.alight_seq), tripId: String(j.trip_id), walkTo: Number(j.walk_to_min), walkFrom: Number(j.walk_from_min), walkEstimated: !!Number(j.walk_estimated), ride: Number(j.ride_min), primary: !!Number(j.is_primary) }));
}

export async function createJourney(db: Client, ownerId: string, p: { name: string; origin: Place; dest: Place; tripId: string; boardSeq: number; alightSeq: number }) {
  const n = await db.execute({ sql: "SELECT COUNT(*) AS n FROM transit_journeys WHERE owner_id = ?", args: [ownerId] });
  if (Number(n.rows[0]?.n ?? 0) >= 6) throw new TransitError("Guarde no máximo 6 jornadas.", 409);
  // Paradas e tempo de viagem conferidos no GTFS — o cliente só aponta a viagem e as posições.
  const st = await db.execute({ sql: "SELECT st.seq, st.stop_id, st.offset_sec, s.lat, s.lon FROM gtfs_stop_times st JOIN gtfs_stops s ON s.stop_id = st.stop_id WHERE st.trip_id = ? AND st.seq IN (?, ?)", args: [p.tripId, p.boardSeq, p.alightSeq] });
  const board = st.rows.find((x) => Number(x.seq) === p.boardSeq);
  const alight = st.rows.find((x) => Number(x.seq) === p.alightSeq);
  if (!board || !alight || p.alightSeq <= p.boardSeq) throw new TransitError("Essa combinação de linha e pontos não existe nos horários da SPTrans.", 422);
  const [w1, w2] = await Promise.all([walkMinutes([p.origin.lat, p.origin.lon], [Number(board.lat), Number(board.lon)]), walkMinutes([Number(alight.lat), Number(alight.lon)], [p.dest.lat, p.dest.lon])]);
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO transit_journeys (id, owner_id, name, origin_label, origin_lat, origin_lon, dest_label, dest_lat, dest_lon, board_stop_id, board_seq, alight_stop_id, alight_seq, trip_id, walk_to_min, walk_from_min, walk_estimated, ride_min, is_primary)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, ownerId, p.name.slice(0, 60), p.origin.label.slice(0, 80), p.origin.lat, p.origin.lon, p.dest.label.slice(0, 80), p.dest.lat, p.dest.lon, Number(board.stop_id), p.boardSeq, Number(alight.stop_id), p.alightSeq, p.tripId, Math.min(90, w1.minutes), Math.min(90, w2.minutes), w1.estimated || w2.estimated ? 1 : 0, Math.min(300, Math.round((Number(alight.offset_sec) - Number(board.offset_sec)) / 60)), Number(n.rows[0]?.n ?? 0) === 0 ? 1 : 0],
  });
  return { id };
}

export async function setPrimaryJourney(db: Client, ownerId: string, id: string) {
  const r = await db.execute({ sql: "SELECT id FROM transit_journeys WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  if (!r.rows[0]) throw new TransitError("Jornada não encontrada.", 404);
  await db.batch([{ sql: "UPDATE transit_journeys SET is_primary = 0 WHERE owner_id = ?", args: [ownerId] }, { sql: "UPDATE transit_journeys SET is_primary = 1 WHERE id = ? AND owner_id = ?", args: [id, ownerId] }], "write");
}

export async function deleteJourney(db: Client, ownerId: string, id: string) {
  const r = await db.execute({ sql: "DELETE FROM transit_journeys WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  if (!r.rowsAffected) throw new TransitError("Jornada não encontrada.", 404);
  await db.execute({ sql: "UPDATE transit_journeys SET is_primary = 1 WHERE owner_id = ? AND id = (SELECT id FROM transit_journeys WHERE owner_id = ? ORDER BY created_at LIMIT 1) AND NOT EXISTS (SELECT 1 FROM transit_journeys WHERE owner_id = ? AND is_primary = 1)", args: [ownerId, ownerId, ownerId] });
}

async function nextEvent(db: Client, ownerId: string) {
  const now = Date.now();
  const r = await db.execute({
    sql: "SELECT id, title, starts_at FROM events WHERE owner_id = ? AND all_day = 0 AND starts_at >= ? AND starts_at <= ? ORDER BY starts_at LIMIT 10",
    args: [ownerId, new Date(now - 26 * 3600_000).toISOString().slice(0, 10), new Date(now + 26 * 3600_000).toISOString()],
  });
  for (const e of r.rows) {
    const ms = Date.parse(normalizeStoredUtc(String(e.starts_at)));
    if (Number.isNaN(ms) || ms <= now || ms - now > 8 * 3600_000) continue;
    return { id: String(e.id), title: String(e.title), startsAt: new Date(ms).toISOString(), minutesTo: Math.round((ms - now) / 60_000) };
  }
  return null;
}

type Plan = ReturnType<typeof planFrom>;
/** "Hora de partir" de uma jornada a partir das passagens do ponto de embarque. Exportada para testes. */
export function planFrom(passes: Pass[], j: Pick<JourneyRow, "walkTo" | "walkFrom" | "ride">, nowSec: number, event: { minutesTo: number } | null) {
  const rec = recommend(passes, j.walkTo, { minutesToEvent: event?.minutesTo ?? null, ride: j.ride + j.walkFrom });
  if (!rec) return null;
  const leaveAtSec = rec.atSec - j.walkTo * 60;
  const arriveAtSec = rec.atSec + (j.ride + j.walkFrom) * 60;
  return {
    pass: { line: rec.line, headsign: rec.headsign, at: rec.at, inMinutes: rec.inMinutes, source: rec.source, headwayMin: rec.headwayMin, color: rec.color, textColor: rec.textColor },
    leaveInSeconds: leaveAtSec - nowSec,
    leaveAt: hhmmOf(leaveAtSec),
    arriveAt: hhmmOf(arriveAtSec),
    fitsEvent: rec.fitsEvent,
    slackMinutes: event ? event.minutesTo - Math.round((arriveAtSec - nowSec) / 60) : null,
    next: rec.next ? { at: rec.next.at, leaveAt: hhmmOf(rec.next.atSec - j.walkTo * 60), source: rec.next.source } : null,
  };
}

/* ─────────────────────────── Visão geral ─────────────────────────── */

export async function getStationOverview(db: Client, ownerId: string) {
  const [clock, feed, keyInfo, stops, journeys, event] = await Promise.all([spClock(db, ownerId), feedStatus(db), resolvePublicKey(db, ownerId, "sptrans"), listStops(db, ownerId), listJourneys(db, ownerId), nextEvent(db, ownerId)]);
  const { today } = await userDayContext(db, ownerId);
  const stopIds = [...new Set([...stops.map((s) => s.code), ...journeys.map((j) => j.boardStopId)])];
  const ready = feed.status === "pronto";
  const [sched, live, gtfsStops] = await Promise.all([ready ? scheduleFor(db, stopIds, clock, 90) : Promise.resolve(new Map<number, Pass[]>()), liveFor(db, ownerId, stopIds), ready ? getStops(db, [...stopIds, ...journeys.map((j) => j.alightStopId)]) : Promise.resolve(new Map())]);
  const passesAt = (code: number) => mergeLive(sched.get(code) ?? [], live.byStop.get(code) ?? [], code, clock.nowSec);
  const linesHere = ready ? await linesAtStops(db, stops.map((s) => s.code)) : new Map();

  const stopCards = stops.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    address: s.address,
    walk: s.walk,
    lat: s.lat ?? gtfsStops.get(s.code)?.lat ?? null,
    lon: s.lon ?? gtfsStops.get(s.code)?.lon ?? null,
    lines: s.lines,
    linesHere: summarizeLines(linesHere.get(s.code) ?? []),
    passes: passesAt(s.code).filter((p) => !s.lines.length || s.lines.includes(p.line)).slice(0, 6),
  }));

  const info = await tripInfo(db, journeys.map((j) => j.tripId));
  const journeyCards = await Promise.all(
    journeys.map(async (j) => {
      const i = info.get(j.tripId);
      const passes = passesAt(j.boardStopId).filter((p) => p.tripId === j.tripId || (i && p.line === i.line && p.source === "ao vivo"));
      return {
        ...j,
        line: i?.line ?? "?",
        headsign: i?.headsign ?? null,
        color: i?.color ?? null,
        textColor: i?.textColor ?? null,
        routeType: i?.routeType ?? 3,
        boardName: gtfsStops.get(j.boardStopId)?.name ?? `Ponto ${j.boardStopId}`,
        boardLat: gtfsStops.get(j.boardStopId)?.lat ?? null,
        boardLon: gtfsStops.get(j.boardStopId)?.lon ?? null,
        alightName: gtfsStops.get(j.alightStopId)?.name ?? `Ponto ${j.alightStopId}`,
        alightLat: gtfsStops.get(j.alightStopId)?.lat ?? null,
        alightLon: gtfsStops.get(j.alightStopId)?.lon ?? null,
        plan: planFrom(passes, j, clock.nowSec, event) as Plan,
        path: j.primary && ready ? await tripPath(db, j.tripId, j.boardSeq, j.alightSeq) : [],
      };
    }),
  );

  const nameOf = new Map(stopCards.map((s) => [s.code, s.name] as const));
  for (const j of journeyCards) if (!nameOf.has(j.boardStopId)) nameOf.set(j.boardStopId, j.boardName);
  const board = stopIds
    .flatMap((code) => passesAt(code).filter((p) => p.inMinutes <= 60).map((p) => ({ ...p, stopName: nameOf.get(code) ?? String(code) })))
    .sort((a, b) => a.atSec - b.atSec)
    .slice(0, 10);

  const weekFrom = shiftDayKey(today, -6);
  const [dep, total, week, log, places] = await Promise.all([
    db.execute({ sql: "SELECT * FROM transit_departures WHERE owner_id = ? AND day_key = ?", args: [ownerId, today] }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM transit_departures WHERE owner_id = ? AND on_time = 1", args: [ownerId] }),
    db.execute({ sql: "SELECT day_key, on_time FROM transit_departures WHERE owner_id = ? AND day_key >= ?", args: [ownerId, weekFrom] }),
    db.execute({ sql: "SELECT day_key, line, left_at, on_time, event_title, source FROM transit_departures WHERE owner_id = ? ORDER BY day_key DESC LIMIT 8", args: [ownerId] }),
    db.execute({ sql: "SELECT id, name, category, lat, lng FROM atlas_places WHERE owner_id = ? ORDER BY favorite DESC, visits DESC, name LIMIT 30", args: [ownerId] }).catch(() => ({ rows: [] })),
  ]);
  const d = dep.rows[0];
  const weekMap = new Map(week.rows.map((r) => [String(r.day_key), !!Number(r.on_time)]));
  return {
    clock: { dayKey: clock.dayKey, time: clock.clock, nowSec: clock.nowSec, weekday: clock.weekdayLabel, holiday: clock.holiday },
    feed: { ...feed, ready },
    live: { key: keyInfo.status, enabled: live.enabled, ok: live.enabled && !live.error, error: live.error },
    event,
    stops: stopCards,
    journeys: journeyCards,
    board,
    today: d ? { leftAt: String(d.left_at), onTime: !!Number(d.on_time), line: d.line == null ? null : String(d.line), eventTitle: d.event_title == null ? null : String(d.event_title) } : null,
    stats: {
      onTimeTotal: Number(total.rows[0]?.n ?? 0),
      week: Array.from({ length: 7 }, (_, i) => shiftDayKey(weekFrom, i)).map((day) => ({ day, onTime: weekMap.has(day) ? weekMap.get(day)! : null })),
      log: log.rows.map((r) => ({ day: String(r.day_key), line: r.line == null ? null : String(r.line), leftAt: String(r.left_at), onTime: !!Number(r.on_time), eventTitle: r.event_title == null ? null : String(r.event_title), source: r.source == null ? null : String(r.source) })),
    },
    places: places.rows.map((p) => ({ id: String(p.id), label: String(p.name), category: String(p.category), lat: Number(p.lat), lon: Number(p.lng) })),
    rules: TRANSIT_XP,
  };
}

/**
 * "Parti agora": registra a partida do dia (uma por dia). Pontual quando, neste
 * momento, a passagem recomendada ainda é alcançável (até 2 min de atraso, no máximo
 * 20 min de antecedência) e, havendo compromisso, chega a tempo.
 */
export async function recordDeparture(db: Client, ownerId: string, input: { journeyId?: string; stopId?: string }) {
  const { today } = await userDayContext(db, ownerId);
  const existing = await db.execute({ sql: "SELECT on_time FROM transit_departures WHERE owner_id = ? AND day_key = ?", args: [ownerId, today] });
  if (existing.rows[0]) throw new TransitError("A partida de hoje já foi registrada.", 409);
  const o = await getStationOverview(db, ownerId);
  let plan: { line: string | null; leaveInSeconds: number | null; fitsEvent: boolean | null; source: string | null; stopCode: number; busIn: number | null } | null = null;
  if (input.journeyId) {
    const j = o.journeys.find((x) => x.id === input.journeyId);
    if (!j) throw new TransitError("Jornada não encontrada.", 404);
    plan = { line: j.plan?.pass.line ?? j.line, leaveInSeconds: j.plan?.leaveInSeconds ?? null, fitsEvent: j.plan?.fitsEvent ?? null, source: j.plan?.pass.source ?? null, stopCode: j.boardStopId, busIn: j.plan?.pass.inMinutes ?? null };
  } else {
    const s = o.stops.find((x) => x.id === input.stopId);
    if (!s) throw new TransitError("Ponto não encontrado.", 404);
    const rec = recommend(s.passes, s.walk, { minutesToEvent: o.event?.minutesTo ?? null, ride: null });
    plan = { line: rec?.line ?? null, leaveInSeconds: rec ? rec.leaveInMinutes * 60 : null, fitsEvent: rec?.fitsEvent ?? null, source: rec?.source ?? null, stopCode: s.code, busIn: rec?.inMinutes ?? null };
  }
  if (!o.feed.ready && !o.live.ok) throw new TransitError("Sem horários para conferir: importe o GTFS da SPTrans ou configure o Olho Vivo.", 409);
  const onTime = plan.leaveInSeconds != null && plan.leaveInSeconds >= -TRANSIT_XP.graceMinutes * 60 && plan.leaveInSeconds <= 20 * 60 && plan.fitsEvent !== false;
  const recommendedAt = plan.leaveInSeconds != null ? new Date(Date.now() + plan.leaveInSeconds * 1000).toISOString() : null;
  await db.execute({
    sql: "INSERT INTO transit_departures (owner_id, day_key, stop_code, line, event_id, event_title, recommended_at, left_at, on_time, journey_id, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    args: [ownerId, today, plan.stopCode, plan.line, o.event?.id ?? null, o.event?.title ?? null, recommendedAt, new Date().toISOString(), onTime ? 1 : 0, input.journeyId ?? null, plan.source],
  });
  let xp = 0;
  if (onTime) {
    const ok = await award(db, ownerId, { sourceType: "transit", sourceId: `saida:${today}`, eventType: "on_time", xp: TRANSIT_XP.onTime, coins: TRANSIT_XP.coins, label: o.event ? `Saiu na hora para "${o.event.title.slice(0, 60)}"` : "Saiu na hora certa para o ônibus" }, today);
    if (ok) xp = TRANSIT_XP.onTime;
  }
  return { onTime, xp, line: plan.line, busInMinutes: plan.busIn, source: plan.source };
}

