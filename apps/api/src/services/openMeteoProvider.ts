/**
 * Contexto do Dia — abstração de provider meteorológico.
 *
 * `WeatherProvider` é a interface que o resto do backend usa; hoje só
 * existe uma implementação (`OpenMeteoWeatherProvider`, API pública,
 * sem chave), mas nunca chamamos `fetch` direto em outro arquivo —
 * assim trocar/adicionar outro serviço no futuro não exige mexer em
 * contextService, contextAnalyticsService ou nas rotas.
 *
 * Cache em memória (TTL) evita bater na Open-Meteo a cada render —
 * regra 37 do briefing. Simples de propósito: um processo Node, sem
 * necessidade de tabela no Turso só para isso.
 */

export interface GeocodeResult {
  name: string;
  region: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface WeatherCurrent {
  temperature: number;
  apparentTemperature: number;
  weatherCode: number;
  humidity: number | null;
  windSpeedKmh: number | null;
  time: string;
}

export interface WeatherHourlyPoint {
  time: string;
  temperature: number;
  apparentTemperature: number;
  precipitationProbability: number | null;
  weatherCode: number;
}

export interface WeatherDaily {
  date: string;
  temperatureMax: number;
  temperatureMin: number;
  weatherCode: number;
  precipitationSum: number;
  uvIndexMax: number | null;
  sunrise: string;
  sunset: string;
  daylightSeconds: number;
}

export interface AirQualityCurrent {
  usAqi: number | null;
  pm2_5: number | null;
  pm10: number | null;
  no2: number | null;
  o3: number | null;
}

export interface WeatherSnapshot {
  current: WeatherCurrent;
  hourly: WeatherHourlyPoint[];
  daily: WeatherDaily[];
}

export interface HistoricalDailyWeather {
  date: string;
  temperatureMean: number | null;
  temperatureMin: number | null;
  temperatureMax: number | null;
  apparentTemperatureMean: number | null;
  precipitationSum: number | null;
  weatherCode: number | null;
  cloudCoverMean: number | null;
}

export interface WeatherProvider {
  geocodeLocation(query: string): Promise<GeocodeResult[]>;
  getForecast(lat: number, lon: number, timezone: string): Promise<WeatherSnapshot>;
  getAirQuality(lat: number, lon: number): Promise<AirQualityCurrent | null>;
  getHistoricalWeather(lat: number, lon: number, timezone: string, from: string, to: string): Promise<HistoricalDailyWeather[]>;
}

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

const cache = new Map<string, CacheEntry<unknown>>();

async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  const value = await loader();
  cache.set(key, { expiresAt: Date.now() + ttlMs, value });
  return value;
}

const FORECAST_TTL_MS = 20 * 60 * 1000; // 20min — regra 37 (15-30min)
const AIR_QUALITY_TTL_MS = 30 * 60 * 1000;
const GEOCODE_TTL_MS = 24 * 60 * 60 * 1000; // cache longo — regra 37
const HISTORY_TTL_MS = 60 * 60 * 1000;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo respondeu ${res.status} para ${url}`);
  return (await res.json()) as T;
}

export const OpenMeteoWeatherProvider: WeatherProvider = {
  async geocodeLocation(query: string): Promise<GeocodeResult[]> {
    const key = `geocode:${query.toLowerCase()}`;
    return cached(key, GEOCODE_TTL_MS, async () => {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=pt&format=json`;
      const data = await getJson<{
        results?: Array<{ name: string; admin1?: string; country?: string; latitude: number; longitude: number; timezone: string }>;
      }>(url);
      return (data.results ?? []).map((r) => ({
        name: r.name,
        region: r.admin1 ?? null,
        country: r.country ?? null,
        latitude: r.latitude,
        longitude: r.longitude,
        timezone: r.timezone,
      }));
    });
  },

  async getForecast(lat: number, lon: number, timezone: string): Promise<WeatherSnapshot> {
    const key = `forecast:${lat.toFixed(3)}:${lon.toFixed(3)}`;
    return cached(key, FORECAST_TTL_MS, async () => {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=${encodeURIComponent(timezone)}` +
        `&current=temperature_2m,apparent_temperature,weather_code,relative_humidity_2m,wind_speed_10m` +
        `&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,uv_index_max,sunrise,sunset,daylight_duration` +
        `&forecast_days=7`;

      const data = await getJson<{
        current: { temperature_2m: number; apparent_temperature: number; weather_code: number; relative_humidity_2m: number; wind_speed_10m: number; time: string };
        hourly: { time: string[]; temperature_2m: number[]; apparent_temperature: number[]; precipitation_probability: number[]; weather_code: number[] };
        daily: {
          time: string[];
          weather_code: number[];
          temperature_2m_max: number[];
          temperature_2m_min: number[];
          precipitation_sum: number[];
          uv_index_max: (number | null)[];
          sunrise: string[];
          sunset: string[];
          daylight_duration: number[];
        };
      }>(url);

      const current: WeatherCurrent = {
        temperature: data.current.temperature_2m,
        apparentTemperature: data.current.apparent_temperature,
        weatherCode: data.current.weather_code,
        humidity: data.current.relative_humidity_2m ?? null,
        windSpeedKmh: data.current.wind_speed_10m ?? null,
        time: data.current.time,
      };

      const hourly: WeatherHourlyPoint[] = data.hourly.time.map((time, i) => ({
        time,
        temperature: data.hourly.temperature_2m[i],
        apparentTemperature: data.hourly.apparent_temperature[i],
        precipitationProbability: data.hourly.precipitation_probability?.[i] ?? null,
        weatherCode: data.hourly.weather_code[i],
      }));

      const daily: WeatherDaily[] = data.daily.time.map((date, i) => ({
        date,
        temperatureMax: data.daily.temperature_2m_max[i],
        temperatureMin: data.daily.temperature_2m_min[i],
        weatherCode: data.daily.weather_code[i],
        precipitationSum: data.daily.precipitation_sum[i],
        uvIndexMax: data.daily.uv_index_max?.[i] ?? null,
        sunrise: data.daily.sunrise[i],
        sunset: data.daily.sunset[i],
        daylightSeconds: data.daily.daylight_duration[i],
      }));

      return { current, hourly, daily };
    });
  },

  async getAirQuality(lat: number, lon: number): Promise<AirQualityCurrent | null> {
    const key = `aqi:${lat.toFixed(3)}:${lon.toFixed(3)}`;
    return cached(key, AIR_QUALITY_TTL_MS, async () => {
      try {
        const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone`;
        const data = await getJson<{ current?: { us_aqi?: number; pm2_5?: number; pm10?: number; nitrogen_dioxide?: number; ozone?: number } }>(url);
        if (!data.current) return null;
        return {
          usAqi: data.current.us_aqi ?? null,
          pm2_5: data.current.pm2_5 ?? null,
          pm10: data.current.pm10 ?? null,
          no2: data.current.nitrogen_dioxide ?? null,
          o3: data.current.ozone ?? null,
        };
      } catch {
        // Falha independente: clima continua funcionando sem qualidade do ar (regra 76).
        return null;
      }
    });
  },

  async getHistoricalWeather(lat: number, lon: number, timezone: string, from: string, to: string): Promise<HistoricalDailyWeather[]> {
    const key = `history:${lat.toFixed(3)}:${lon.toFixed(3)}:${from}:${to}`;
    return cached(key, HISTORY_TTL_MS, async () => {
      const url =
        `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&timezone=${encodeURIComponent(timezone)}` +
        `&start_date=${from}&end_date=${to}` +
        `&daily=temperature_2m_mean,temperature_2m_min,temperature_2m_max,apparent_temperature_mean,precipitation_sum,weather_code,cloud_cover_mean`;
      const data = await getJson<{
        daily: {
          time: string[];
          temperature_2m_mean: (number | null)[];
          temperature_2m_min: (number | null)[];
          temperature_2m_max: (number | null)[];
          apparent_temperature_mean: (number | null)[];
          precipitation_sum: (number | null)[];
          weather_code: (number | null)[];
          cloud_cover_mean: (number | null)[];
        };
      }>(url);
      return data.daily.time.map((date, i) => ({
        date,
        temperatureMean: data.daily.temperature_2m_mean?.[i] ?? null,
        temperatureMin: data.daily.temperature_2m_min?.[i] ?? null,
        temperatureMax: data.daily.temperature_2m_max?.[i] ?? null,
        apparentTemperatureMean: data.daily.apparent_temperature_mean?.[i] ?? null,
        precipitationSum: data.daily.precipitation_sum?.[i] ?? null,
        weatherCode: data.daily.weather_code?.[i] ?? null,
        cloudCoverMean: data.daily.cloud_cover_mean?.[i] ?? null,
      }));
    });
  },
};

/** Exposto só para testes — nunca usado em código de produção. */
export function __clearWeatherCacheForTests(): void {
  cache.clear();
}
