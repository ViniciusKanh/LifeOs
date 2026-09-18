/**
 * Signals — serviço agregador principal.
 *
 * Signals NUNCA é uma fonte de dado nova: cada card abaixo lê direto
 * das tabelas de origem (sono, humor, foco, exercício, leitura,
 * agenda) e só resume/compara. Sinais sem coletor real no LifeOS
 * (Clima, Uso de tela/Digital Wellbeing) aparecem como
 * `not_connected` — nunca com um valor inventado.
 *
 * Fluxo: COLETAR (queries abaixo) → CONSOLIDAR (agregação por período)
 * → COMPARAR (período atual vs período anterior de mesmo tamanho) →
 * DETECTAR (signalsPatternService) → SUGERIR (signalsRecommendationService).
 */
import type { getDb } from "../db/client.js";
import {
  scoreSleep,
  scoreFromFivePoint,
  scoreProductivity,
  scoreHealth,
  scoreBalance,
  buildRadar,
  classifyDay,
  type RadarDimension,
  type DayClassification,
} from "./signalsScoreService.js";
import { detectPatterns, type DetectedPattern } from "./signalsPatternService.js";
import { buildRecommendation, type SignalsRecommendation } from "./signalsRecommendationService.js";
import { getWeatherSignalForSignals } from "./contextService.js";

type Db = ReturnType<typeof getDb>;

export type SignalPeriod = "today" | "7d" | "30d";
export type SignalStatus = "ok" | "attention" | "insufficient_data" | "not_connected";

export interface SignalCard {
  key: string;
  label: string;
  value: number | string | null;
  unit: string | null;
  status: SignalStatus;
  description: string;
  comparisonPct: number | null;
  comparisonLabel: string | null;
}

export interface SignalsDashboard {
  period: SignalPeriod;
  from: string;
  to: string;
  signals: SignalCard[];
  radar: RadarDimension[];
  dayClassification: DayClassification | null;
  patterns: DetectedPattern[];
  recommendation: SignalsRecommendation;
}

function periodRange(period: SignalPeriod): { from: string; to: string; priorFrom: string; priorTo: string; days: number } {
  const to = new Date().toISOString().slice(0, 10);
  const days = period === "today" ? 1 : period === "7d" ? 7 : 30;
  const fromDate = new Date();
  fromDate.setUTCDate(fromDate.getUTCDate() - (days - 1));
  const from = fromDate.toISOString().slice(0, 10);

  const priorToDate = new Date(fromDate);
  priorToDate.setUTCDate(priorToDate.getUTCDate() - 1);
  const priorFromDate = new Date(priorToDate);
  priorFromDate.setUTCDate(priorFromDate.getUTCDate() - (days - 1));

  return { from, to, priorFrom: priorFromDate.toISOString().slice(0, 10), priorTo: priorToDate.toISOString().slice(0, 10), days };
}

function pctChange(current: number | null, prior: number | null): number | null {
  if (current == null || prior == null || prior === 0) return null;
  return Math.round(((current - prior) / prior) * 100);
}

function comparisonLabel(pct: number | null, higherIsBetter: boolean): string | null {
  if (pct == null) return null;
  if (Math.abs(pct) < 3) return "estável em relação ao período anterior";
  const rose = pct > 0;
  const favorable = higherIsBetter ? rose : !rose;
  return `${rose ? "+" : ""}${pct}% em relação ao período anterior${favorable ? "" : " (atenção)"}`;
}

interface Aggregates {
  sleepMinutesAvg: number | null;
  sleepQualityAvg: number | null;
  moodAvg: number | null;
  energyAvg: number | null;
  stressAvg: number | null;
  focusMinutesAvg: number | null;
  exerciseMinutesAvg: number | null;
  waterMlAvg: number | null;
  readingMinutesAvg: number | null;
  readingPagesTotal: number | null;
  tasksCompletedAvg: number | null;
  agendaEventsToday: number | null;
}

async function fetchAggregates(db: Db, ownerId: string, from: string, to: string, days: number): Promise<Aggregates> {
  const [sleep, mood, focus, exercise, water, reading, tasks, agenda] = await Promise.all([
    db.execute({
      sql: `SELECT AVG(duration_minutes) AS mins, AVG(quality) AS qual FROM sleep_entries WHERE owner_id = ? AND date(woke_up_at) BETWEEN date(?) AND date(?)`,
      args: [ownerId, from, to],
    }),
    db.execute({
      sql: `SELECT AVG(mood) AS mood, AVG(energy) AS energy, AVG(stress) AS stress FROM mood_entries WHERE owner_id = ? AND date(recorded_at) BETWEEN date(?) AND date(?)`,
      args: [ownerId, from, to],
    }),
    db.execute({
      sql: `SELECT SUM(actual_minutes) AS mins FROM focus_sessions WHERE owner_id = ? AND date(started_at) BETWEEN date(?) AND date(?)`,
      args: [ownerId, from, to],
    }),
    db.execute({
      sql: `SELECT SUM(duration_minutes) AS mins FROM workouts WHERE owner_id = ? AND date(performed_at) BETWEEN date(?) AND date(?)`,
      args: [ownerId, from, to],
    }),
    db.execute({
      sql: `SELECT SUM(amount_ml) AS ml FROM water_entries WHERE owner_id = ? AND date(recorded_at) BETWEEN date(?) AND date(?)`,
      args: [ownerId, from, to],
    }),
    db.execute({
      sql: `SELECT SUM(duration_minutes) AS mins, SUM(pages_read) AS pages FROM reading_sessions WHERE owner_id = ? AND date(started_at) BETWEEN date(?) AND date(?)`,
      args: [ownerId, from, to],
    }),
    db.execute({
      sql: `SELECT COUNT(*) AS n FROM tasks WHERE owner_id = ? AND status = 'Concluído' AND date(updated_at) BETWEEN date(?) AND date(?)`,
      args: [ownerId, from, to],
    }),
    db.execute({
      sql: `SELECT COUNT(*) AS n FROM events WHERE owner_id = ? AND date(starts_at) BETWEEN date(?) AND date(?)`,
      args: [ownerId, from, to],
    }),
  ]);

  const sleepRow = sleep.rows[0] as unknown as { mins: number | null; qual: number | null };
  const moodRow = mood.rows[0] as unknown as { mood: number | null; energy: number | null; stress: number | null };
  const focusRow = focus.rows[0] as unknown as { mins: number | null };
  const exerciseRow = exercise.rows[0] as unknown as { mins: number | null };
  const waterRow = water.rows[0] as unknown as { ml: number | null };
  const readingRow = reading.rows[0] as unknown as { mins: number | null; pages: number | null };
  const tasksRow = tasks.rows[0] as unknown as { n: number | null };
  const agendaRow = agenda.rows[0] as unknown as { n: number | null };

  return {
    sleepMinutesAvg: sleepRow?.mins ?? null,
    sleepQualityAvg: sleepRow?.qual ?? null,
    moodAvg: moodRow?.mood ?? null,
    energyAvg: moodRow?.energy ?? null,
    stressAvg: moodRow?.stress ?? null,
    focusMinutesAvg: focusRow?.mins != null ? focusRow.mins / days : null,
    exerciseMinutesAvg: exerciseRow?.mins != null ? exerciseRow.mins / days : null,
    waterMlAvg: waterRow?.ml != null ? waterRow.ml / days : null,
    readingMinutesAvg: readingRow?.mins != null ? readingRow.mins / days : null,
    readingPagesTotal: readingRow?.pages ?? null,
    tasksCompletedAvg: tasksRow?.n != null ? tasksRow.n / days : null,
    agendaEventsToday: agendaRow?.n ?? null,
  };
}

function buildSignalCards(current: Aggregates, prior: Aggregates): SignalCard[] {
  const cards: SignalCard[] = [];

  cards.push({
    key: "sleep",
    label: "Sono",
    value: current.sleepMinutesAvg != null ? Math.round(current.sleepMinutesAvg) : null,
    unit: "min",
    status: current.sleepMinutesAvg == null ? "insufficient_data" : current.sleepMinutesAvg < 360 ? "attention" : "ok",
    description: current.sleepMinutesAvg != null ? `Média de ${(current.sleepMinutesAvg / 60).toFixed(1)}h por noite no período.` : "Sem registros de sono neste período.",
    comparisonPct: pctChange(current.sleepMinutesAvg, prior.sleepMinutesAvg),
    comparisonLabel: comparisonLabel(pctChange(current.sleepMinutesAvg, prior.sleepMinutesAvg), true),
  });

  cards.push({
    key: "mood",
    label: "Humor",
    value: current.moodAvg != null ? Number(current.moodAvg.toFixed(1)) : null,
    unit: "/5",
    status: current.moodAvg == null ? "insufficient_data" : current.moodAvg < 2.5 ? "attention" : "ok",
    description: current.moodAvg != null ? `Média de humor autorregistrado de ${current.moodAvg.toFixed(1)} em 5 no período.` : "Sem check-ins de humor neste período.",
    comparisonPct: pctChange(current.moodAvg, prior.moodAvg),
    comparisonLabel: comparisonLabel(pctChange(current.moodAvg, prior.moodAvg), true),
  });

  cards.push({
    key: "energy",
    label: "Energia",
    value: current.energyAvg != null ? Number(current.energyAvg.toFixed(1)) : null,
    unit: "/5",
    status: current.energyAvg == null ? "insufficient_data" : current.energyAvg < 2.5 ? "attention" : "ok",
    description: current.energyAvg != null ? `Média de energia autorregistrada de ${current.energyAvg.toFixed(1)} em 5 no período.` : "Sem check-ins de energia neste período.",
    comparisonPct: pctChange(current.energyAvg, prior.energyAvg),
    comparisonLabel: comparisonLabel(pctChange(current.energyAvg, prior.energyAvg), true),
  });

  cards.push({
    key: "focus",
    label: "Focus",
    value: current.focusMinutesAvg != null ? Math.round(current.focusMinutesAvg) : null,
    unit: "min/dia",
    status: current.focusMinutesAvg == null ? "insufficient_data" : "ok",
    description: current.focusMinutesAvg != null ? `Média de ${Math.round(current.focusMinutesAvg)} min de foco por dia no período.` : "Sem sessões de Focus registradas neste período.",
    comparisonPct: pctChange(current.focusMinutesAvg, prior.focusMinutesAvg),
    comparisonLabel: comparisonLabel(pctChange(current.focusMinutesAvg, prior.focusMinutesAvg), true),
  });

  cards.push({
    key: "exercise",
    label: "Exercício",
    value: current.exerciseMinutesAvg != null ? Math.round(current.exerciseMinutesAvg) : null,
    unit: "min/dia",
    status: current.exerciseMinutesAvg == null ? "insufficient_data" : "ok",
    description: current.exerciseMinutesAvg != null ? `Média de ${Math.round(current.exerciseMinutesAvg)} min de exercício por dia no período.` : "Sem treinos registrados neste período.",
    comparisonPct: pctChange(current.exerciseMinutesAvg, prior.exerciseMinutesAvg),
    comparisonLabel: comparisonLabel(pctChange(current.exerciseMinutesAvg, prior.exerciseMinutesAvg), true),
  });

  cards.push({
    key: "reading",
    label: "Leitura",
    value: current.readingPagesTotal ?? null,
    unit: "páginas",
    status: current.readingPagesTotal == null ? "insufficient_data" : "ok",
    description: current.readingPagesTotal != null ? `${current.readingPagesTotal} páginas lidas no período.` : "Sem sessões de leitura registradas neste período.",
    comparisonPct: pctChange(current.readingPagesTotal, prior.readingPagesTotal),
    comparisonLabel: comparisonLabel(pctChange(current.readingPagesTotal, prior.readingPagesTotal), true),
  });

  cards.push({
    key: "agenda",
    label: "Agenda",
    value: current.agendaEventsToday ?? 0,
    unit: "eventos",
    status: "ok",
    description: `${current.agendaEventsToday ?? 0} evento(s) no calendário no período.`,
    comparisonPct: pctChange(current.agendaEventsToday, prior.agendaEventsToday),
    comparisonLabel: comparisonLabel(pctChange(current.agendaEventsToday, prior.agendaEventsToday), false),
  });


  return cards;
}

export async function getSignalsDashboard(db: Db, ownerId: string, period: SignalPeriod): Promise<SignalsDashboard> {
  const { from, to, priorFrom, priorTo, days } = periodRange(period);

  const [current, prior, patterns, weatherSignal] = await Promise.all([
    fetchAggregates(db, ownerId, from, to, days),
    fetchAggregates(db, ownerId, priorFrom, priorTo, days),
    detectPatterns(db, ownerId, from, to),
    // Signals nunca chama a Open-Meteo direto — sempre via WeatherSignalProvider
    // do Contexto do Dia (fonte única de dado ambiental, regra 46 do briefing).
    getWeatherSignalForSignals(db, ownerId),
  ]);

  const signals = buildSignalCards(current, prior);
  signals.push({
    key: "weather",
    label: "Clima",
    value: weatherSignal.value,
    unit: weatherSignal.unit,
    status: weatherSignal.status,
    description: weatherSignal.description,
    comparisonPct: null,
    comparisonLabel: null,
  });

  const sleepScore = scoreSleep(current.sleepMinutesAvg);
  const radar = buildRadar({
    sleep: sleepScore,
    energy: scoreFromFivePoint(current.energyAvg),
    mood: scoreFromFivePoint(current.moodAvg),
    productivity: scoreProductivity(current.focusMinutesAvg, current.tasksCompletedAvg),
    health: scoreHealth(sleepScore, current.exerciseMinutesAvg, current.waterMlAvg),
    balance: scoreBalance(current.stressAvg),
  });
  const dayClassification = classifyDay(radar);
  const recommendation = buildRecommendation(signals, patterns, radar);

  return { period, from, to, signals, radar, dayClassification, patterns, recommendation };
}
