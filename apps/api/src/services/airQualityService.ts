import type { Client } from "@libsql/client";
import { award, dayKeyIn } from "./gamificationService.js";
import { getContextLocation } from "./contextLocationService.js";
import { fetchJson } from "./integrationsCore.js";
import { normalizeStoredUtc, inferWorkoutCategory } from "./healthService.js";
import { localDaysWhere, shiftDayKey, userDayContext } from "./localDayService.js";

/**
 * Ar do Treino (Saúde) — qualidade do ar, UV e pólen por hora (Open-Meteo Air
 * Quality, sem chave) na localização do Contexto do Dia.
 *
 * A previsão horária do dia fica gravada em air_quality_days: é ela que valida o
 * bônus "treino ao ar livre em ar bom" depois (sem guardar histórico de posição).
 * Bônus (fonte "workout", evento "clean_air"): +20 XP e 2 moedas por treino ao
 * ar livre (corrida, caminhada, bike, esporte coletivo) feito numa hora com
 * AQI ≤ 50, até 2 por dia.
 */

export const AIR_XP = { bonus: 20, coins: 2, dailyCap: 2, goodAqi: 50 } as const;
const OUTDOOR = new Set(["corrida", "caminhada", "bike", "esporte_coletivo"]);
const CACHE_MS = 30 * 60 * 1000;

export interface AirHour {
  hour: number;
  aqi: number | null;
  pm25: number | null;
  pm10: number | null;
  uv: number | null;
  pollen: number | null;
}

type AqResponse = { hourly?: Record<string, Array<number | null> | string[] | undefined> & { time?: string[] } };

const memo = new Map<string, { at: number; data: AqResponse }>();
export function resetAirCacheForTests() {
  memo.clear();
}

export function aqiLevel(aqi: number | null): { key: "bom" | "moderado" | "sensiveis" | "ruim" | "muito_ruim" | "perigoso" | "sem_dado"; label: string } {
  if (aqi == null) return { key: "sem_dado", label: "Sem dado" };
  if (aqi <= 50) return { key: "bom", label: "Bom" };
  if (aqi <= 100) return { key: "moderado", label: "Moderado" };
  if (aqi <= 150) return { key: "sensiveis", label: "Ruim para sensíveis" };
  if (aqi <= 200) return { key: "ruim", label: "Ruim" };
  if (aqi <= 300) return { key: "muito_ruim", label: "Muito ruim" };
  return { key: "perigoso", label: "Perigoso" };
}

export function uvLevel(uv: number | null): string | null {
  if (uv == null) return null;
  if (uv < 3) return "Baixo";
  if (uv < 6) return "Moderado";
  if (uv < 8) return "Alto";
  if (uv < 11) return "Muito alto";
  return "Extremo";
}

/** Converte a resposta da Open-Meteo nas horas de um dia local. Exportada para testes. */
export function hoursForDay(resp: AqResponse, day: string): AirHour[] {
  const h = resp.hourly ?? {};
  const times = (h.time ?? []) as string[];
  const num = (k: string, i: number) => {
    const v = (h[k] as Array<number | null> | undefined)?.[i];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  const out: AirHour[] = [];
  times.forEach((t, i) => {
    if (!t.startsWith(day)) return;
    const pollens = ["grass_pollen", "birch_pollen", "ragweed_pollen", "alder_pollen", "olive_pollen", "mugwort_pollen"].map((k) => num(k, i)).filter((x): x is number => x != null);
    out.push({ hour: Number(t.slice(11, 13)), aqi: num("us_aqi", i), pm25: num("pm2_5", i), pm10: num("pm10", i), uv: num("uv_index", i), pollen: pollens.length ? Math.max(...pollens) : null });
  });
  return out;
}

/**
 * Melhor janela para treinar fora (entre 5h e 21h): a sequência de 2 a 3 horas
 * com menor soma de AQI + UV ponderado. "ouro" só quando todas as horas têm ar bom
 * e UV abaixo de 6.
 */
export function bestWindow(hours: AirHour[], fromHour = 5): { start: number; end: number; quality: "ouro" | "aceitavel" | "ruim"; avgAqi: number } | null {
  const usable = hours.filter((h) => h.hour >= Math.max(5, fromHour) && h.hour <= 21 && h.aqi != null);
  let best: { start: number; end: number; score: number; hours: AirHour[] } | null = null;
  for (let len = 3; len >= 2; len--) {
    for (let i = 0; i + len <= usable.length; i++) {
      const slice = usable.slice(i, i + len);
      if (slice[slice.length - 1]!.hour - slice[0]!.hour !== len - 1) continue;
      const score = slice.reduce((a, h) => a + (h.aqi ?? 999) + (h.uv ?? 0) * 8, 0) / len;
      if (!best || score < best.score) best = { start: slice[0]!.hour, end: slice[slice.length - 1]!.hour + 1, score, hours: slice };
    }
    if (best) break;
  }
  if (!best) return null;
  const avgAqi = Math.round(best.hours.reduce((a, h) => a + (h.aqi ?? 0), 0) / best.hours.length);
  const gold = best.hours.every((h) => (h.aqi ?? 999) <= AIR_XP.goodAqi && (h.uv ?? 0) < 6);
  const ok = best.hours.every((h) => (h.aqi ?? 999) <= 100);
  return { start: best.start, end: best.end, quality: gold ? "ouro" : ok ? "aceitavel" : "ruim", avgAqi };
}

async function fetchAir(lat: number, lon: number, tz: string): Promise<AqResponse> {
  const k = `${lat.toFixed(2)},${lon.toFixed(2)},${tz}`;
  const hit = memo.get(k);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  const url =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
    `&hourly=us_aqi,pm2_5,pm10,uv_index,grass_pollen,birch_pollen,ragweed_pollen,alder_pollen,olive_pollen,mugwort_pollen` +
    `&timezone=${encodeURIComponent(tz)}&past_days=1&forecast_days=2`;
  const data = await fetchJson<AqResponse>(url, {}, { label: "Open-Meteo (qualidade do ar)", timeoutMs: 10_000 });
  memo.set(k, { at: Date.now(), data: data ?? {} });
  return data ?? {};
}

async function storeDay(db: Client, ownerId: string, day: string, hours: AirHour[]) {
  if (!hours.length) return;
  await db.execute({
    sql: `INSERT INTO air_quality_days (owner_id, day_key, hourly_json, fetched_at) VALUES (?, ?, ?, datetime('now'))
          ON CONFLICT (owner_id, day_key) DO UPDATE SET hourly_json = excluded.hourly_json, fetched_at = excluded.fetched_at`,
    args: [ownerId, day, JSON.stringify(hours)],
  });
}

/** Hora local (0–23) de um timestamp gravado. */
function localHour(stored: string, tz: string): number | null {
  const ms = Date.parse(normalizeStoredUtc(stored));
  if (Number.isNaN(ms)) return null;
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(new Date(ms));
  return Number(h);
}

/**
 * Paga o bônus de ar bom para treinos ao ar livre de hoje e ontem cuja hora tem
 * previsão gravada com AQI ≤ 50. Exportada para testes; idempotente por treino.
 */
export async function awardCleanAirWorkouts(db: Client, ownerId: string) {
  const { tz, today } = await userDayContext(db, ownerId);
  const from = shiftDayKey(today, -1);
  const where = localDaysWhere("performed_at", from, today, tz);
  const [w, days] = await Promise.all([
    db.execute({ sql: `SELECT id, kind, category, duration_minutes, performed_at FROM workouts WHERE owner_id = ? AND ${where.sql} ORDER BY performed_at`, args: [ownerId, ...where.args] }),
    db.execute({ sql: "SELECT day_key, hourly_json FROM air_quality_days WHERE owner_id = ? AND day_key >= ?", args: [ownerId, from] }),
  ]);
  const byDay = new Map(days.rows.map((r) => [String(r.day_key), JSON.parse(String(r.hourly_json)) as AirHour[]]));
  const results: Array<{ workoutId: string; kind: string; day: string; hour: number; aqi: number | null; outdoor: boolean; eligible: boolean; paid: boolean }> = [];
  for (const row of w.rows) {
    const at = String(row.performed_at);
    const day = dayKeyIn(new Date(Date.parse(normalizeStoredUtc(at))), tz);
    const hour = localHour(at, tz);
    if (hour == null) continue;
    const cat = row.category ? String(row.category) : inferWorkoutCategory(String(row.kind));
    const outdoor = OUTDOOR.has(cat);
    const aqi = byDay.get(day)?.find((h) => h.hour === hour)?.aqi ?? null;
    const eligible = outdoor && aqi != null && aqi <= AIR_XP.goodAqi;
    let paid = false;
    if (eligible) {
      const n = await db.execute({ sql: "SELECT COUNT(*) AS n FROM xp_events WHERE owner_id = ? AND source_type = 'workout' AND event_type = 'clean_air' AND day_key = ?", args: [ownerId, day] });
      const already = await db.execute({ sql: "SELECT 1 FROM xp_events WHERE owner_id = ? AND source_type = 'workout' AND source_id = ? AND event_type = 'clean_air'", args: [ownerId, String(row.id)] });
      paid = !!already.rows[0];
      if (!paid && Number(n.rows[0]?.n ?? 0) < AIR_XP.dailyCap) {
        paid = await award(db, ownerId, { sourceType: "workout", sourceId: String(row.id), eventType: "clean_air", xp: AIR_XP.bonus, coins: AIR_XP.coins, label: `Treino ao ar livre com ar bom (AQI ${Math.round(aqi)})` }, day);
      }
    }
    results.push({ workoutId: String(row.id), kind: String(row.kind), day, hour, aqi, outdoor, eligible, paid });
  }
  return results;
}

export async function getAirOverview(db: Client, ownerId: string) {
  const loc = await getContextLocation(db, ownerId);
  if (!loc.configured || loc.latitude == null || loc.longitude == null) return { configured: false as const };
  const tz = loc.timezone ?? (await userDayContext(db, ownerId)).tz;
  const today = dayKeyIn(new Date(), tz);
  let stale = false;
  let hours: AirHour[] = [];
  let tomorrow: AirHour[] = [];
  try {
    const resp = await fetchAir(loc.latitude, loc.longitude, tz);
    hours = hoursForDay(resp, today);
    tomorrow = hoursForDay(resp, shiftDayKey(today, 1));
    await storeDay(db, ownerId, shiftDayKey(today, -1), hoursForDay(resp, shiftDayKey(today, -1)));
    await storeDay(db, ownerId, today, hours);
  } catch {
    // API fora do ar: usa a última previsão gravada para hoje, marcada como desatualizada.
    const r = await db.execute({ sql: "SELECT hourly_json FROM air_quality_days WHERE owner_id = ? AND day_key = ?", args: [ownerId, today] });
    if (!r.rows[0]) return { configured: true as const, unavailable: true as const, message: "A Open-Meteo não respondeu agora. Tente em alguns minutos." };
    hours = JSON.parse(String(r.rows[0].hourly_json)) as AirHour[];
    stale = true;
  }
  const nowHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  const current = hours.find((h) => h.hour === nowHour) ?? hours[hours.length - 1] ?? null;
  const uvMax = hours.reduce<number | null>((a, h) => (h.uv == null ? a : Math.max(a ?? 0, h.uv)), null);
  const pollenMax = hours.reduce<number | null>((a, h) => (h.pollen == null ? a : Math.max(a ?? 0, h.pollen)), null);
  const windowToday = bestWindow(hours, nowHour);
  const windowTomorrow = bestWindow(tomorrow);
  const workouts = await awardCleanAirWorkouts(db, ownerId);
  const total = await db.execute({ sql: "SELECT COUNT(*) AS n, COALESCE(SUM(xp), 0) AS xp FROM xp_events WHERE owner_id = ? AND source_type = 'workout' AND event_type = 'clean_air'", args: [ownerId] });
  return {
    configured: true as const,
    location: { city: loc.city, region: loc.region },
    stale,
    nowHour,
    current: current ? { ...current, level: aqiLevel(current.aqi), uvLevel: uvLevel(current.uv) } : null,
    uvMax,
    uvMaxLevel: uvLevel(uvMax),
    pollenMax,
    hours: hours.map((h) => ({ ...h, level: aqiLevel(h.aqi).key })),
    window: windowToday,
    windowTomorrow,
    workouts: workouts.filter((x) => x.day === today),
    bonus: { count: Number(total.rows[0]?.n ?? 0), xp: Number(total.rows[0]?.xp ?? 0) },
    rules: AIR_XP,
    source: "Open-Meteo" as const,
  };
}
