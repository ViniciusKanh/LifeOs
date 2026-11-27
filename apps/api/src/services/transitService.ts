import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { award } from "./gamificationService.js";
import { fetchJson, IntegrationError } from "./integrationsCore.js";
import { normalizeStoredUtc } from "./healthService.js";
import { userDayContext } from "./localDayService.js";
import { resolvePublicKey } from "./publicApiKeysService.js";

/**
 * Hora de Sair (Hoje) — previsão real de chegada dos ônibus de São Paulo
 * (SPTrans Olho Vivo). O token é do cadastro gratuito do usuário no portal do
 * desenvolvedor da SPTrans (ou do servidor, via SPTRANS_TOKEN).
 *
 * Nada é rastreado: o usuário salva os pontos que usa e o tempo de caminhada.
 * A recomendação "saia em X min" = chegada do ônibus − caminhada − agora. Com o
 * tempo de viagem do ponto preenchido, escolhe o último ônibus que ainda chega
 * antes do próximo compromisso da Agenda (com 5 min de folga).
 *
 * Missão "Chegar sem atraso" (fonte "transit"): +15 XP e 2 moedas por dia ao tocar
 * em "Saí agora" quando ainda dá para pegar o ônibus recomendado.
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
export function resetTransitSessionsForTests() {
  sessions.clear();
}

const UA = "LifeOS/1.0 (+https://github.com/ViniciusKanh/LifeOs)";
/** O Olho Vivo responde true/false (texto ou JSON, às vezes com aspas ou espaços). */
export const isLoginOk = (body: unknown) => /^\s*"?true"?\s*$/i.test(String(body ?? ""));

/**
 * Login no Olho Vivo. Tenta https e depois o endereço http oficial — os dois,
 * sempre: o https pode responder com algo diferente de "true" (página, redirect)
 * mesmo com o token válido. Só declara "recusado" quando nenhum endereço aceitou.
 */
export async function sptransLogin(token: string): Promise<{ cookie: string; base: string }> {
  const hit = sessions.get(token);
  if (hit && Date.now() - hit.at < SESSION_MS) return hit;
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

export async function searchStops(db: Client, ownerId: string, q: string) {
  const raw = (await call<RawStop[]>(db, ownerId, `/Parada/Buscar?termosBusca=${encodeURIComponent(q)}`)) ?? [];
  return raw.slice(0, 15).map((s) => ({ code: Number(s.cp), name: String(s.np ?? "Ponto").slice(0, 120), address: s.ed ? String(s.ed).slice(0, 160) : null }));
}

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

/** Minutos desde a meia-noite em São Paulo. */
function spNowMinutes(now = new Date()) {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: SP_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Escolhe o ônibus recomendado. Exportada para testes.
 * - com compromisso e tempo de viagem: o último que ainda chega com folga;
 * - sem isso: o primeiro que dá para alcançar caminhando.
 */
export function recommend(arrivals: Arrival[], walk: number, opts: { minutesToEvent?: number | null; ride?: number | null } = {}) {
  const reachable = arrivals.filter((a) => a.inMinutes >= walk);
  if (!reachable.length) return null;
  let pick = reachable[0]!;
  let fitsEvent: boolean | null = null;
  if (opts.minutesToEvent != null && opts.ride != null) {
    const ok = reachable.filter((a) => a.inMinutes + opts.ride! + TRANSIT_XP.bufferMinutes <= opts.minutesToEvent!);
    fitsEvent = ok.length > 0;
    if (ok.length) pick = ok[ok.length - 1]!;
  }
  return { ...pick, leaveInMinutes: pick.inMinutes - walk, fitsEvent };
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

interface StopRow { id: string; code: number; name: string; address: string | null; walk: number; ride: number | null; lines: string[]; position: number }
async function listStops(db: Client, ownerId: string): Promise<StopRow[]> {
  const r = await db.execute({ sql: "SELECT * FROM transit_stops WHERE owner_id = ? ORDER BY position, created_at", args: [ownerId] });
  return r.rows.map((s) => ({ id: String(s.id), code: Number(s.stop_code), name: String(s.name), address: s.address == null ? null : String(s.address), walk: Number(s.walk_minutes), ride: s.ride_minutes == null ? null : Number(s.ride_minutes), lines: JSON.parse(String(s.lines_json ?? "[]")) as string[], position: Number(s.position) }));
}

async function stopBoard(db: Client, ownerId: string, s: StopRow, event: Awaited<ReturnType<typeof nextEvent>>) {
  try {
    const raw = await call<RawPrediction>(db, ownerId, `/Previsao/Parada?codigoParada=${s.code}`);
    const { now, arrivals } = parsePrediction(raw, s.lines);
    return { ...s, now, arrivals, recommendation: recommend(arrivals, s.walk, { minutesToEvent: event?.minutesTo ?? null, ride: s.ride }), error: null as string | null };
  } catch (e) {
    return { ...s, now: null, arrivals: [] as Arrival[], recommendation: null, error: e instanceof Error ? e.message : "Falha na previsão." };
  }
}

export async function getTransitOverview(db: Client, ownerId: string) {
  const { today } = await userDayContext(db, ownerId);
  const [{ status }, stops, dep, total, event] = await Promise.all([
    resolvePublicKey(db, ownerId, "sptrans"),
    listStops(db, ownerId),
    db.execute({ sql: "SELECT * FROM transit_departures WHERE owner_id = ? AND day_key = ?", args: [ownerId, today] }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM transit_departures WHERE owner_id = ? AND on_time = 1", args: [ownerId] }),
    nextEvent(db, ownerId),
  ]);
  const boards = status.source ? await Promise.all(stops.slice(0, 3).map((s) => stopBoard(db, ownerId, s, event))) : stops.map((s) => ({ ...s, now: null, arrivals: [] as Arrival[], recommendation: null, error: null }));
  const d = dep.rows[0];
  return {
    key: status,
    event,
    stops: boards,
    today: d ? { leftAt: String(d.left_at), onTime: !!Number(d.on_time), line: d.line == null ? null : String(d.line), eventTitle: d.event_title == null ? null : String(d.event_title) } : null,
    onTimeTotal: Number(total.rows[0]?.n ?? 0),
    rules: TRANSIT_XP,
  };
}

export async function addStop(db: Client, ownerId: string, p: { code: number; name: string; address?: string | null; walkMinutes: number; rideMinutes?: number | null; lines?: string[] }) {
  const n = await db.execute({ sql: "SELECT COUNT(*) AS n FROM transit_stops WHERE owner_id = ?", args: [ownerId] });
  if (Number(n.rows[0]?.n ?? 0) >= 6) throw new TransitError("Guarde no máximo 6 pontos.", 409);
  const id = nanoid();
  try {
    await db.execute({
      sql: "INSERT INTO transit_stops (id, owner_id, stop_code, name, address, walk_minutes, ride_minutes, lines_json, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [id, ownerId, p.code, p.name, p.address ?? null, p.walkMinutes, p.rideMinutes ?? null, JSON.stringify(p.lines ?? []), Number(n.rows[0]?.n ?? 0)],
    });
  } catch {
    throw new TransitError("Esse ponto já está salvo.", 409);
  }
  return { id };
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

/**
 * "Saí agora": registra a partida do dia. Conta como pontual quando, neste
 * momento, ainda dá para pegar o ônibus recomendado caminhando (saída em até
 * 2 min de atraso) e, se houver compromisso com tempo de viagem, ele chega a tempo.
 */
export async function recordDeparture(db: Client, ownerId: string, stopId: string) {
  const { today } = await userDayContext(db, ownerId);
  const existing = await db.execute({ sql: "SELECT on_time FROM transit_departures WHERE owner_id = ? AND day_key = ?", args: [ownerId, today] });
  if (existing.rows[0]) throw new TransitError("A partida de hoje já foi registrada.", 409);
  const stop = (await listStops(db, ownerId)).find((s) => s.id === stopId);
  if (!stop) throw new TransitError("Ponto não encontrado.", 404);
  const event = await nextEvent(db, ownerId);
  const board = await stopBoard(db, ownerId, stop, event);
  if (board.error) throw new TransitError(board.error, 502);
  const rec = board.recommendation;
  const onTime = !!rec && rec.leaveInMinutes >= -TRANSIT_XP.graceMinutes && rec.leaveInMinutes <= 20 && rec.fitsEvent !== false;
  const recommendedAt = rec ? new Date(Date.now() + rec.leaveInMinutes * 60_000).toISOString() : null;
  await db.execute({
    sql: "INSERT INTO transit_departures (owner_id, day_key, stop_code, line, event_id, event_title, recommended_at, left_at, on_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    args: [ownerId, today, stop.code, rec?.line ?? null, event?.id ?? null, event?.title ?? null, recommendedAt, new Date().toISOString(), onTime ? 1 : 0],
  });
  let xp = 0;
  if (onTime) {
    const ok = await award(db, ownerId, { sourceType: "transit", sourceId: `saida:${today}`, eventType: "on_time", xp: TRANSIT_XP.onTime, coins: TRANSIT_XP.coins, label: event ? `Saiu na hora para "${event.title.slice(0, 60)}"` : "Saiu na hora certa para o ônibus" }, today);
    if (ok) xp = TRANSIT_XP.onTime;
  }
  return { onTime, xp, line: rec?.line ?? null, busInMinutes: rec?.inMinutes ?? null, nowMinutes: spNowMinutes() };
}
