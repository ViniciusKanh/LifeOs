/**
 * Clima real no Meu Mundo. Reaproveita a localização do Contexto do Dia
 * (user_settings) e o provider Open-Meteo (com cache em memória de 20 min).
 * Quando a API falha, devolve o último clima válido gravado em
 * world_profiles.weather_cache_json, marcado como desatualizado — a Vila
 * nunca "inventa" um clima.
 */
import type { Client } from "@libsql/client";
import { getContextLocation } from "./contextLocationService.js";
import { OpenMeteoWeatherProvider, type WeatherSnapshot } from "./openMeteoProvider.js";
import { mapWeatherCode, worldWeatherVisual, type WorldWeatherVisual } from "./weatherCodeUtils.js";
import { recordWorldEvent } from "./livingWorldService.js";

export interface WorldWeatherHour {
  time: string;
  temperature: number;
  code: number;
  label: string;
  visual: WorldWeatherVisual;
  precipitationProbability: number | null;
}

export interface WorldWeatherPayload {
  configured: true;
  location: { city: string | null; region: string | null; country: string | null; timezone: string };
  current: {
    time: string;
    temperature: number;
    apparentTemperature: number;
    humidity: number | null;
    windSpeedKmh: number | null;
    windDirection: number | null;
    isDay: boolean | null;
    code: number;
    label: string;
    visual: WorldWeatherVisual;
    /** Probabilidade de precipitação prevista para a hora atual (não é chuva observada). */
    precipitationProbability: number | null;
  };
  hourly: WorldWeatherHour[];
  fetchedAt: string;
  stale: boolean;
  source: "Open-Meteo";
}

export type WorldWeatherResponse = WorldWeatherPayload | { configured: false } | { configured: true; unavailable: true; message: string };

/** Hora local "YYYY-MM-DDTHH" no fuso informado (as horas da Open-Meteo vêm nesse formato). */
function localHourKey(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}`;
}

export function buildWeatherPayload(snapshot: WeatherSnapshot, loc: { city: string | null; region: string | null; country: string | null; timezone: string }, fetchedAt: string, stale: boolean, now = new Date()): WorldWeatherPayload {
  const hourKey = localHourKey(loc.timezone, now);
  const startIdx = Math.max(0, snapshot.hourly.findIndex((h) => h.time.slice(0, 13) >= hourKey));
  const next = snapshot.hourly.slice(startIdx, startIdx + 12);
  const c = snapshot.current;
  const info = mapWeatherCode(c.weatherCode);
  return {
    configured: true,
    location: loc,
    current: {
      time: c.time,
      temperature: c.temperature,
      apparentTemperature: c.apparentTemperature,
      humidity: c.humidity,
      windSpeedKmh: c.windSpeedKmh,
      windDirection: c.windDirection ?? null,
      isDay: c.isDay == null ? null : c.isDay === 1,
      code: c.weatherCode,
      label: info.label,
      visual: worldWeatherVisual(c.weatherCode),
      precipitationProbability: next[0]?.precipitationProbability ?? null,
    },
    hourly: next.map((h) => ({
      time: h.time,
      temperature: h.temperature,
      code: h.weatherCode,
      label: mapWeatherCode(h.weatherCode).label,
      visual: worldWeatherVisual(h.weatherCode),
      precipitationProbability: h.precipitationProbability,
    })),
    fetchedAt,
    stale,
    source: "Open-Meteo",
  };
}

interface CacheRow {
  snapshot: WeatherSnapshot;
  fetchedAt: string;
  visual: WorldWeatherVisual;
  lat: number;
  lon: number;
}

async function readCache(db: Client, ownerId: string): Promise<CacheRow | null> {
  const r = await db.execute({ sql: "SELECT weather_cache_json FROM world_profiles WHERE owner_id = ?", args: [ownerId] });
  const raw = r.rows[0]?.weather_cache_json;
  if (typeof raw !== "string" || !raw) return null;
  try {
    return JSON.parse(raw) as CacheRow;
  } catch {
    return null;
  }
}

export async function getWorldWeather(db: Client, ownerId: string): Promise<WorldWeatherResponse> {
  const loc = await getContextLocation(db, ownerId);
  if (!loc.configured || loc.latitude == null || loc.longitude == null) return { configured: false };
  const tz = loc.timezone ?? "America/Sao_Paulo";
  const place = { city: loc.city, region: loc.region, country: loc.country, timezone: tz };
  const cached = await readCache(db, ownerId);
  try {
    const snapshot = await OpenMeteoWeatherProvider.getForecast(loc.latitude, loc.longitude, tz);
    const visual = worldWeatherVisual(snapshot.current.weatherCode);
    const sameReading = cached && cached.snapshot.current.time === snapshot.current.time && cached.lat === loc.latitude && cached.lon === loc.longitude;
    const fetchedAt = sameReading ? cached.fetchedAt : new Date().toISOString();
    if (!sameReading) {
      // Só grava quando a leitura muda (a Open-Meteo atualiza a cada 15 min): poupa escrita no Turso.
      await db.execute({
        sql: "INSERT INTO world_profiles (owner_id, weather_cache_json) VALUES (?, ?) ON CONFLICT (owner_id) DO UPDATE SET weather_cache_json = excluded.weather_cache_json",
        args: [ownerId, JSON.stringify({ snapshot, fetchedAt, visual, lat: loc.latitude, lon: loc.longitude } satisfies CacheRow)],
      });
      if (cached && cached.visual !== visual) {
        await recordWorldEvent(db, ownerId, { type: "weather.condition_changed", title: `O tempo mudou na Vila: ${mapWeatherCode(snapshot.current.weatherCode).label}`, meta: { from: cached.visual, to: visual } });
      }
    }
    return buildWeatherPayload(snapshot, place, fetchedAt, false);
  } catch (err) {
    console.error("[clima] Open-Meteo indisponível:", err instanceof Error ? err.message : "erro");
    if (cached && cached.lat === loc.latitude && cached.lon === loc.longitude) return buildWeatherPayload(cached.snapshot, place, cached.fetchedAt, true);
    return { configured: true, unavailable: true, message: "Não foi possível consultar o clima agora. Tente de novo em alguns minutos." };
  }
}
