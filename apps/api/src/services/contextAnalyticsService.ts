/**
 * Contexto do Dia — Context Analytics Service.
 *
 * Cruza histórico meteorológico (Open-Meteo Archive API) com séries
 * diárias que já existem em outros módulos (Focus, Saúde, exercício)
 * para responder perguntas como "eu caminho menos em dias chuvosos?".
 * Nunca calculado em componente React (regra 28/12 do briefing).
 *
 * Linguagem sempre não-causal: "associação", "tendência", "diferença
 * observada". Nunca "causou"/"provocou"/"garante" (regra 33). Toda
 * comparação exige amostra mínima de 5 dias em cada grupo — abaixo
 * disso, o item simplesmente não aparece (nunca fabricado).
 */
import type { getDb } from "../db/client.js";
import { pearson } from "./correlationService.js";
import { isRainyDay, isSunnyDay } from "./weatherCodeUtils.js";
import type { HistoricalDailyWeather } from "./openMeteoProvider.js";

type Db = ReturnType<typeof getDb>;

const MIN_GROUP_SIZE = 5;
const MIN_CORRELATION_N = 10;

export interface RoutineImpact {
  key: string;
  label: string;
  groupLabel: string;
  value: number;
  unit: string;
  comparisonPct: number | null;
  favorable: "positive" | "negative" | "neutral";
  sampleSize: number;
}

export interface ContextInsight {
  text: string;
}

interface DailyRow {
  d: string;
  v: number | null;
}

function toMap(rows: DailyRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) if (r.v != null) m.set(r.d, Number(r.v));
  return m;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function pctDiff(a: number, b: number): number | null {
  if (b === 0) return null;
  return Math.round(((a - b) / b) * 100);
}

async function internalDailySeries(db: Db, ownerId: string, from: string, to: string) {
  const [focusRows, walkRows, moodRows, sleepRows] = await Promise.all([
    db.execute({
      sql: `SELECT date(started_at) AS d, SUM(actual_minutes) AS v FROM focus_sessions WHERE owner_id = ? AND date(started_at) BETWEEN date(?) AND date(?) GROUP BY d`,
      args: [ownerId, from, to],
    }),
    db.execute({
      sql: `SELECT date(performed_at) AS d, SUM(duration_minutes) AS v FROM workouts WHERE owner_id = ? AND kind LIKE '%aminhada%' AND date(performed_at) BETWEEN date(?) AND date(?) GROUP BY d`,
      args: [ownerId, from, to],
    }),
    db.execute({
      sql: `SELECT date(recorded_at) AS d, AVG(mood) AS v FROM mood_entries WHERE owner_id = ? AND date(recorded_at) BETWEEN date(?) AND date(?) GROUP BY d`,
      args: [ownerId, from, to],
    }),
    db.execute({
      sql: `SELECT date(woke_up_at) AS d, AVG(duration_minutes) AS v FROM sleep_entries WHERE owner_id = ? AND date(woke_up_at) BETWEEN date(?) AND date(?) GROUP BY d`,
      args: [ownerId, from, to],
    }),
  ]);
  return {
    focus: toMap(focusRows.rows as unknown as DailyRow[]),
    walk: toMap(walkRows.rows as unknown as DailyRow[]),
    mood: toMap(moodRows.rows as unknown as DailyRow[]),
    sleep: toMap(sleepRows.rows as unknown as DailyRow[]),
  };
}

function groupBy<T>(dates: string[], predicate: (d: string) => boolean | null): { yes: string[]; no: string[] } {
  const yes: string[] = [];
  const no: string[] = [];
  for (const d of dates) {
    const result = predicate(d);
    if (result === true) yes.push(d);
    else if (result === false) no.push(d);
  }
  return { yes, no };
}

function valuesFor(dates: string[], series: Map<string, number>): number[] {
  return dates.map((d) => series.get(d)).filter((v): v is number => v != null);
}

export interface ContextPatternsResult {
  impacts: RoutineImpact[];
  insights: ContextInsight[];
  disclaimer: string;
}

/**
 * Calcula "Impacto percebido na rotina" / "Correlação do contexto com
 * sua rotina" — mesmos números, duas apresentações visuais diferentes
 * no frontend (regra 27/32). Cada item só aparece com >= MIN_GROUP_SIZE
 * dias em cada grupo comparado.
 */
export async function computeContextPatterns(db: Db, ownerId: string, weather: HistoricalDailyWeather[]): Promise<ContextPatternsResult> {
  if (weather.length === 0) {
    return { impacts: [], insights: [], disclaimer: "Padrões representam associações observadas no seu histórico, não conclusões causais." };
  }
  const from = weather[0].date;
  const to = weather[weather.length - 1].date;
  const dates = weather.map((w) => w.date);
  const internal = await internalDailySeries(db, ownerId, from, to);

  const weatherByDate = new Map(weather.map((w) => [w.date, w]));
  const impacts: RoutineImpact[] = [];

  // Focus em dias amenos (18-25°C) vs demais dias.
  const mildDays = groupBy(dates, (d) => {
    const w = weatherByDate.get(d);
    if (!w?.temperatureMean) return null;
    return w.temperatureMean >= 18 && w.temperatureMean <= 25;
  });
  const mildFocus = avg(valuesFor(mildDays.yes, internal.focus));
  const otherFocus = avg(valuesFor(mildDays.no, internal.focus));
  if (mildDays.yes.length >= MIN_GROUP_SIZE && mildDays.no.length >= MIN_GROUP_SIZE && mildFocus != null && otherFocus != null) {
    const pct = pctDiff(mildFocus, otherFocus);
    impacts.push({
      key: "focus_mild_days",
      label: "Focus em dias amenos",
      groupLabel: "vs. outras faixas de temperatura",
      value: Math.round(mildFocus),
      unit: "min",
      comparisonPct: pct,
      favorable: pct == null || Math.abs(pct) < 5 ? "neutral" : pct > 0 ? "positive" : "negative",
      sampleSize: mildDays.yes.length + mildDays.no.length,
    });
  }

  // Caminhada em dias secos vs chuvosos.
  const dryDays = groupBy(dates, (d) => {
    const w = weatherByDate.get(d);
    if (w?.precipitationSum == null) return null;
    return !isRainyDay(w.precipitationSum);
  });
  const dryWalk = avg(valuesFor(dryDays.yes, internal.walk));
  const rainyWalk = avg(valuesFor(dryDays.no, internal.walk));
  if (dryDays.yes.length >= MIN_GROUP_SIZE && dryDays.no.length >= MIN_GROUP_SIZE && dryWalk != null && rainyWalk != null) {
    const pct = pctDiff(dryWalk, rainyWalk);
    impacts.push({
      key: "walk_dry_days",
      label: "Caminhada em dias secos",
      groupLabel: "vs. dias com chuva",
      value: Math.round(dryWalk),
      unit: "min",
      comparisonPct: pct,
      favorable: pct == null || Math.abs(pct) < 5 ? "neutral" : pct > 0 ? "positive" : "negative",
      sampleSize: dryDays.yes.length + dryDays.no.length,
    });
  }

  // Humor em dias ensolarados vs nublados.
  const sunnyDays = groupBy(dates, (d) => {
    const w = weatherByDate.get(d);
    if (w?.weatherCode == null) return null;
    return isSunnyDay(w.weatherCode, w.cloudCoverMean);
  });
  const sunnyMood = avg(valuesFor(sunnyDays.yes, internal.mood));
  const cloudyMood = avg(valuesFor(sunnyDays.no, internal.mood));
  if (sunnyDays.yes.length >= MIN_GROUP_SIZE && sunnyDays.no.length >= MIN_GROUP_SIZE && sunnyMood != null && cloudyMood != null) {
    const pct = pctDiff(sunnyMood, cloudyMood);
    impacts.push({
      key: "mood_sunny_days",
      label: "Humor em dias ensolarados",
      groupLabel: "vs. dias nublados",
      value: Math.round(sunnyMood * 10) / 10,
      unit: "/5",
      comparisonPct: pct,
      favorable: pct == null || Math.abs(pct) < 5 ? "neutral" : pct > 0 ? "positive" : "negative",
      sampleSize: sunnyDays.yes.length + sunnyDays.no.length,
    });
  }

  // Sono após noites quentes (sensação >= 24°C) vs noites mais frias.
  // O sono registrado na madrugada do dia D corresponde à noite do dia D-1 — comparamos com a temperatura do dia anterior.
  const warmNightDates = dates.filter((d) => {
    const prevIdx = dates.indexOf(d) - 1;
    if (prevIdx < 0) return false;
    const prevWeather = weatherByDate.get(dates[prevIdx]);
    return prevWeather?.apparentTemperatureMean != null && prevWeather.apparentTemperatureMean >= 24;
  });
  const coolNightDates = dates.filter((d) => {
    const prevIdx = dates.indexOf(d) - 1;
    if (prevIdx < 0) return false;
    const prevWeather = weatherByDate.get(dates[prevIdx]);
    return prevWeather?.apparentTemperatureMean != null && prevWeather.apparentTemperatureMean < 24;
  });
  const warmSleep = avg(valuesFor(warmNightDates, internal.sleep));
  const coolSleep = avg(valuesFor(coolNightDates, internal.sleep));
  if (warmNightDates.length >= MIN_GROUP_SIZE && coolNightDates.length >= MIN_GROUP_SIZE && warmSleep != null && coolSleep != null) {
    const pct = pctDiff(warmSleep, coolSleep);
    impacts.push({
      key: "sleep_warm_nights",
      label: "Sono após noites quentes",
      groupLabel: "vs. noites mais frias",
      value: Math.round(warmSleep),
      unit: "min",
      comparisonPct: pct,
      favorable: pct == null || Math.abs(pct) < 5 ? "neutral" : pct < 0 ? "negative" : "positive",
      sampleSize: warmNightDates.length + coolNightDates.length,
    });
  }

  // Insights em linguagem natural, só a partir de correlações com amostra mínima — reaproveita pearson() já existente.
  const insights: ContextInsight[] = [];
  const tempSeries = new Map(dates.filter((d) => weatherByDate.get(d)?.temperatureMean != null).map((d) => [d, weatherByDate.get(d)!.temperatureMean as number]));
  const pairedTempFocus = dates.filter((d) => tempSeries.has(d) && internal.focus.has(d));
  if (pairedTempFocus.length >= MIN_CORRELATION_N) {
    const r = pearson(pairedTempFocus.map((d) => tempSeries.get(d)!), pairedTempFocus.map((d) => internal.focus.get(d)!));
    if (r != null && Math.abs(r) >= 0.3) {
      insights.push({
        text: `Nos dias com temperatura ${r > 0 ? "mais alta" : "mais amena"}, você tende a registrar ${r > 0 ? "mais" : "menos"} Focus (associação observada, r=${r.toFixed(2)}, ${pairedTempFocus.length} dias).`,
      });
    }
  }
  const rainDates = groupBy(dates, (d) => {
    const w = weatherByDate.get(d);
    return w?.precipitationSum != null ? isRainyDay(w.precipitationSum) : null;
  });
  if (rainDates.yes.length >= MIN_GROUP_SIZE) {
    const rainyWalkAvg = avg(valuesFor(rainDates.yes, internal.walk));
    if (rainyWalkAvg != null && (avg(valuesFor(rainDates.no, internal.walk)) ?? 0) > rainyWalkAvg) {
      insights.push({ text: "A chuva coincidiu com menos caminhadas no período analisado." });
    }
  }
  if (sunnyDays.yes.length >= MIN_GROUP_SIZE && sunnyMood != null && cloudyMood != null && sunnyMood > cloudyMood) {
    insights.push({ text: "Seu humor foi mais alto nos dias com maior luz natural." });
  }

  return { impacts, insights, disclaimer: "Padrões representam associações observadas no seu histórico, não conclusões causais." };
}
