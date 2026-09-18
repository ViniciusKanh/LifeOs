/**
 * Contexto do Dia — serviço agregador principal.
 *
 * Junta o que a Open-Meteo devolve (via `OpenMeteoWeatherProvider`)
 * com o que já existe no LifeOS (Focus, Saúde, exercício) para montar
 * o dashboard inteiro em uma única chamada — evita múltiplas idas ao
 * provider por render (regra 37/38).
 *
 * Fluxo: CONTEXTO EXTERNO → REGISTROS DO LIFEOS → COMPARAÇÃO →
 * PADRÕES → INSIGHTS (delegado a contextAnalyticsService).
 */
import type { getDb } from "../db/client.js";
import { OpenMeteoWeatherProvider, type WeatherSnapshot, type AirQualityCurrent } from "./openMeteoProvider.js";
import { getContextLocation, type ContextLocation } from "./contextLocationService.js";
import { mapWeatherCode, classifyUV, classifyAQI, classifyThermalComfort } from "./weatherCodeUtils.js";
import { computeContextPatterns, type RoutineImpact, type ContextInsight } from "./contextAnalyticsService.js";
import type { SignalStatus } from "./signalsService.js";

type Db = ReturnType<typeof getDb>;
export type ContextPeriod = "today" | "7d" | "30d";

function periodDays(period: ContextPeriod): number {
  return period === "today" ? 1 : period === "7d" ? 7 : 30;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function findHourly(snapshot: WeatherSnapshot, dateStr: string, hour: number) {
  const target = `${dateStr}T${String(hour).padStart(2, "0")}:00`;
  return snapshot.hourly.find((h) => h.time.startsWith(target)) ?? null;
}

const PERIOD_BLOCKS: { key: string; label: string; hour: number }[] = [
  { key: "manha", label: "Manhã", hour: 9 },
  { key: "meio_dia", label: "Meio-dia", hour: 12 },
  { key: "tarde", label: "Tarde", hour: 15 },
  { key: "noite", label: "Noite", hour: 21 },
  { key: "madrugada", label: "Madrugada", hour: 3 },
];

export interface ContextTodayDashboard {
  configured: boolean;
  location: { city: string | null; region: string | null; country: string | null };
  lastUpdated: string;
  kpis: {
    temperature: { value: number; apparentTemperature: number };
    rainChance: { value: number; note: string };
    airQuality: { aqi: number; level: string } | null;
    daylight: { durationMinutes: number; sunrise: string; sunset: string };
  };
  todayPeriods: Array<{ key: string; label: string; temperature: number; condition: string; icon: string; rainProbability: number | null }>;
  tomorrow: { temperature: number; condition: string; icon: string } | null;
  hourlyChart: Array<{ time: string; temperature: number; apparentTemperature: number; rainProbability: number | null }>;
  summary: { humidity: number | null; windSpeedKmh: number | null; uv: { value: number; level: string; description: string } | null };
  resumoAmbiental: { condition: string; airQuality: string | null; uv: string | null; thermalComfort: string | null };
  dicaDoDia: string;
  agendaRecomendada: Array<{ period: string; label: string; text: string }>;
  impacts: RoutineImpact[];
  insights: ContextInsight[];
  comparativo: Array<{ label: string; unit: string; current: number | null; previous: number | null }>;
  disclaimer: string;
  attribution: string;
}

function rainChanceSummary(snapshot: WeatherSnapshot, today: string): { value: number; note: string } {
  const todayHours = snapshot.hourly.filter((h) => h.time.startsWith(today) && h.precipitationProbability != null);
  if (todayHours.length === 0) return { value: 0, note: "Sem previsão de chuva para hoje." };
  let peak = todayHours[0];
  for (const h of todayHours) if ((h.precipitationProbability ?? 0) > (peak.precipitationProbability ?? 0)) peak = h;
  const hour = Number(peak.time.slice(11, 13));
  const periodLabel = hour < 6 ? "de madrugada" : hour < 12 ? "de manhã" : hour < 18 ? "no fim da tarde" : "à noite";
  return { value: Math.round(peak.precipitationProbability ?? 0), note: `Maior ${periodLabel}.` };
}

function buildDicaDoDia(rainPct: number, uvLevel: string | null, thermalComfort: string | null): string {
  if (rainPct >= 60) return "Leve guarda-chuva e prefira atividades internas durante o período de maior chance de chuva.";
  if (uvLevel === "Alto" || uvLevel === "Muito alto" || uvLevel === "Extremo") return "Índice UV elevado hoje — proteção solar recomendada em exposições mais longas.";
  if (thermalComfort === "Agradável" || thermalComfort === "Ameno") return "Condições favoráveis para atividades ao ar livre, como uma caminhada.";
  if (thermalComfort === "Muito quente") return "Temperatura bem alta hoje — hidrate-se e evite exposição prolongada ao sol.";
  return "Dia dentro do padrão observado — sem condições que exijam atenção especial.";
}

function buildAgendaRecomendada(rainByPeriod: Record<string, number | null>): Array<{ period: string; label: string; text: string }> {
  const manha = rainByPeriod.manha ?? 0;
  const tarde = rainByPeriod.tarde ?? 0;
  const noite = rainByPeriod.noite ?? 0;
  return [
    { period: "manha", label: "Manhã", text: manha != null && manha >= 50 ? "Chance de chuva na manhã — bom momento para tarefas internas." : "Boas condições e mais energia — priorize tarefas importantes." },
    { period: "tarde", label: "Tarde", text: tarde != null && tarde >= 50 ? "Maior chance de chuva; prefira atividades internas." : "Janela favorável para atividades ao ar livre, se a agenda permitir." },
    { period: "noite", label: "Noite", text: noite != null && noite >= 50 ? "Chuva prevista à noite — boa janela para leitura e revisão em casa." : "Boa janela para leitura e revisão." },
  ];
}

async function computeComparativo(db: Db, ownerId: string, lat: number, lon: number, timezone: string, period: ContextPeriod) {
  const days = Math.max(periodDays(period), 7);
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  const prevTo = new Date(from);
  prevTo.setUTCDate(prevTo.getUTCDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setUTCDate(prevFrom.getUTCDate() - (days - 1));

  async function aggregateWindow(fromD: Date, toD: Date) {
    const fromStr = isoDate(fromD);
    const toStr = isoDate(toD);
    const [weather, focusRes, moodRes, walkRes] = await Promise.all([
      OpenMeteoWeatherProvider.getHistoricalWeather(lat, lon, timezone, fromStr, toStr),
      db.execute({ sql: `SELECT SUM(actual_minutes) AS v FROM focus_sessions WHERE owner_id = ? AND date(started_at) BETWEEN date(?) AND date(?)`, args: [ownerId, fromStr, toStr] }),
      db.execute({ sql: `SELECT AVG(mood) AS v FROM mood_entries WHERE owner_id = ? AND date(recorded_at) BETWEEN date(?) AND date(?)`, args: [ownerId, fromStr, toStr] }),
      db.execute({ sql: `SELECT SUM(distance_km) AS v FROM workouts WHERE owner_id = ? AND kind LIKE '%aminhada%' AND date(performed_at) BETWEEN date(?) AND date(?)`, args: [ownerId, fromStr, toStr] }),
    ]);
    const temps = weather.map((w) => w.temperatureMean).filter((v): v is number => v != null);
    const rainyDays = weather.filter((w) => w.precipitationSum != null && w.precipitationSum > 0).length;
    return {
      temperature: temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null,
      rainyDays,
      focusHours: (focusRes.rows[0] as unknown as { v: number | null })?.v != null ? Number((focusRes.rows[0] as unknown as { v: number }).v) / 60 : null,
      mood: (moodRes.rows[0] as unknown as { v: number | null })?.v ?? null,
      walkKm: (walkRes.rows[0] as unknown as { v: number | null })?.v ?? null,
    };
  }

  const [current, previous] = await Promise.all([aggregateWindow(from, to), aggregateWindow(prevFrom, prevTo)]);

  return [
    { label: "Temperatura média", unit: "°C", current: current.temperature != null ? Math.round(current.temperature * 10) / 10 : null, previous: previous.temperature != null ? Math.round(previous.temperature * 10) / 10 : null },
    { label: "Dias de chuva", unit: "dias", current: current.rainyDays, previous: previous.rainyDays },
    { label: "Humor médio", unit: "/5", current: current.mood != null ? Math.round(current.mood * 10) / 10 : null, previous: previous.mood != null ? Math.round(previous.mood * 10) / 10 : null },
    { label: "Focus", unit: "h", current: current.focusHours != null ? Math.round(current.focusHours * 10) / 10 : null, previous: previous.focusHours != null ? Math.round(previous.focusHours * 10) / 10 : null },
    { label: "Caminhada", unit: "km", current: current.walkKm != null ? Math.round(current.walkKm * 10) / 10 : null, previous: previous.walkKm != null ? Math.round(previous.walkKm * 10) / 10 : null },
  ];
}

export async function getContextDashboard(db: Db, ownerId: string, period: ContextPeriod): Promise<ContextTodayDashboard | { configured: false }> {
  const location = await getContextLocation(db, ownerId);
  if (!location.configured || location.latitude == null || location.longitude == null) {
    return { configured: false };
  }

  const timezone = location.timezone ?? "America/Sao_Paulo";
  const [snapshot, airQuality] = await Promise.all([
    OpenMeteoWeatherProvider.getForecast(location.latitude, location.longitude, timezone),
    location.showAirQuality ? OpenMeteoWeatherProvider.getAirQuality(location.latitude, location.longitude) : Promise.resolve<AirQualityCurrent | null>(null),
  ]);

  const today = isoDate(new Date());
  const todayDaily = snapshot.daily.find((d) => d.date === today) ?? snapshot.daily[0];
  const tomorrowDaily = snapshot.daily[1] ?? null;

  const conditionInfo = mapWeatherCode(snapshot.current.weatherCode);
  const rain = rainChanceSummary(snapshot, today);
  const uv = location.showUv ? classifyUV(todayDaily?.uvIndexMax ?? null) : null;
  const aqiInfo = airQuality ? classifyAQI(airQuality.usAqi) : null;
  const thermal = classifyThermalComfort(snapshot.current.apparentTemperature, snapshot.current.humidity);

  const todayPeriods = PERIOD_BLOCKS.map((block) => {
    const hourly = findHourly(snapshot, today, block.hour);
    const info = mapWeatherCode(hourly?.weatherCode ?? snapshot.current.weatherCode);
    return {
      key: block.key,
      label: block.label,
      temperature: Math.round(hourly?.temperature ?? snapshot.current.temperature),
      condition: info.label,
      icon: info.icon,
      rainProbability: hourly?.precipitationProbability ?? null,
    };
  });

  const rainByPeriod: Record<string, number | null> = {};
  for (const p of todayPeriods) rainByPeriod[p.key] = p.rainProbability;

  const tomorrow = tomorrowDaily
    ? {
        temperature: Math.round((tomorrowDaily.temperatureMax + tomorrowDaily.temperatureMin) / 2),
        condition: mapWeatherCode(tomorrowDaily.weatherCode).label,
        icon: mapWeatherCode(tomorrowDaily.weatherCode).icon,
      }
    : null;

  const hourlyChart = snapshot.hourly.filter((h) => h.time.startsWith(today)).map((h) => ({
    time: h.time,
    temperature: h.temperature,
    apparentTemperature: h.apparentTemperature,
    rainProbability: h.precipitationProbability,
  }));

  // Histórico para padrões/comparativo — só busca se o período pedido justificar (regra 77: evitar chamadas redundantes).
  const days = Math.max(periodDays(period), 14);
  const histTo = new Date();
  const histFrom = new Date(histTo);
  histFrom.setUTCDate(histFrom.getUTCDate() - (days - 1));
  const historicalWeather = await OpenMeteoWeatherProvider.getHistoricalWeather(location.latitude, location.longitude, timezone, isoDate(histFrom), isoDate(histTo));
  const { impacts, insights, disclaimer } = await computeContextPatterns(db, ownerId, historicalWeather);
  const comparativo = await computeComparativo(db, ownerId, location.latitude, location.longitude, timezone, period);

  return {
    configured: true,
    location: { city: location.city, region: location.region, country: location.country },
    lastUpdated: new Date().toISOString(),
    kpis: {
      temperature: { value: Math.round(snapshot.current.temperature), apparentTemperature: Math.round(snapshot.current.apparentTemperature) },
      rainChance: rain,
      airQuality: aqiInfo && airQuality?.usAqi != null ? { aqi: Math.round(airQuality.usAqi), level: aqiInfo.level } : null,
      daylight: {
        durationMinutes: todayDaily ? Math.round(todayDaily.daylightSeconds / 60) : 0,
        sunrise: todayDaily?.sunrise?.slice(11, 16) ?? "--:--",
        sunset: todayDaily?.sunset?.slice(11, 16) ?? "--:--",
      },
    },
    todayPeriods,
    tomorrow,
    hourlyChart,
    summary: {
      humidity: snapshot.current.humidity,
      windSpeedKmh: snapshot.current.windSpeedKmh,
      uv: uv && todayDaily?.uvIndexMax != null ? { value: todayDaily.uvIndexMax, level: uv.level, description: uv.description } : null,
    },
    resumoAmbiental: {
      condition: conditionInfo.label,
      airQuality: aqiInfo?.level ?? null,
      uv: uv?.level ?? null,
      thermalComfort: thermal,
    },
    dicaDoDia: buildDicaDoDia(rain.value, uv?.level ?? null, thermal),
    agendaRecomendada: buildAgendaRecomendada(rainByPeriod),
    impacts,
    insights,
    comparativo,
    disclaimer,
    attribution: "Dados meteorológicos: Open-Meteo",
  };
}

/**
 * WeatherSignalProvider — única porta de entrada para o módulo Signals
 * consumir clima. Signals NUNCA chama Open-Meteo direto (regra 46).
 * Sem localização configurada, devolve not_connected — nunca um valor
 * fabricado (regra 49).
 */
export interface WeatherSignalForSignals {
  status: SignalStatus;
  value: number | null;
  unit: string | null;
  description: string;
}

export async function getWeatherSignalForSignals(db: Db, ownerId: string): Promise<WeatherSignalForSignals> {
  const location: ContextLocation = await getContextLocation(db, ownerId);
  if (!location.configured || location.latitude == null || location.longitude == null) {
    return { status: "not_connected", value: null, unit: null, description: "Localização não configurada em Contexto do Dia." };
  }
  try {
    const snapshot = await OpenMeteoWeatherProvider.getForecast(location.latitude, location.longitude, location.timezone ?? "America/Sao_Paulo");
    const condition = mapWeatherCode(snapshot.current.weatherCode);
    return {
      status: "ok",
      value: Math.round(snapshot.current.temperature),
      unit: "°C",
      description: `${condition.label}, sensação de ${Math.round(snapshot.current.apparentTemperature)}°C em ${location.city ?? "sua localização"}.`,
    };
  } catch {
    return { status: "insufficient_data", value: null, unit: null, description: "Não foi possível atualizar o clima agora." };
  }
}
