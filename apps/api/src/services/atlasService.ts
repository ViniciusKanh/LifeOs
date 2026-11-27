import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { award } from "./gamificationService.js";
import { IntegrationError, fetchJson } from "./integrationsCore.js";
import { localDayOfStored, userDayContext } from "./localDayService.js";
import { recordWorldEvent } from "./livingWorldService.js";

/**
 * Atlas de Exploração. Lugares reais viram descobertas; a névoa de guerra é
 * uma grade de células de ~500 m (CELL_DEG graus). Um check-in revela só o
 * entorno imediato (3×3 células ≈ 1,4 km), nunca um bairro inteiro.
 *
 * Privacidade: localização desligada por padrão (check-in manual não usa GPS),
 * coordenadas de GPS arredondadas (~110 m) se a precisão exata não for
 * autorizada, histórico privado e exportável.
 * Nominatim (OpenStreetMap) só recebe o termo buscado ou um ponto isolado.
 */

export const CELL_DEG = 0.0045;
const DISCOVERY_XP_DAILY_CAP = 8;
export const ATLAS_XP = { place: 40, revisit: 5, neighborhood: 30, city: 60, state: 100, country: 200 } as const;
export const PLACE_CATEGORIES = ["historico", "religioso", "parque", "museu", "gastronomia", "mirante", "natureza", "compras", "esporte", "cultura", "outro"] as const;
export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

export class AtlasError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function cellOf(lat: number, lng: number): string {
  return `${Math.floor(lat / CELL_DEG)}:${Math.floor(lng / CELL_DEG)}`;
}

export function cellsAround(lat: number, lng: number, radius = 1): string[] {
  const i = Math.floor(lat / CELL_DEG);
  const j = Math.floor(lng / CELL_DEG);
  const out: string[] = [];
  for (let di = -radius; di <= radius; di++) for (let dj = -radius; dj <= radius; dj++) out.push(`${i + di}:${j + dj}`);
  return out;
}

/** Área aproximada (km²) de uma célula na latitude informada. */
export function cellAreaKm2(lat: number): number {
  const side = CELL_DEG * 111.32;
  return side * side * Math.cos((lat * Math.PI) / 180);
}

function haversineKm(a: [number, number], b: [number, number]) {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* ─────────────────────────── Nominatim ─────────────────────────── */

const geoCache = new Map<string, { at: number; value: unknown }>();
let lastNominatim = 0;

/** Respeita a política do Nominatim: 1 requisição/s, User-Agent identificável e cache. */
async function nominatim<T>(path: string): Promise<T> {
  const hit = geoCache.get(path);
  if (hit && Date.now() - hit.at < 24 * 3_600_000) return hit.value as T;
  const wait = lastNominatim + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatim = Date.now();
  const value = await fetchJson<T>(`https://nominatim.openstreetmap.org/${path}`, { headers: { "User-Agent": "LifeOS/0.5 (atlas de exploração pessoal)", "Accept-Language": "pt-BR" } }, { label: "OpenStreetMap", retries: 1 });
  geoCache.set(path, { at: Date.now(), value });
  if (geoCache.size > 500) geoCache.delete(geoCache.keys().next().value as string);
  return value;
}

interface NominatimPlace {
  place_id: number;
  osm_type?: string;
  osm_id?: number;
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  class?: string;
  category?: string;
  type?: string;
  boundingbox?: [string, string, string, string];
  address?: Record<string, string>;
}

export function categoryFromOsm(cls?: string, type?: string): PlaceCategory {
  const c = `${cls ?? ""}:${type ?? ""}`;
  if (/historic|monument|memorial|castle|ruins/.test(c)) return "historico";
  if (/place_of_worship|church|cathedral|chapel/.test(c)) return "religioso";
  if (/park|garden|playground/.test(c)) return "parque";
  if (/museum|gallery/.test(c)) return "museu";
  if (/restaurant|cafe|bar|pub|fast_food|bakery|ice_cream/.test(c)) return "gastronomia";
  if (/viewpoint/.test(c)) return "mirante";
  if (/natural|peak|beach|water|wood|forest|waterfall/.test(c)) return "natureza";
  if (/shop|mall|marketplace/.test(c)) return "compras";
  if (/stadium|sports|pitch|fitness/.test(c)) return "esporte";
  if (/theatre|cinema|arts_centre|library|attraction/.test(c)) return "cultura";
  return "outro";
}

function addressParts(a: Record<string, string> = {}) {
  return {
    neighborhood: a.suburb ?? a.neighbourhood ?? a.quarter ?? a.city_district ?? null,
    city: a.city ?? a.town ?? a.village ?? a.municipality ?? null,
    state: a.state ?? null,
    country: a.country ?? null,
    countryCode: a.country_code?.toUpperCase() ?? null,
  };
}

export async function searchPlaces(q: string, near?: { lat: number; lng: number }) {
  const p = new URLSearchParams({ q, format: "jsonv2", addressdetails: "1", limit: "8" });
  if (near) {
    const d = 0.3;
    p.set("viewbox", `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`);
  }
  const list = await nominatim<NominatimPlace[]>(`search?${p.toString()}`);
  return (list ?? []).map((x) => ({
    osmRef: x.osm_type && x.osm_id ? `${x.osm_type[0]}${x.osm_id}` : `p${x.place_id}`,
    name: x.name || x.display_name.split(",")[0]!,
    displayName: x.display_name,
    lat: Number(x.lat),
    lng: Number(x.lon),
    category: categoryFromOsm(x.category ?? x.class, x.type),
    ...addressParts(x.address),
  }));
}

export async function reversePlace(lat: number, lng: number) {
  const x = await nominatim<NominatimPlace>(`reverse?lat=${lat.toFixed(5)}&lon=${lng.toFixed(5)}&format=jsonv2&zoom=18&addressdetails=1`);
  if (!x || !x.lat) return null;
  return {
    osmRef: x.osm_type && x.osm_id ? `${x.osm_type[0]}${x.osm_id}` : null,
    name: x.name || x.display_name.split(",")[0]!,
    category: categoryFromOsm(x.category ?? x.class, x.type),
    ...addressParts(x.address),
  };
}

/* ─────────────────────────── Configurações ─────────────────────────── */

export async function getAtlasSettings(db: Client, ownerId: string) {
  const r = await db.execute({ sql: "SELECT location_enabled, precise_location FROM atlas_settings WHERE owner_id = ?", args: [ownerId] });
  const row = r.rows[0];
  return {
    locationEnabled: row ? Number(row.location_enabled) === 1 : false,
    preciseLocation: row ? Number(row.precise_location) === 1 : false,
  };
}

export async function saveAtlasSettings(db: Client, ownerId: string, patch: Partial<{ locationEnabled: boolean; preciseLocation: boolean }>) {
  const cur = { ...(await getAtlasSettings(db, ownerId)), ...patch };
  await db.execute({
    sql: `INSERT INTO atlas_settings (owner_id, location_enabled, precise_location, updated_at) VALUES (?, ?, ?, datetime('now'))
          ON CONFLICT (owner_id) DO UPDATE SET location_enabled = excluded.location_enabled, precise_location = excluded.precise_location, updated_at = excluded.updated_at`,
    args: [ownerId, cur.locationEnabled ? 1 : 0, cur.preciseLocation ? 1 : 0],
  });
  return cur;
}

/* ─────────────────────────── Check-in ─────────────────────────── */

async function revealCells(db: Client, ownerId: string, cells: string[], source: string) {
  if (cells.length === 0) return 0;
  let added = 0;
  // Lotes para não estourar o limite de parâmetros.
  for (let i = 0; i < cells.length; i += 150) {
    const chunk = cells.slice(i, i + 150);
    const r = await db.execute({
      sql: `INSERT OR IGNORE INTO atlas_cells (owner_id, cell, source) VALUES ${chunk.map(() => "(?, ?, ?)").join(", ")}`,
      args: chunk.flatMap((c) => [ownerId, c, source]),
    });
    added += r.rowsAffected;
  }
  return added;
}

export interface CheckinInput {
  name?: string | null;
  lat: number;
  lng: number;
  osmRef?: string | null;
  category?: PlaceCategory | null;
  method: "manual" | "localizacao";
  visitedAt?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  countryCode?: string | null;
}

async function awardDiscovery(db: Client, ownerId: string, day: string, sourceId: string, eventType: string, xp: number, label: string) {
  const today = await db.execute({ sql: "SELECT COUNT(*) AS n FROM xp_events WHERE owner_id = ? AND source_type = 'atlas' AND day_key = ? AND event_type <> 'revisit'", args: [ownerId, day] });
  if (eventType !== "revisit" && Number(today.rows[0]?.n ?? 0) >= DISCOVERY_XP_DAILY_CAP) return 0;
  const ok = await award(db, ownerId, { sourceType: "atlas", sourceId, eventType, xp, coins: Math.round(xp / 10), label }, day);
  return ok ? xp : 0;
}

export async function createCheckin(db: Client, ownerId: string, input: CheckinInput) {
  const settings = await getAtlasSettings(db, ownerId);
  if (input.method === "localizacao" && !settings.locationEnabled) throw new AtlasError(403, "Ative a localização nas configurações do Atlas para usar o check-in por GPS.");
  let { lat, lng } = input;
  if (input.method === "localizacao" && !settings.preciseLocation) {
    lat = Math.round(lat * 1000) / 1000;
    lng = Math.round(lng * 1000) / 1000;
  }
  const { tz } = await userDayContext(db, ownerId);
  const visitedAt = input.visitedAt ? new Date(input.visitedAt).toISOString() : new Date().toISOString();
  if (Date.parse(visitedAt) > Date.now() + 5 * 60_000) throw new AtlasError(400, "A data da visita não pode estar no futuro.");
  const day = localDayOfStored(visitedAt, tz);

  // Endereço: usa o que veio da busca; senão tenta o reverse (falha não impede o check-in).
  let info = { name: input.name ?? null, category: input.category ?? null, osmRef: input.osmRef ?? null, neighborhood: input.neighborhood ?? null, city: input.city ?? null, state: input.state ?? null, country: input.country ?? null, countryCode: input.countryCode ?? null };
  if (!info.city || !info.name) {
    try {
      const rev = await reversePlace(lat, lng);
      if (rev) info = { ...info, name: info.name ?? rev.name, category: info.category ?? rev.category, osmRef: info.osmRef ?? rev.osmRef, neighborhood: info.neighborhood ?? rev.neighborhood, city: info.city ?? rev.city, state: info.state ?? rev.state, country: info.country ?? rev.country, countryCode: info.countryCode ?? rev.countryCode };
    } catch {
      /* segue com o que houver */
    }
  }
  const name = (info.name ?? "").trim() || "Lugar sem nome";

  // Mesmo lugar: mesma referência OSM ou mesmo nome a menos de ~60 m.
  let placeId: string | null = null;
  if (info.osmRef) {
    const r = await db.execute({ sql: "SELECT id FROM atlas_places WHERE owner_id = ? AND osm_ref = ?", args: [ownerId, info.osmRef] });
    placeId = r.rows[0] ? String(r.rows[0].id) : null;
  }
  if (!placeId) {
    const r = await db.execute({ sql: "SELECT id, lat, lng FROM atlas_places WHERE owner_id = ? AND lower(name) = lower(?)", args: [ownerId, name] });
    const near = r.rows.find((p) => haversineKm([Number(p.lat), Number(p.lng)], [lat, lng]) < 0.06);
    placeId = near ? String(near.id) : null;
  }

  const prev = await db.execute({
    sql: `SELECT
            (SELECT COUNT(*) FROM atlas_places WHERE owner_id = ? AND neighborhood = ? AND city = ?) AS hood,
            (SELECT COUNT(*) FROM atlas_places WHERE owner_id = ? AND city = ? AND state IS ?) AS city,
            (SELECT COUNT(*) FROM atlas_places WHERE owner_id = ? AND state = ? AND country IS ?) AS state,
            (SELECT COUNT(*) FROM atlas_places WHERE owner_id = ? AND country = ?) AS country`,
    args: [ownerId, info.neighborhood, info.city, ownerId, info.city, info.state, ownerId, info.state, info.country, ownerId, info.country],
  });
  const isNewPlace = !placeId;
  if (!placeId) {
    placeId = nanoid();
    await db.execute({
      sql: `INSERT INTO atlas_places (id, owner_id, name, category, lat, lng, neighborhood, city, state, country, country_code, osm_ref, visits, first_visit_at, last_visit_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      args: [placeId, ownerId, name.slice(0, 160), info.category ?? "outro", lat, lng, info.neighborhood, info.city, info.state, info.country, info.countryCode, info.osmRef, visitedAt, visitedAt],
    });
  } else {
    await db.execute({
      sql: "UPDATE atlas_places SET visits = visits + 1, last_visit_at = CASE WHEN last_visit_at IS NULL OR datetime(last_visit_at) < datetime(?) THEN ? ELSE last_visit_at END WHERE id = ? AND owner_id = ?",
      args: [visitedAt, visitedAt, placeId, ownerId],
    });
  }
  const checkinId = nanoid();
  const revealed = await revealCells(db, ownerId, cellsAround(lat, lng, 1), "checkin");

  let xp = 0;
  if (isNewPlace) {
    xp += await awardDiscovery(db, ownerId, day, placeId, "discovered", ATLAS_XP.place, `Lugar descoberto: ${name}`);
    const p = prev.rows[0]!;
    if (info.neighborhood && Number(p.hood) === 0) xp += await awardDiscovery(db, ownerId, day, `bairro:${info.city}:${info.neighborhood}`, "neighborhood", ATLAS_XP.neighborhood, `Novo bairro: ${info.neighborhood}`);
    if (info.city && Number(p.city) === 0) xp += await awardDiscovery(db, ownerId, day, `cidade:${info.state}:${info.city}`, "city", ATLAS_XP.city, `Nova cidade: ${info.city}`);
    if (info.state && Number(p.state) === 0) xp += await awardDiscovery(db, ownerId, day, `estado:${info.country}:${info.state}`, "state", ATLAS_XP.state, `Novo estado: ${info.state}`);
    if (info.country && Number(p.country) === 0) xp += await awardDiscovery(db, ownerId, day, `pais:${info.country}`, "country", ATLAS_XP.country, `Novo país: ${info.country}`);
    await recordWorldEvent(db, ownerId, { type: "atlas_discovered", title: `Descoberta no Atlas: ${name}`, detail: [info.neighborhood, info.city].filter(Boolean).join(", ") || null, refId: placeId });
  } else {
    xp += await awardDiscovery(db, ownerId, day, `${placeId}:${day}`, "revisit", ATLAS_XP.revisit, `Revisitou ${name}`);
  }
  await db.execute({
    sql: "INSERT INTO atlas_checkins (id, owner_id, place_id, method, visited_at, day_key, xp) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [checkinId, ownerId, placeId, input.method, visitedAt, day, xp],
  });
  return { checkinId, placeId, isNewPlace, revealedCells: revealed, xp };
}

/* ─────────────────────────── Rotas ─────────────────────────── */

export async function saveRoute(
  db: Client,
  ownerId: string,
  r: { name: string; source: "manual"; workoutId?: string | null; points: Array<[number, number]>; distanceKm?: number | null; startedAt: string }
) {
  if (r.points.length < 2) throw new AtlasError(400, "A rota precisa de pelo menos dois pontos.");
  // Simplifica: guarda no máximo ~300 pontos.
  const step = Math.max(1, Math.ceil(r.points.length / 300));
  const pts = r.points.filter((_, i) => i % step === 0 || i === r.points.length - 1).map(([a, b]) => [Math.round(a * 1e5) / 1e5, Math.round(b * 1e5) / 1e5] as [number, number]);
  let km = r.distanceKm ?? null;
  if (km == null) {
    km = 0;
    for (let i = 1; i < pts.length; i++) km += haversineKm(pts[i - 1]!, pts[i]!);
    km = Math.round(km * 100) / 100;
  }
  const id = nanoid();
  const ins = await db.execute({
    sql: `INSERT INTO atlas_routes (id, owner_id, name, source, workout_id, points_json, distance_km, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT DO NOTHING`,
    args: [id, ownerId, r.name.slice(0, 160), r.source, r.workoutId ?? null, JSON.stringify(pts), km, r.startedAt],
  });
  if (ins.rowsAffected === 0) return null;
  await revealCells(db, ownerId, [...new Set(r.points.map(([a, b]) => cellOf(a, b)))], "rota");
  return id;
}

/* ─────────────────────────── Leitura ─────────────────────────── */

function mapPlace(p: Record<string, unknown>) {
  return {
    id: String(p.id),
    name: String(p.name),
    category: String(p.category),
    lat: Number(p.lat),
    lng: Number(p.lng),
    neighborhood: p.neighborhood == null ? null : String(p.neighborhood),
    city: p.city == null ? null : String(p.city),
    state: p.state == null ? null : String(p.state),
    country: p.country == null ? null : String(p.country),
    favorite: Number(p.favorite) === 1,
    visits: Number(p.visits),
    firstVisitAt: p.first_visit_at == null ? null : String(p.first_visit_at),
    lastVisitAt: p.last_visit_at == null ? null : String(p.last_visit_at),
  };
}

async function regionBbox(db: Client, city: string, state: string | null): Promise<[number, number, number, number] | null> {
  const key = `${city}|${state ?? ""}`.toLowerCase();
  const cached = await db.execute({ sql: "SELECT bbox_json FROM atlas_region_cache WHERE region_key = ?", args: [key] });
  if (cached.rows[0]) return JSON.parse(String(cached.rows[0].bbox_json));
  try {
    const p = new URLSearchParams({ city, format: "jsonv2", limit: "1" });
    if (state) p.set("state", state);
    const list = await nominatim<NominatimPlace[]>(`search?${p.toString()}`);
    const bb = list?.[0]?.boundingbox;
    if (!bb) return null;
    const bbox: [number, number, number, number] = [Number(bb[0]), Number(bb[1]), Number(bb[2]), Number(bb[3])];
    await db.execute({ sql: "INSERT OR REPLACE INTO atlas_region_cache (region_key, bbox_json) VALUES (?, ?)", args: [key, JSON.stringify(bbox)] });
    return bbox;
  } catch {
    return null;
  }
}

export async function getAtlasOverview(db: Client, ownerId: string, opts: { region?: string | null } = {}) {
  const [places, checkins, cells, routes, settings, journal, ach] = await Promise.all([
    db.execute({ sql: "SELECT * FROM atlas_places WHERE owner_id = ? ORDER BY last_visit_at DESC", args: [ownerId] }),
    db.execute({
      sql: `SELECT c.id, c.method, c.visited_at, c.xp, p.id AS place_id, p.name, p.category, p.neighborhood, p.city, p.state FROM atlas_checkins c
            JOIN atlas_places p ON p.id = c.place_id WHERE c.owner_id = ? ORDER BY c.visited_at DESC LIMIT 12`,
      args: [ownerId],
    }),
    db.execute({ sql: "SELECT cell FROM atlas_cells WHERE owner_id = ? LIMIT 20000", args: [ownerId] }),
    db.execute({ sql: "SELECT id, name, source, points_json, distance_km, started_at FROM atlas_routes WHERE owner_id = ? ORDER BY started_at DESC LIMIT 50", args: [ownerId] }),
    getAtlasSettings(db, ownerId),
    db.execute({ sql: "SELECT j.id, j.title, j.body, j.rating, j.category, j.tags_json, j.visited_on, j.place_id, j.photo IS NOT NULL AS has_photo, p.name AS place_name FROM atlas_journal j LEFT JOIN atlas_places p ON p.id = j.place_id WHERE j.owner_id = ? ORDER BY j.visited_on DESC LIMIT 30", args: [ownerId] }),
    db.execute({
      sql: `SELECT a.code, a.title, a.description, a.threshold, a.metric, u.unlocked_at FROM achievements a
            LEFT JOIN user_achievements u ON u.achievement_id = a.id AND u.owner_id = ? WHERE a.code LIKE 'atlas_%' ORDER BY a.threshold`,
      args: [ownerId],
    }),
  ]);
  const ps = places.rows.map((p) => mapPlace(p as Record<string, unknown>));
  const uniq = (f: (p: (typeof ps)[number]) => string | null) => new Set(ps.map(f).filter(Boolean)).size;
  const cellList = cells.rows.map((c) => String(c.cell));
  const avgLat = ps.length ? ps.reduce((a, p) => a + p.lat, 0) / ps.length : -23.5;
  const routeList = routes.rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    source: String(r.source),
    points: JSON.parse(String(r.points_json)) as Array<[number, number]>,
    distanceKm: r.distance_km == null ? null : Number(r.distance_km),
    startedAt: String(r.started_at),
  }));

  // Região de referência (denominador da %): pedida ou a cidade com mais lugares.
  const cityCount = new Map<string, { city: string; state: string | null; n: number }>();
  for (const p of ps) if (p.city) {
    const k = `${p.city}|${p.state ?? ""}`;
    cityCount.set(k, { city: p.city, state: p.state, n: (cityCount.get(k)?.n ?? 0) + 1 });
  }
  const regionKey = opts.region && cityCount.has(opts.region) ? opts.region : [...cityCount.entries()].sort((a, b) => b[1].n - a[1].n)[0]?.[0] ?? null;
  let region: { key: string; city: string; state: string | null; revealedCells: number; totalCells: number; pct: number; bbox: [number, number, number, number] } | null = null;
  if (regionKey) {
    const rc = cityCount.get(regionKey)!;
    const bbox = await regionBbox(db, rc.city, rc.state);
    if (bbox) {
      const [s, n, w, e] = bbox;
      const iMin = Math.floor(s / CELL_DEG), iMax = Math.floor(n / CELL_DEG), jMin = Math.floor(w / CELL_DEG), jMax = Math.floor(e / CELL_DEG);
      const total = Math.max(1, (iMax - iMin + 1) * (jMax - jMin + 1));
      const inside = cellList.filter((c) => {
        const [i, j] = c.split(":").map(Number) as [number, number];
        return i >= iMin && i <= iMax && j >= jMin && j <= jMax;
      }).length;
      region = { key: regionKey, city: rc.city, state: rc.state, revealedCells: inside, totalCells: total, pct: Math.round((inside / total) * 1000) / 10, bbox };
    }
  }

  return {
    settings,
    cellDeg: CELL_DEG,
    cells: cellList,
    places: ps,
    routes: routeList,
    recent: checkins.rows.map((c) => ({
      id: String(c.id),
      placeId: String(c.place_id),
      name: String(c.name),
      category: String(c.category),
      method: String(c.method),
      visitedAt: String(c.visited_at),
      xp: Number(c.xp),
      where: [c.neighborhood, c.city, c.state].filter(Boolean).map(String).join(", "),
    })),
    progress: {
      places: ps.length,
      neighborhoods: uniq((p) => (p.neighborhood ? `${p.city}|${p.neighborhood}` : null)),
      cities: uniq((p) => (p.city ? `${p.state}|${p.city}` : null)),
      states: uniq((p) => (p.state ? `${p.country}|${p.state}` : null)),
      countries: uniq((p) => p.country),
      routes: routeList.length,
      routeKm: Math.round(routeList.reduce((a, r) => a + (r.distanceKm ?? 0), 0) * 10) / 10,
      cells: cellList.length,
      areaKm2: Math.round(cellList.length * cellAreaKm2(avgLat) * 10) / 10,
      region,
      regions: [...cityCount.entries()].map(([key, v]) => ({ key, label: `${v.city}${v.state ? ` · ${v.state}` : ""}`, places: v.n })),
    },
    journal: journal.rows.map((j) => ({
      id: String(j.id),
      title: String(j.title),
      body: j.body == null ? null : String(j.body),
      rating: j.rating == null ? null : Number(j.rating),
      category: j.category == null ? null : String(j.category),
      tags: JSON.parse(String(j.tags_json ?? "[]")) as string[],
      visitedOn: String(j.visited_on),
      placeId: j.place_id == null ? null : String(j.place_id),
      placeName: j.place_name == null ? null : String(j.place_name),
      hasPhoto: Number(j.has_photo) === 1,
    })),
    achievements: ach.rows.map((a) => ({ code: String(a.code), title: String(a.title), description: String(a.description), threshold: Number(a.threshold), unlockedAt: a.unlocked_at == null ? null : String(a.unlocked_at) })),
    xpRules: ATLAS_XP,
  };
}

export async function updatePlace(db: Client, ownerId: string, id: string, patch: { name?: string; category?: PlaceCategory; favorite?: boolean }) {
  const r = await db.execute({ sql: "SELECT * FROM atlas_places WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  const p = r.rows[0];
  if (!p) throw new AtlasError(404, "Lugar não encontrado.");
  await db.execute({
    sql: "UPDATE atlas_places SET name = ?, category = ?, favorite = ? WHERE id = ? AND owner_id = ?",
    args: [patch.name ?? String(p.name), patch.category ?? String(p.category), patch.favorite === undefined ? Number(p.favorite) : patch.favorite ? 1 : 0, id, ownerId],
  });
}

/** Recalcula a névoa a partir do que sobrou (usado depois de exclusões). */
async function rebuildCells(db: Client, ownerId: string) {
  await db.execute({ sql: "DELETE FROM atlas_cells WHERE owner_id = ?", args: [ownerId] });
  const places = await db.execute({ sql: "SELECT lat, lng FROM atlas_places WHERE owner_id = ?", args: [ownerId] });
  const routes = await db.execute({ sql: "SELECT points_json FROM atlas_routes WHERE owner_id = ?", args: [ownerId] });
  await revealCells(db, ownerId, [...new Set(places.rows.flatMap((p) => cellsAround(Number(p.lat), Number(p.lng), 1)))], "checkin");
  const routeCells = new Set<string>();
  for (const r of routes.rows) for (const [a, b] of JSON.parse(String(r.points_json)) as Array<[number, number]>) routeCells.add(cellOf(a, b));
  await revealCells(db, ownerId, [...routeCells], "rota");
}

export async function deletePlace(db: Client, ownerId: string, id: string) {
  const r = await db.execute({ sql: "DELETE FROM atlas_places WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  if (r.rowsAffected === 0) throw new AtlasError(404, "Lugar não encontrado.");
  await db.execute({ sql: "DELETE FROM atlas_checkins WHERE place_id = ? AND owner_id = ?", args: [id, ownerId] });
  await rebuildCells(db, ownerId);
}

export async function deleteRoute(db: Client, ownerId: string, id: string) {
  const r = await db.execute({ sql: "DELETE FROM atlas_routes WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  if (r.rowsAffected === 0) throw new AtlasError(404, "Rota não encontrada.");
  await rebuildCells(db, ownerId);
}

/** Apaga todo o histórico geográfico do usuário (lugares, check-ins, rotas, células e diário). */
export async function deleteAtlasHistory(db: Client, ownerId: string) {
  for (const t of ["atlas_checkins", "atlas_journal", "atlas_routes", "atlas_cells", "atlas_places"]) {
    await db.execute({ sql: `DELETE FROM ${t} WHERE owner_id = ?`, args: [ownerId] });
  }
}

export async function exportAtlas(db: Client, ownerId: string) {
  const q = (sql: string) => db.execute({ sql, args: [ownerId] }).then((r) => r.rows);
  return {
    exportedAt: new Date().toISOString(),
    places: await q("SELECT id, name, category, lat, lng, neighborhood, city, state, country, favorite, visits, first_visit_at, last_visit_at FROM atlas_places WHERE owner_id = ?"),
    checkins: await q("SELECT id, place_id, method, visited_at, xp FROM atlas_checkins WHERE owner_id = ?"),
    routes: await q("SELECT id, name, source, points_json, distance_km, started_at FROM atlas_routes WHERE owner_id = ?"),
    journal: await q("SELECT id, place_id, title, body, rating, category, tags_json, visited_on FROM atlas_journal WHERE owner_id = ?"),
    revealedCells: (await q("SELECT cell FROM atlas_cells WHERE owner_id = ?")).map((c) => c.cell),
  };
}

/* ─────────────────────────── Diário do Explorador ─────────────────────────── */

export interface JournalInput {
  placeId?: string | null;
  title: string;
  body?: string | null;
  rating?: number | null;
  category?: string | null;
  tags?: string[];
  photo?: string | null;
  visitedOn: string;
}

const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
export const MAX_PHOTO_CHARS = 700_000;

export async function saveJournal(db: Client, ownerId: string, input: JournalInput, id?: string) {
  if (input.photo && (!PHOTO_RE.test(input.photo) || input.photo.length > MAX_PHOTO_CHARS)) throw new AtlasError(400, "Foto inválida ou grande demais (máx. ~500 KB, JPG/PNG/WebP).");
  if (input.placeId) {
    const p = await db.execute({ sql: "SELECT id FROM atlas_places WHERE id = ? AND owner_id = ?", args: [input.placeId, ownerId] });
    if (!p.rows[0]) throw new AtlasError(404, "Lugar não encontrado.");
  }
  const tags = JSON.stringify((input.tags ?? []).slice(0, 8));
  if (id) {
    const r = await db.execute({
      sql: `UPDATE atlas_journal SET place_id = ?, title = ?, body = ?, rating = ?, category = ?, tags_json = ?, visited_on = ?,
              photo = CASE WHEN ? = 1 THEN ? ELSE photo END, updated_at = datetime('now') WHERE id = ? AND owner_id = ?`,
      args: [input.placeId ?? null, input.title, input.body ?? null, input.rating ?? null, input.category ?? null, tags, input.visitedOn, input.photo === undefined ? 0 : 1, input.photo ?? null, id, ownerId],
    });
    if (r.rowsAffected === 0) throw new AtlasError(404, "Registro não encontrado.");
    return id;
  }
  const newId = nanoid();
  await db.execute({
    sql: "INSERT INTO atlas_journal (id, owner_id, place_id, title, body, rating, category, tags_json, photo, visited_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    args: [newId, ownerId, input.placeId ?? null, input.title, input.body ?? null, input.rating ?? null, input.category ?? null, tags, input.photo ?? null, input.visitedOn],
  });
  return newId;
}

export async function journalPhoto(db: Client, ownerId: string, id: string) {
  const r = await db.execute({ sql: "SELECT photo FROM atlas_journal WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  const photo = r.rows[0]?.photo;
  if (!photo) throw new AtlasError(404, "Foto não encontrada.");
  return String(photo);
}

export async function deleteJournal(db: Client, ownerId: string, id: string) {
  const r = await db.execute({ sql: "DELETE FROM atlas_journal WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  if (r.rowsAffected === 0) throw new AtlasError(404, "Registro não encontrado.");
}

export { IntegrationError };
