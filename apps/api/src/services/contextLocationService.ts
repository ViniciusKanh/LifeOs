/**
 * Contexto do Dia — configuração de localização do usuário.
 * Fica em user_settings (1:1 por usuário, regra 66: sempre com
 * user_id). Guardamos só a localização ATUAL selecionada — nunca um
 * histórico de posições (regra 7/22: sem rastreamento).
 */
import type { getDb } from "../db/client.js";

type Db = ReturnType<typeof getDb>;

export interface ContextLocation {
  configured: boolean;
  city: string | null;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  autoLocation: boolean;
  tempUnit: "celsius" | "fahrenheit";
  windUnit: "kmh" | "mph";
  showAirQuality: boolean;
  showUv: boolean;
  weatherAlerts: boolean;
}

interface LocationRow {
  context_city: string | null;
  context_region: string | null;
  context_country: string | null;
  context_latitude: number | null;
  context_longitude: number | null;
  context_timezone: string | null;
  context_auto_location: number;
  context_temp_unit: "celsius" | "fahrenheit";
  context_wind_unit: "kmh" | "mph";
  context_show_air_quality: number;
  context_show_uv: number;
  context_weather_alerts: number;
}

export async function getContextLocation(db: Db, ownerId: string): Promise<ContextLocation> {
  const result = await db.execute({
    sql: `SELECT context_city, context_region, context_country, context_latitude, context_longitude, context_timezone,
                 context_auto_location, context_temp_unit, context_wind_unit, context_show_air_quality, context_show_uv, context_weather_alerts
          FROM user_settings WHERE user_id = ?`,
    args: [ownerId],
  });
  const row = result.rows[0] as unknown as LocationRow | undefined;
  if (!row) {
    return {
      configured: false,
      city: null,
      region: null,
      country: null,
      latitude: null,
      longitude: null,
      timezone: null,
      autoLocation: false,
      tempUnit: "celsius",
      windUnit: "kmh",
      showAirQuality: true,
      showUv: true,
      weatherAlerts: false,
    };
  }
  return {
    configured: row.context_latitude != null && row.context_longitude != null,
    city: row.context_city,
    region: row.context_region,
    country: row.context_country,
    latitude: row.context_latitude,
    longitude: row.context_longitude,
    timezone: row.context_timezone,
    autoLocation: !!row.context_auto_location,
    tempUnit: row.context_temp_unit ?? "celsius",
    windUnit: row.context_wind_unit ?? "kmh",
    showAirQuality: row.context_show_air_quality == null ? true : !!row.context_show_air_quality,
    showUv: row.context_show_uv == null ? true : !!row.context_show_uv,
    weatherAlerts: !!row.context_weather_alerts,
  };
}

export interface UpdateContextLocationInput {
  city?: string | null;
  region?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string | null;
  autoLocation?: boolean;
  tempUnit?: "celsius" | "fahrenheit";
  windUnit?: "kmh" | "mph";
  showAirQuality?: boolean;
  showUv?: boolean;
  weatherAlerts?: boolean;
}

export async function updateContextLocation(db: Db, ownerId: string, input: UpdateContextLocationInput): Promise<ContextLocation> {
  const current = await getContextLocation(db, ownerId);
  const next = { ...current, ...input };

  await db.execute({
    sql: `INSERT INTO user_settings (
            user_id, context_city, context_region, context_country, context_latitude, context_longitude, context_timezone,
            context_auto_location, context_temp_unit, context_wind_unit, context_show_air_quality, context_show_uv, context_weather_alerts
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (user_id) DO UPDATE SET
            context_city = excluded.context_city,
            context_region = excluded.context_region,
            context_country = excluded.context_country,
            context_latitude = excluded.context_latitude,
            context_longitude = excluded.context_longitude,
            context_timezone = excluded.context_timezone,
            context_auto_location = excluded.context_auto_location,
            context_temp_unit = excluded.context_temp_unit,
            context_wind_unit = excluded.context_wind_unit,
            context_show_air_quality = excluded.context_show_air_quality,
            context_show_uv = excluded.context_show_uv,
            context_weather_alerts = excluded.context_weather_alerts,
            updated_at = datetime('now')`,
    args: [
      ownerId,
      next.city,
      next.region,
      next.country,
      next.latitude,
      next.longitude,
      next.timezone,
      next.autoLocation ? 1 : 0,
      next.tempUnit,
      next.windUnit,
      next.showAirQuality ? 1 : 0,
      next.showUv ? 1 : 0,
      next.weatherAlerts ? 1 : 0,
    ],
  });

  return getContextLocation(db, ownerId);
}
