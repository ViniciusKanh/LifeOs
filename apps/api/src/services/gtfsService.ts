import { inflateRawSync } from "node:zlib";
import type { Client } from "@libsql/client";
import { fetchJson, IntegrationError } from "./integrationsCore.js";
import { haversineKm } from "./atlasService.js";

/**
 * GTFS da SPTrans — horários PROGRAMADOS de ônibus, Metrô e CPTM em São Paulo.
 *
 * A SPTrans publica o GTFS com frequências (frequencies.txt): cada viagem-modelo
 * tem os tempos entre as paradas (stop_times) e, por faixa horária, de quantos
 * em quantos minutos sai do ponto inicial. Daí a previsão "~08:18 · a cada 12 min"
 * é uma ESTIMATIVA da programação — nunca é apresentada como tempo real.
 *
 * O download oficial exige login no portal da SPTrans; por padrão usamos o
 * espelho público do MobilityData (catálogo mdb-8). SPTRANS_GTFS_URL substitui.
 * Os dados são de referência e iguais para todos: tabelas globais gtfs_*, que só
 * o administrador importa (em passos, para caber no limite de 60 s da Vercel).
 */

export const GTFS_DEFAULT_URL = "https://storage.googleapis.com/storage/v1/b/mdb-latest/o/br-sao-paulo-sao-paulo-transporte-sptrans-gtfs-8.zip?alt=media";
const gtfsUrl = () => process.env.SPTRANS_GTFS_URL?.trim() || GTFS_DEFAULT_URL;
/** Linhas de stop_times gravadas por passo da importação. */
export const STOP_TIMES_PER_STEP = 30_000;

export class GtfsError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 | 422 | 502 = 400) {
    super(message);
  }
}

/* ─────────────────────────── .zip e .csv ─────────────────────────── */

/** Leitor mínimo de .zip (diretório central + deflate), sem dependência nova. Exportado para testes. */
export function readZip(buf: Buffer, wanted?: Set<string>): Map<string, string> {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new GtfsError("Arquivo GTFS inválido (não é um .zip).", 422);
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, string>();
  for (let i = 0; i < total; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new GtfsError("Arquivo GTFS corrompido.", 422);
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const comment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8").split("/").pop()!;
    p += 46 + nameLen + extra + comment;
    if (wanted && !wanted.has(name)) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + csize);
    out.set(name, (method === 8 ? inflateRawSync(data) : data).toString("utf8").replace(/^﻿/, ""));
  }
  return out;
}

/** CSV com aspas (o GTFS da SPTrans tem vírgulas dentro dos nomes). Devolve objetos pelo cabeçalho. */
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let f = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          f += '"';
          i++;
        } else q = false;
      } else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(f);
      f = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(f);
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      f = "";
    } else f += c;
  }
  if (f !== "" || row.length) {
    row.push(f);
    rows.push(row);
  }
  const [head, ...body] = rows;
  if (!head) return [];
  const keys = head.map((h) => h.trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

/** "25:10:00" → segundos (o GTFS permite passar de 24 h). */
export function gtfsSeconds(t: string): number {
  const m = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(t.trim());
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : NaN;
}

/* ─────────────────────────── Importação ─────────────────────────── */

const WANTED = new Set(["agency.txt", "calendar.txt", "routes.txt", "trips.txt", "stops.txt", "frequencies.txt", "stop_times.txt"]);
let feedCache: { url: string; at: number; files: Map<string, string> } | null = null;

async function loadFeed(url: string) {
  if (feedCache && feedCache.url === url && Date.now() - feedCache.at < 30 * 60_000) return feedCache.files;
  let buf: Buffer;
  try {
    buf = await fetchJson<Buffer>(url, { headers: { "User-Agent": "LifeOS/1.0 (estação das carruagens)" } }, { label: "GTFS da SPTrans", responseType: "buffer", timeoutMs: 40_000, retries: 1 });
  } catch (e) {
    if (e instanceof IntegrationError) throw new GtfsError(e.message, 502);
    throw e;
  }
  const files = readZip(buf, WANTED);
  for (const f of ["routes.txt", "trips.txt", "stops.txt", "stop_times.txt"]) if (!files.has(f)) throw new GtfsError(`O GTFS não tem ${f}.`, 422);
  feedCache = { url, at: Date.now(), files };
  return files;
}

export function resetGtfsCacheForTests() {
  feedCache = null;
}

/** "?versao=030626" no agency_url → 2026-06-03. */
function feedVersion(files: Map<string, string>): string | null {
  const url = parseCsv(files.get("agency.txt") ?? "")[0]?.agency_url ?? "";
  const m = /versao=(\d{2})(\d{2})(\d{2})/.exec(url);
  return m ? `20${m[3]}-${m[2]}-${m[1]}` : null;
}

type Cell = string | number | null;
async function bulkInsert(db: Client, table: string, cols: string[], rows: Cell[][], per = 250) {
  const one = `(${cols.map(() => "?").join(",")})`;
  const stmts: Array<{ sql: string; args: Cell[] }> = [];
  for (let i = 0; i < rows.length; i += per) {
    const chunk = rows.slice(i, i + per);
    stmts.push({ sql: `INSERT OR REPLACE INTO ${table} (${cols.join(",")}) VALUES ${chunk.map(() => one).join(",")}`, args: chunk.flat() });
  }
  for (let i = 0; i < stmts.length; i += 40) await db.batch(stmts.slice(i, i + 40), "write");
}

/** stop_times com offset relativo à primeira parada de cada viagem, na ordem do arquivo. */
function stopTimeRows(files: Map<string, string>): Cell[][] {
  const raw = parseCsv(files.get("stop_times.txt")!);
  const first = new Map<string, number>();
  for (const r of raw) {
    const t = gtfsSeconds(r.arrival_time || r.departure_time || "");
    if (Number.isNaN(t)) continue;
    const cur = first.get(r.trip_id!);
    if (cur === undefined || t < cur) first.set(r.trip_id!, t);
  }
  const out: Cell[][] = [];
  for (const r of raw) {
    const t = gtfsSeconds(r.arrival_time || r.departure_time || "");
    const stop = Number(r.stop_id);
    if (Number.isNaN(t) || !Number.isFinite(stop)) continue;
    out.push([r.trip_id!, Number(r.stop_sequence), stop, t - (first.get(r.trip_id!) ?? t)]);
  }
  return out;
}

/**
 * Um passo da importação (só administrador). 0: limpa e grava calendário, linhas,
 * viagens e pontos · 1: frequências · 2+: stop_times em blocos. Devolve o próximo
 * passo ou null quando terminou.
 */
export async function importGtfsStep(db: Client, step: number) {
  const url = gtfsUrl();
  try {
    const files = await loadFeed(url);
    if (step === 0) {
      await db.batch(["DELETE FROM gtfs_stop_times", "DELETE FROM gtfs_frequencies", "DELETE FROM gtfs_trips", "DELETE FROM gtfs_routes", "DELETE FROM gtfs_stops", "DELETE FROM gtfs_calendar"], "write");
      const cal = parseCsv(files.get("calendar.txt") ?? "").map((c) => [c.service_id!, ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => (c[d] === "1" ? "1" : "0")).join("")]);
      const routes = parseCsv(files.get("routes.txt")!).map((r) => [r.route_id!, r.route_short_name || r.route_id!, r.route_long_name || null, Number(r.route_type || 3), r.route_color || null, r.route_text_color || null]);
      const trips = parseCsv(files.get("trips.txt")!).map((t) => [t.trip_id!, t.route_id!, t.service_id!, t.trip_headsign || null, t.direction_id === "" ? null : Number(t.direction_id)]);
      const stops = parseCsv(files.get("stops.txt")!)
        .filter((s) => Number.isFinite(Number(s.stop_id)) && Number.isFinite(Number(s.stop_lat)))
        .map((s) => [Number(s.stop_id), s.stop_name || "Ponto", s.stop_desc || null, Number(s.stop_lat), Number(s.stop_lon)]);
      await bulkInsert(db, "gtfs_calendar", ["service_id", "days"], cal);
      await bulkInsert(db, "gtfs_routes", ["route_id", "short_name", "long_name", "route_type", "color", "text_color"], routes);
      await bulkInsert(db, "gtfs_trips", ["trip_id", "route_id", "service_id", "headsign", "direction_id"], trips);
      await bulkInsert(db, "gtfs_stops", ["stop_id", "name", "ref", "lat", "lon"], stops);
      const counts = { routes: routes.length, trips: trips.length, stops: stops.length };
      await saveFeed(db, { source_url: url, version: feedVersion(files), status: "importando", next_step: 1, counts_json: JSON.stringify(counts), error: null, started_at: new Date().toISOString() });
      return { nextStep: 1, message: `Linhas, viagens e ${stops.length.toLocaleString("pt-BR")} pontos gravados.` };
    }
    if (step === 1) {
      const freq = parseCsv(files.get("frequencies.txt") ?? "")
        .map((f) => [f.trip_id!, gtfsSeconds(f.start_time!), gtfsSeconds(f.end_time!), Number(f.headway_secs)])
        .filter((f) => !Number.isNaN(f[1]) && !Number.isNaN(f[2]) && Number(f[3]) > 0);
      await bulkInsert(db, "gtfs_frequencies", ["trip_id", "start_sec", "end_sec", "headway_secs"], freq);
      await mergeCounts(db, { frequencies: freq.length }, 2);
      return { nextStep: 2, message: `${freq.length.toLocaleString("pt-BR")} faixas de frequência gravadas.` };
    }
    const rows = stopTimeRows(files);
    const from = (step - 2) * STOP_TIMES_PER_STEP;
    if (from >= rows.length) throw new GtfsError("Passo de importação inválido.", 400);
    const slice = rows.slice(from, from + STOP_TIMES_PER_STEP);
    await bulkInsert(db, "gtfs_stop_times", ["trip_id", "seq", "stop_id", "offset_sec"], slice);
    const done = from + slice.length >= rows.length;
    await mergeCounts(db, { stopTimes: from + slice.length }, done ? 0 : step + 1, done);
    return { nextStep: done ? null : step + 1, message: `${(from + slice.length).toLocaleString("pt-BR")} de ${rows.length.toLocaleString("pt-BR")} paradas das viagens gravadas.` };
  } catch (e) {
    await saveFeed(db, { status: "erro", error: e instanceof Error ? e.message.slice(0, 300) : "Falha na importação." }).catch(() => undefined);
    throw e;
  }
}

async function saveFeed(db: Client, patch: Record<string, Cell>) {
  await db.execute("INSERT OR IGNORE INTO gtfs_feed (id) VALUES (1)");
  const keys = Object.keys(patch);
  await db.execute({ sql: `UPDATE gtfs_feed SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = 1`, args: keys.map((k) => patch[k]!) });
}

async function mergeCounts(db: Client, add: Record<string, number>, nextStep: number, done = false) {
  const r = await db.execute("SELECT counts_json FROM gtfs_feed WHERE id = 1");
  const counts = { ...(JSON.parse(String(r.rows[0]?.counts_json ?? "{}")) as Record<string, number>), ...add };
  await saveFeed(db, { counts_json: JSON.stringify(counts), next_step: nextStep, ...(done ? { status: "pronto", imported_at: new Date().toISOString(), error: null } : {}) });
}

export async function feedStatus(db: Client) {
  const r = await db.execute("SELECT * FROM gtfs_feed WHERE id = 1");
  const f = r.rows[0];
  if (!f) return { status: "vazio" as const, version: null, importedAt: null, counts: {} as Record<string, number>, error: null, nextStep: 0, sourceUrl: gtfsUrl() };
  return {
    status: String(f.status) as "vazio" | "importando" | "pronto" | "erro",
    version: f.version == null ? null : String(f.version),
    importedAt: f.imported_at == null ? null : String(f.imported_at),
    counts: JSON.parse(String(f.counts_json ?? "{}")) as Record<string, number>,
    error: f.error == null ? null : String(f.error),
    nextStep: Number(f.next_step ?? 0),
    sourceUrl: f.source_url == null ? gtfsUrl() : String(f.source_url),
  };
}

/* ─────────────────────────── Consultas ─────────────────────────── */

export interface GtfsStop { stopId: number; name: string; ref: string | null; lat: number; lon: number }
export interface StopLine { tripId: string; seq: number; offsetSec: number; line: string; headsign: string | null; longName: string | null; color: string | null; textColor: string | null; routeType: number; serviceId: string }

const stopOf = (r: Record<string, unknown>): GtfsStop => ({ stopId: Number(r.stop_id), name: String(r.name), ref: r.ref == null ? null : String(r.ref), lat: Number(r.lat), lon: Number(r.lon) });
const hex = (v: unknown) => (v == null || !/^[0-9A-Fa-f]{6}$/.test(String(v)) ? null : `#${String(v).toUpperCase()}`);

export async function searchGtfsStops(db: Client, q: string, limit = 15): Promise<GtfsStop[]> {
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const r = await db.execute({ sql: "SELECT * FROM gtfs_stops WHERE name LIKE ? OR ref LIKE ? ORDER BY length(name) LIMIT ?", args: [like, like, limit] });
  return r.rows.map((x) => stopOf(x as unknown as Record<string, unknown>));
}

export async function getStops(db: Client, ids: number[]): Promise<Map<number, GtfsStop>> {
  if (!ids.length) return new Map();
  const r = await db.execute({ sql: `SELECT * FROM gtfs_stops WHERE stop_id IN (${ids.map(() => "?").join(",")})`, args: ids });
  return new Map(r.rows.map((x) => [Number(x.stop_id), stopOf(x as unknown as Record<string, unknown>)]));
}

/** Pontos num raio (metros), do mais perto ao mais longe, com a distância em linha reta. */
export async function nearbyStops(db: Client, lat: number, lon: number, radiusM = 450, limit = 12): Promise<Array<GtfsStop & { meters: number }>> {
  const dLat = radiusM / 111_000;
  const dLon = radiusM / (111_000 * Math.cos((lat * Math.PI) / 180));
  const r = await db.execute({ sql: "SELECT * FROM gtfs_stops WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?", args: [lat - dLat, lat + dLat, lon - dLon, lon + dLon] });
  return r.rows
    .map((x) => {
      const s = stopOf(x as unknown as Record<string, unknown>);
      return { ...s, meters: Math.round(haversineKm([lat, lon], [s.lat, s.lon]) * 1000) };
    })
    .filter((s) => s.meters <= radiusM)
    .sort((a, b) => a.meters - b.meters)
    .slice(0, limit);
}

/** Linhas (viagens-modelo) que passam em cada ponto, com o offset da parada. */
export async function linesAtStops(db: Client, stopIds: number[]): Promise<Map<number, StopLine[]>> {
  const out = new Map<number, StopLine[]>();
  if (!stopIds.length) return out;
  const r = await db.execute({
    sql: `SELECT st.stop_id, st.trip_id, st.seq, st.offset_sec, t.headsign, t.service_id, r.short_name, r.long_name, r.color, r.text_color, r.route_type
          FROM gtfs_stop_times st JOIN gtfs_trips t ON t.trip_id = st.trip_id JOIN gtfs_routes r ON r.route_id = t.route_id
          WHERE st.stop_id IN (${stopIds.map(() => "?").join(",")})`,
    args: stopIds,
  });
  for (const x of r.rows) {
    const list = out.get(Number(x.stop_id)) ?? [];
    list.push({ tripId: String(x.trip_id), seq: Number(x.seq), offsetSec: Number(x.offset_sec), line: String(x.short_name), headsign: x.headsign == null ? null : String(x.headsign), longName: x.long_name == null ? null : String(x.long_name), color: hex(x.color), textColor: hex(x.text_color), routeType: Number(x.route_type), serviceId: String(x.service_id) });
    out.set(Number(x.stop_id), list);
  }
  return out;
}

/** Dia de serviço: 0 = segunda ... 6 = domingo. Feriado roda a programação de domingo. */
export interface ServiceDay { weekday: number; nowSec: number }

export async function serviceDaysFor(db: Client, serviceIds: string[], day: ServiceDay): Promise<Set<string>> {
  if (!serviceIds.length) return new Set();
  const r = await db.execute({ sql: `SELECT service_id, days FROM gtfs_calendar WHERE service_id IN (${serviceIds.map(() => "?").join(",")})`, args: serviceIds });
  const active = new Set<string>();
  const known = new Set<string>();
  for (const x of r.rows) {
    known.add(String(x.service_id));
    if (String(x.days)[day.weekday] === "1") active.add(String(x.service_id));
  }
  // Serviço sem calendário: assume que roda (melhor mostrar do que esconder a linha).
  for (const s of serviceIds) if (!known.has(s)) active.add(s);
  return active;
}

export interface Frequency { startSec: number; endSec: number; headwaySecs: number }
export async function frequenciesOf(db: Client, tripIds: string[]): Promise<Map<string, Frequency[]>> {
  const out = new Map<string, Frequency[]>();
  const ids = [...new Set(tripIds)];
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    const r = await db.execute({ sql: `SELECT * FROM gtfs_frequencies WHERE trip_id IN (${chunk.map(() => "?").join(",")}) ORDER BY start_sec`, args: chunk });
    for (const x of r.rows) {
      const list = out.get(String(x.trip_id)) ?? [];
      list.push({ startSec: Number(x.start_sec), endSec: Number(x.end_sec), headwaySecs: Number(x.headway_secs) });
      out.set(String(x.trip_id), list);
    }
  }
  return out;
}

/**
 * Passagens programadas num ponto entre [fromSec, toSec] (segundos do dia).
 * Partida da origem = início da faixa + n × intervalo (até o fim da faixa);
 * passagem no ponto = partida + offset da parada. Exportada para testes.
 */
export function scheduledPasses(freqs: Frequency[], offsetSec: number, fromSec: number, toSec: number, max = 6): Array<{ atSec: number; headwaySecs: number }> {
  const out: Array<{ atSec: number; headwaySecs: number }> = [];
  for (const f of freqs) {
    let n = Math.max(0, Math.ceil((fromSec - offsetSec - f.startSec) / f.headwaySecs));
    for (let dep = f.startSec + n * f.headwaySecs; dep <= f.endSec && out.length < max * 3; n++, dep = f.startSec + n * f.headwaySecs) {
      const at = dep + offsetSec;
      if (at > toSec) break;
      if (at >= fromSec) out.push({ atSec: at, headwaySecs: f.headwaySecs });
    }
  }
  return out.sort((a, b) => a.atSec - b.atSec).slice(0, max);
}

/** Intervalo programado na faixa que contém `sec` (minutos), ou null. */
export function headwayAt(freqs: Frequency[], sec: number): number | null {
  const f = freqs.find((x) => sec >= x.startSec && sec <= x.endSec);
  return f ? Math.round(f.headwaySecs / 60) : null;
}

/** Coordenadas do trajeto entre duas paradas da mesma viagem (pelos pontos, sem o shape pesado). */
export async function tripPath(db: Client, tripId: string, fromSeq: number, toSeq: number): Promise<Array<[number, number]>> {
  const r = await db.execute({
    sql: "SELECT s.lat, s.lon FROM gtfs_stop_times st JOIN gtfs_stops s ON s.stop_id = st.stop_id WHERE st.trip_id = ? AND st.seq BETWEEN ? AND ? ORDER BY st.seq LIMIT 400",
    args: [tripId, Math.min(fromSeq, toSeq), Math.max(fromSeq, toSeq)],
  });
  return r.rows.map((x) => [Number(x.lat), Number(x.lon)]);
}

/** Viagens diretas: pares (embarque, desembarque) na mesma viagem, embarque antes. */
export async function directLegs(db: Client, fromStops: number[], toStops: number[]) {
  if (!fromStops.length || !toStops.length) return [];
  const r = await db.execute({
    sql: `SELECT a.trip_id, a.stop_id AS board, a.seq AS board_seq, a.offset_sec AS board_off, b.stop_id AS alight, b.seq AS alight_seq, b.offset_sec AS alight_off
          FROM gtfs_stop_times a JOIN gtfs_stop_times b ON b.trip_id = a.trip_id AND b.seq > a.seq
          WHERE a.stop_id IN (${fromStops.map(() => "?").join(",")}) AND b.stop_id IN (${toStops.map(() => "?").join(",")})
          LIMIT 3000`,
    args: [...fromStops, ...toStops],
  });
  return r.rows.map((x) => ({ tripId: String(x.trip_id), board: Number(x.board), boardSeq: Number(x.board_seq), boardOff: Number(x.board_off), alight: Number(x.alight), alightSeq: Number(x.alight_seq), rideSec: Number(x.alight_off) - Number(x.board_off) }));
}

export async function tripInfo(db: Client, tripIds: string[]) {
  const out = new Map<string, { line: string; headsign: string | null; color: string | null; textColor: string | null; routeType: number; serviceId: string; longName: string | null }>();
  if (!tripIds.length) return out;
  const ids = [...new Set(tripIds)];
  const r = await db.execute({
    sql: `SELECT t.trip_id, t.headsign, t.service_id, r.short_name, r.long_name, r.color, r.text_color, r.route_type FROM gtfs_trips t JOIN gtfs_routes r ON r.route_id = t.route_id WHERE t.trip_id IN (${ids.map(() => "?").join(",")})`,
    args: ids,
  });
  for (const x of r.rows) out.set(String(x.trip_id), { line: String(x.short_name), headsign: x.headsign == null ? null : String(x.headsign), color: hex(x.color), textColor: hex(x.text_color), routeType: Number(x.route_type), serviceId: String(x.service_id), longName: x.long_name == null ? null : String(x.long_name) });
  return out;
}
