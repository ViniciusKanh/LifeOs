import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { award } from "./gamificationService.js";
import { getContextLocation } from "./contextLocationService.js";
import { fetchJson } from "./integrationsCore.js";
import { userDayContext } from "./localDayService.js";
import { recordWorldEvent } from "./livingWorldService.js";
import { haversineKm, type PLACE_CATEGORIES } from "./atlasService.js";
import { weekKeyOf } from "./radarService.js";

/**
 * Expedições da Semana (Atlas) — três lugares reais (OpenStreetMap, via
 * Overpass, sem chave) perto do centro escolhido que o usuário ainda não
 * visitou. O centro é a cidade do Contexto do Dia ou um lugar já salvo no
 * Atlas: nunca guardamos a posição atual.
 *
 * A missão se cumpre com o check-in normal do Atlas (que já paga a descoberta).
 * Bônus (fonte "expedition"): +25 XP e 3 moedas por missão; +50 XP e 5 moedas
 * ao concluir as três da semana. Uma troca de missão por semana.
 */

export const EXPEDITION_XP = { mission: 25, missionCoins: 3, week: 50, weekCoins: 5, perWeek: 3, swapsPerWeek: 1, nearMeters: 150 } as const;
export const EXPEDITION_KINDS = ["parque", "museu", "biblioteca", "mirante", "trilha", "cultura"] as const;
export type ExpeditionKind = (typeof EXPEDITION_KINDS)[number];
type PlaceCategory = (typeof PLACE_CATEGORIES)[number];
export const KIND_CATEGORY: Record<ExpeditionKind, PlaceCategory> = { parque: "parque", museu: "museu", biblioteca: "cultura", mirante: "mirante", trilha: "natureza", cultura: "cultura" };

const OVERPASS = process.env.OVERPASS_URL?.trim() || "https://overpass-api.de/api/interpreter";
const UA = "LifeOS/1.0 (+https://github.com/ViniciusKanh/LifeOs; app pessoal)";
const CACHE_MS = 6 * 3600_000;

export class ExpeditionError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 | 422 | 429 | 502 = 400) {
    super(message);
  }
}

const SELECTORS: Record<ExpeditionKind, string[]> = {
  parque: ['nwr["leisure"~"^(park|nature_reserve|garden)$"]["name"]'],
  museu: ['nwr["tourism"~"^(museum|gallery)$"]["name"]'],
  biblioteca: ['nwr["amenity"="library"]["name"]'],
  mirante: ['nwr["tourism"="viewpoint"]["name"]'],
  trilha: ['relation["route"="hiking"]["name"]'],
  cultura: ['nwr["amenity"~"^(theatre|arts_centre|planetarium)$"]["name"]', 'nwr["historic"~"^(monument|memorial|castle|fort|ruins)$"]["name"]'],
};

/** Monta a consulta Overpass. Exportada para testes. */
export function buildOverpassQuery(lat: number, lng: number, radius: number, kinds: ExpeditionKind[]) {
  const parts = kinds.flatMap((k) => SELECTORS[k].map((s) => `${s}(around:${radius},${lat.toFixed(5)},${lng.toFixed(5)});`));
  return `[out:json][timeout:25];(${parts.join("")});out center tags 300;`;
}

export interface Poi { osmRef: string; name: string; kind: ExpeditionKind; lat: number; lng: number }
type RawEl = { type: "node" | "way" | "relation"; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

export function kindOf(tags: Record<string, string> = {}): ExpeditionKind | null {
  if (/^(park|nature_reserve|garden)$/.test(tags.leisure ?? "")) return "parque";
  if (/^(museum|gallery)$/.test(tags.tourism ?? "")) return "museu";
  if (tags.amenity === "library") return "biblioteca";
  if (tags.tourism === "viewpoint") return "mirante";
  if (tags.route === "hiking") return "trilha";
  if (/^(theatre|arts_centre|planetarium)$/.test(tags.amenity ?? "") || tags.historic) return "cultura";
  return null;
}

/** Converte a resposta do Overpass (mesmo formato de osm_ref do Atlas: n123, w456, r789). Exportada para testes. */
export function parseOverpass(raw: { elements?: RawEl[] } | null): Poi[] {
  const seen = new Set<string>();
  const out: Poi[] = [];
  for (const el of raw?.elements ?? []) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    const name = el.tags?.["name:pt"] ?? el.tags?.name;
    const kind = kindOf(el.tags);
    if (lat == null || lng == null || !name || !kind) continue;
    const ref = `${el.type[0]}${el.id}`;
    if (seen.has(ref)) continue;
    seen.add(ref);
    out.push({ osmRef: ref, name: name.slice(0, 160), kind, lat, lng });
  }
  return out;
}

const memo = new Map<string, { at: number; pois: Poi[] }>();
export function resetExpeditionCacheForTests() {
  memo.clear();
}
async function fetchPois(lat: number, lng: number, radius: number, kinds: ExpeditionKind[]) {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)},${radius},${kinds.join("|")}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.pois;
  const raw = await fetchJson<{ elements?: RawEl[] }>(
    OVERPASS,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA, Accept: "application/json" }, body: `data=${encodeURIComponent(buildOverpassQuery(lat, lng, radius, kinds))}` },
    { label: "OpenStreetMap (Overpass)", timeoutMs: 30_000, retries: 1 },
  );
  const pois = parseOverpass(raw);
  memo.set(key, { at: Date.now(), pois });
  return pois;
}

/** Hash estável (FNV-1a) para a escolha semanal não mudar a cada recarga. */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Escolhe missões: os 18 lugares mais próximos ainda não visitados, embaralhados
 * de forma estável pela semana, preferindo tipos diferentes. Exportada para testes.
 */
export function pickMissions(pois: Array<Poi & { distanceM: number }>, n: number, seed: string, exclude: Set<string>) {
  const pool = pois.filter((p) => !exclude.has(p.osmRef)).sort((a, b) => a.distanceM - b.distanceM).slice(0, 18);
  pool.sort((a, b) => hash(seed + a.osmRef) - hash(seed + b.osmRef));
  const picked: typeof pool = [];
  for (const p of pool) if (picked.length < n && !picked.some((x) => x.kind === p.kind)) picked.push(p);
  for (const p of pool) if (picked.length < n && !picked.includes(p)) picked.push(p);
  return picked;
}

async function settingsOf(db: Client, ownerId: string) {
  const r = await db.execute({ sql: "SELECT * FROM expedition_settings WHERE owner_id = ?", args: [ownerId] });
  const row = r.rows[0];
  const kinds = (row ? (JSON.parse(String(row.kinds_json)) as string[]) : [...EXPEDITION_KINDS]).filter((k): k is ExpeditionKind => (EXPEDITION_KINDS as readonly string[]).includes(k));
  return { radiusM: row ? Number(row.radius_m) : 3000, centerPlaceId: row?.center_place_id == null ? null : String(row.center_place_id), kinds: kinds.length ? kinds : [...EXPEDITION_KINDS] };
}

export async function saveExpeditionSettings(db: Client, ownerId: string, p: { radiusM?: number; centerPlaceId?: string | null; kinds?: ExpeditionKind[] }) {
  const cur = await settingsOf(db, ownerId);
  if (p.centerPlaceId) {
    const r = await db.execute({ sql: "SELECT id FROM atlas_places WHERE id = ? AND owner_id = ?", args: [p.centerPlaceId, ownerId] });
    if (!r.rows[0]) throw new ExpeditionError("Lugar do Atlas não encontrado.", 404);
  }
  const next = { radiusM: p.radiusM ?? cur.radiusM, centerPlaceId: p.centerPlaceId === undefined ? cur.centerPlaceId : p.centerPlaceId, kinds: p.kinds?.length ? p.kinds : cur.kinds };
  await db.execute({
    sql: `INSERT INTO expedition_settings (owner_id, radius_m, center_place_id, kinds_json) VALUES (?, ?, ?, ?)
          ON CONFLICT (owner_id) DO UPDATE SET radius_m = excluded.radius_m, center_place_id = excluded.center_place_id, kinds_json = excluded.kinds_json, updated_at = datetime('now')`,
    args: [ownerId, next.radiusM, next.centerPlaceId, JSON.stringify(next.kinds)],
  });
  // Mudou a área: as missões ainda não feitas da semana são refeitas.
  const { today } = await userDayContext(db, ownerId);
  await db.execute({ sql: "DELETE FROM expedition_missions WHERE owner_id = ? AND week_key = ? AND status = 'ativa'", args: [ownerId, weekKeyOf(today)] });
  return next;
}

async function centerOf(db: Client, ownerId: string, s: Awaited<ReturnType<typeof settingsOf>>) {
  if (s.centerPlaceId) {
    const r = await db.execute({ sql: "SELECT name, lat, lng FROM atlas_places WHERE id = ? AND owner_id = ?", args: [s.centerPlaceId, ownerId] });
    if (r.rows[0]) return { lat: Number(r.rows[0].lat), lng: Number(r.rows[0].lng), label: String(r.rows[0].name), source: "atlas" as const };
  }
  const loc = await getContextLocation(db, ownerId);
  if (loc.configured && loc.latitude != null && loc.longitude != null) return { lat: loc.latitude, lng: loc.longitude, label: loc.city ?? "sua cidade", source: "cidade" as const };
  return null;
}

/** Marca como concluídas as missões cujo lugar já tem check-in no Atlas e paga os bônus. */
export async function settleMissions(db: Client, ownerId: string, week: string, today: string) {
  const [missions, places] = await Promise.all([
    db.execute({ sql: "SELECT * FROM expedition_missions WHERE owner_id = ? AND week_key = ? AND status = 'ativa'", args: [ownerId, week] }),
    db.execute({ sql: "SELECT osm_ref, lat, lng, last_visit_at FROM atlas_places WHERE owner_id = ?", args: [ownerId] }),
  ]);
  let xp = 0;
  for (const m of missions.rows) {
    const created = String(m.created_at).replace(" ", "T");
    const hit = places.rows.find((p) => (p.osm_ref != null && String(p.osm_ref) === String(m.osm_ref)) || (haversineKm([Number(p.lat), Number(p.lng)], [Number(m.lat), Number(m.lng)]) * 1000 <= EXPEDITION_XP.nearMeters && String(p.last_visit_at ?? "") >= created));
    if (!hit) continue;
    await db.execute({ sql: "UPDATE expedition_missions SET status = 'concluida', completed_at = ? WHERE id = ? AND owner_id = ?", args: [new Date().toISOString(), String(m.id), ownerId] });
    if (await award(db, ownerId, { sourceType: "expedition", sourceId: `mission:${String(m.id)}`, eventType: "done", xp: EXPEDITION_XP.mission, coins: EXPEDITION_XP.missionCoins, label: `Expedição concluída: ${String(m.name)}` }, today)) xp += EXPEDITION_XP.mission;
    await recordWorldEvent(db, ownerId, { type: "expedition.done", title: `Expedição concluída: ${String(m.name)}`, refId: String(m.id) });
  }
  const done = await db.execute({ sql: "SELECT COUNT(*) AS n FROM expedition_missions WHERE owner_id = ? AND week_key = ? AND status = 'concluida'", args: [ownerId, week] });
  if (Number(done.rows[0]?.n ?? 0) >= EXPEDITION_XP.perWeek) {
    if (await award(db, ownerId, { sourceType: "expedition", sourceId: `week:${week}`, eventType: "week", xp: EXPEDITION_XP.week, coins: EXPEDITION_XP.weekCoins, label: "Todas as expedições da semana" }, today)) xp += EXPEDITION_XP.week;
  }
  return xp;
}

async function ensureMissions(db: Client, ownerId: string, week: string, center: { lat: number; lng: number }, s: Awaited<ReturnType<typeof settingsOf>>) {
  const cur = await db.execute({ sql: "SELECT osm_ref, status FROM expedition_missions WHERE owner_id = ? AND week_key = ?", args: [ownerId, week] });
  const live = cur.rows.filter((r) => String(r.status) !== "trocada").length;
  if (live >= EXPEDITION_XP.perWeek) return;
  const pois = (await fetchPois(center.lat, center.lng, s.radiusM, s.kinds)).map((p) => ({ ...p, distanceM: Math.round(haversineKm([center.lat, center.lng], [p.lat, p.lng]) * 1000) }));
  const visited = await db.execute({ sql: "SELECT osm_ref FROM atlas_places WHERE owner_id = ? AND osm_ref IS NOT NULL UNION SELECT osm_ref FROM expedition_missions WHERE owner_id = ?", args: [ownerId, ownerId] });
  const exclude = new Set(visited.rows.map((r) => String(r.osm_ref)));
  const picks = pickMissions(pois, EXPEDITION_XP.perWeek - live, `${ownerId}:${week}:${cur.rows.length}`, exclude);
  for (const p of picks) {
    await db.execute({
      sql: "INSERT OR IGNORE INTO expedition_missions (id, owner_id, week_key, osm_ref, name, kind, lat, lng, distance_m) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [nanoid(), ownerId, week, p.osmRef, p.name, p.kind, p.lat, p.lng, p.distanceM],
    });
  }
}

export async function getExpeditions(db: Client, ownerId: string) {
  const { today } = await userDayContext(db, ownerId);
  const week = weekKeyOf(today);
  const s = await settingsOf(db, ownerId);
  const center = await centerOf(db, ownerId, s);
  const places = await db.execute({ sql: "SELECT id, name FROM atlas_places WHERE owner_id = ? ORDER BY visits DESC, last_visit_at DESC LIMIT 50", args: [ownerId] });
  const base = { settings: s, kinds: EXPEDITION_KINDS, centerOptions: places.rows.map((p) => ({ id: String(p.id), name: String(p.name) })), rules: EXPEDITION_XP, week };
  if (!center) return { configured: false as const, ...base };
  let unavailable: string | null = null;
  const gained = await settleMissions(db, ownerId, week, today);
  try {
    await ensureMissions(db, ownerId, week, center, s);
  } catch {
    unavailable = "O OpenStreetMap (Overpass) não respondeu agora. Tente em alguns minutos.";
  }
  const [missions, totals, xp] = await Promise.all([
    db.execute({ sql: "SELECT * FROM expedition_missions WHERE owner_id = ? AND week_key = ? AND status <> 'trocada' ORDER BY created_at", args: [ownerId, week] }),
    db.execute({ sql: "SELECT COUNT(*) AS n, SUM(CASE WHEN status = 'trocada' AND week_key = ? THEN 1 ELSE 0 END) AS swaps FROM expedition_missions WHERE owner_id = ? AND (status = 'concluida' OR (status = 'trocada' AND week_key = ?))", args: [week, ownerId, week] }),
    db.execute({ sql: "SELECT COALESCE(SUM(xp), 0) AS xp FROM xp_events WHERE owner_id = ? AND source_type = 'expedition'", args: [ownerId] }),
  ]);
  const swaps = Number(totals.rows[0]?.swaps ?? 0);
  return {
    configured: true as const,
    ...base,
    center: { label: center.label, source: center.source },
    unavailable,
    justEarned: gained,
    missions: missions.rows.map((m) => ({
      id: String(m.id),
      osmRef: String(m.osm_ref),
      name: String(m.name),
      kind: String(m.kind) as ExpeditionKind,
      category: KIND_CATEGORY[String(m.kind) as ExpeditionKind] ?? "outro",
      lat: Number(m.lat),
      lng: Number(m.lng),
      distanceM: m.distance_m == null ? null : Number(m.distance_m),
      status: String(m.status) as "ativa" | "concluida",
      completedAt: m.completed_at == null ? null : String(m.completed_at),
      mapUrl: `https://www.openstreetmap.org/${{ n: "node", w: "way", r: "relation" }[String(m.osm_ref)[0] as "n" | "w" | "r"]}/${String(m.osm_ref).slice(1)}`,
    })),
    swapsLeft: Math.max(0, EXPEDITION_XP.swapsPerWeek - swaps),
    completedTotal: Number(totals.rows[0]?.n ?? 0) - swaps,
    xpTotal: Number(xp.rows[0]?.xp ?? 0),
  };
}

export async function swapMission(db: Client, ownerId: string, id: string) {
  const { today } = await userDayContext(db, ownerId);
  const week = weekKeyOf(today);
  const r = await db.execute({ sql: "SELECT status, week_key FROM expedition_missions WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  if (!r.rows[0]) throw new ExpeditionError("Missão não encontrada.", 404);
  if (String(r.rows[0].status) !== "ativa" || String(r.rows[0].week_key) !== week) throw new ExpeditionError("Só dá para trocar uma missão ativa desta semana.", 409);
  const used = await db.execute({ sql: "SELECT COUNT(*) AS n FROM expedition_missions WHERE owner_id = ? AND week_key = ? AND status = 'trocada'", args: [ownerId, week] });
  if (Number(used.rows[0]?.n ?? 0) >= EXPEDITION_XP.swapsPerWeek) throw new ExpeditionError("Você já trocou uma missão nesta semana.", 409);
  await db.execute({ sql: "UPDATE expedition_missions SET status = 'trocada' WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  return getExpeditions(db, ownerId);
}
