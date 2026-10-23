/**
 * Signals — detecção de padrões (Padrões detectados).
 *
 * Determinístico primeiro: toda detecção aqui é estatística simples
 * sobre dados reais (média, comparação de períodos, correlação de
 * Pearson já existente em `correlationService.ts`). Nunca usamos
 * linguagem de causa ("X causa Y") — sempre "sugerem", "associação",
 * "tendência", "durante este período". Amostra mínima por tipo:
 *   - Tendência: 7 dias de histórico (comparação com os 7 anteriores)
 *   - Associação (correlação): 10 observações pareadas
 *   - Consistência: 14 dias de janela
 * Abaixo do mínimo, o padrão simplesmente não aparece — nunca aparece
 * "quase" um padrão com poucos dados.
 */
import type { getDb } from "../db/client.js";
import { computeHealthCorrelations, type CorrelationResult } from "./correlationService.js";
import { userTimezone } from "./gamificationService.js";
import { localDailyAggregate } from "./localDayService.js";

type Db = ReturnType<typeof getDb>;

export type PatternType = "trend" | "attention" | "positive_association" | "negative_association" | "change" | "consistency";

export interface DetectedPattern {
  type: PatternType;
  signal: string;
  title: string;
  description: string;
  sampleSize: number;
}

const MIN_TREND_DAYS = 7;
const MIN_ASSOCIATION_N = 10;


function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Compara a média dos últimos `windowDays` dias com a dos `windowDays` anteriores a esses (janela imediatamente anterior, sem sobreposição). */
function trendFor(series: Map<string, number>, dates: string[], windowDays: number, label: string, signalKey: string, unit: string, higherIsBetter: boolean): DetectedPattern | null {
  if (dates.length < windowDays * 2) return null;
  const recentDates = dates.slice(-windowDays);
  const priorDates = dates.slice(-windowDays * 2, -windowDays);
  const recentValues = recentDates.map((d) => series.get(d)).filter((v): v is number => v != null);
  const priorValues = priorDates.map((d) => series.get(d)).filter((v): v is number => v != null);
  if (recentValues.length < Math.ceil(windowDays * 0.6) || priorValues.length < Math.ceil(windowDays * 0.6)) return null;
  const recentAvg = avg(recentValues)!;
  const priorAvg = avg(priorValues)!;
  if (priorAvg === 0) return null;
  const changePct = ((recentAvg - priorAvg) / priorAvg) * 100;
  if (Math.abs(changePct) < 10) return null; // variação pequena não vira "padrão"

  const rising = changePct > 0;
  const favorable = higherIsBetter ? rising : !rising;
  const direction = rising ? "subiu" : "caiu";
  return {
    type: favorable ? "trend" : "attention",
    signal: signalKey,
    title: `Tendência em ${label}`,
    description: `${label} ${direction} ${Math.abs(changePct).toFixed(0)}% nos últimos ${windowDays} dias em relação aos ${windowDays} dias anteriores (${recentAvg.toFixed(1)}${unit} vs ${priorAvg.toFixed(1)}${unit}). Isso é uma tendência observada no período, não uma causa identificada.`,
    sampleSize: recentValues.length + priorValues.length,
  };
}

function correlationToPattern(c: CorrelationResult): DetectedPattern {
  return {
    type: c.direction === "positiva" ? "positive_association" : "negative_association",
    signal: c.pair,
    title: c.label,
    description: c.description,
    sampleSize: c.n,
  };
}

/**
 * Consistência: sequência de dias seguidos com registro de um sinal
 * (ex.: foco todos os dias). Só conta como padrão a partir de 5 dias
 * consecutivos dentro da janela analisada.
 */
function consistencyFor(series: Map<string, number>, dates: string[], label: string, signalKey: string): DetectedPattern | null {
  if (dates.length < 14) return null;
  let streak = 0;
  let bestStreak = 0;
  for (const d of dates) {
    if (series.has(d)) {
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
    } else {
      streak = 0;
    }
  }
  if (bestStreak < 5) return null;
  return {
    type: "consistency",
    signal: signalKey,
    title: `Consistência em ${label}`,
    description: `Registros de ${label.toLowerCase()} em ${bestStreak} dias seguidos dentro do período analisado — um padrão de regularidade, não uma meta cumprida automaticamente.`,
    sampleSize: bestStreak,
  };
}

function isoRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export async function detectPatterns(db: Db, ownerId: string, from: string, to: string): Promise<DetectedPattern[]> {
  const dates = isoRange(from, to);
  const patterns: DetectedPattern[] = [];

  // Séries agrupadas pelo dia local do usuário (o date() do SQLite usaria o dia UTC).
  const timeZone = await userTimezone(db, ownerId);
  const [sleepSeries, energySeries] = await Promise.all([
    localDailyAggregate(db, ownerId, { table: "sleep_entries", column: "woke_up_at", valueExpr: "duration_minutes", agg: "avg", fromDay: from, toDay: to, timeZone }),
    localDailyAggregate(db, ownerId, { table: "mood_entries", column: "recorded_at", valueExpr: "energy", agg: "avg", fromDay: from, toDay: to, timeZone }),
  ]);

  const sleepTrend = trendFor(sleepSeries, dates, MIN_TREND_DAYS, "Sono", "sleep", "min", true);
  if (sleepTrend) patterns.push(sleepTrend);

  const energyTrend = trendFor(energySeries, dates, MIN_TREND_DAYS, "Energia", "energy", "", true);
  if (energyTrend) patterns.push(energyTrend);

  // Associações: reaproveita o serviço de correlação já existente em Saúde/Analytics
  // (nunca recalcula Pearson de novo) e só usa os pares com amostra >= MIN_ASSOCIATION_N.
  const correlations = await computeHealthCorrelations(db, ownerId);
  for (const c of correlations) {
    if (c.n >= MIN_ASSOCIATION_N) patterns.push(correlationToPattern(c));
  }

  return patterns;
}
