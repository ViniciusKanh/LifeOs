import type { Client } from "@libsql/client";
import { todayKeyFor, userTimezone } from "./gamificationService.js";
import { collectDailyMetrics, type DailyMetric } from "./dailyMetricsService.js";

/**
 * Placar pessoal: esta semana contra a anterior e contra o recorde de todas
 * as semanas passadas — sem outros usuários. Semana = segunda a domingo no
 * fuso do usuário. Tudo é derivado das fontes originais (nada é copiado).
 */

export type RecordMetric = Extract<DailyMetric, "missions" | "workouts" | "workoutMinutes" | "pages" | "habits" | "xp" | "journal">;

export const RECORD_METRICS: Array<{ key: RecordMetric; label: string; unit: string | null }> = [
  { key: "missions", label: "Missões concluídas", unit: null },
  { key: "workouts", label: "Treinos", unit: null },
  { key: "workoutMinutes", label: "Minutos de treino", unit: "min" },
  { key: "pages", label: "Páginas lidas", unit: "pág." },
  { key: "habits", label: "Hábitos cumpridos", unit: null },
  { key: "xp", label: "XP ganho", unit: "XP" },
  { key: "journal", label: "Dias com diário", unit: "dias" },
];

/** Quantas semanas para trás entram na busca do recorde. */
const HISTORY_WEEKS = 104;

/** Segunda-feira (YYYY-MM-DD) da semana de um dia. */
export function weekStartOf(dayKey: string): string {
  const d = new Date(`${dayKey}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // segunda = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

function addDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface RecordRow {
  key: RecordMetric;
  label: string;
  unit: string | null;
  thisWeek: number;
  lastWeek: number;
  /** Variação % contra a semana passada (null sem base). */
  deltaPct: number | null;
  /** Melhor semana ANTES desta (0 quando não há histórico). */
  best: number;
  bestWeekStart: string | null;
  /** Esta semana superou todas as anteriores (e é maior que zero). */
  newRecord: boolean;
}

/** Regra pura do placar: compara a semana atual com a anterior e com o recorde histórico. */
export function buildRecords(byWeek: Record<RecordMetric, Map<string, number>>, currentWeek: string): RecordRow[] {
  const previousWeek = addDays(currentWeek, -7);
  return RECORD_METRICS.map((m) => {
    const weeks = byWeek[m.key];
    const thisWeek = weeks.get(currentWeek) ?? 0;
    const lastWeek = weeks.get(previousWeek) ?? 0;
    let best = 0;
    let bestWeekStart: string | null = null;
    for (const [w, v] of weeks) {
      if (w >= currentWeek) continue;
      if (v > best) {
        best = v;
        bestWeekStart = w;
      }
    }
    return {
      key: m.key,
      label: m.label,
      unit: m.unit,
      thisWeek,
      lastWeek,
      deltaPct: lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null,
      best,
      bestWeekStart,
      // Precisa existir histórico: a primeira semana de uso não vira "recorde".
      newRecord: bestWeekStart !== null && thisWeek > best,
    };
  });
}

export async function getWeeklyRecords(db: Client, ownerId: string) {
  const [today, tz] = await Promise.all([todayKeyFor(db, ownerId), userTimezone(db, ownerId)]);
  const currentWeek = weekStartOf(today);
  const from = addDays(currentWeek, -7 * HISTORY_WEEKS);
  // Fonte única com o Quadro de Quests: agregação diária no fuso do usuário.
  const daily = await collectDailyMetrics(db, ownerId, { from, to: today, tz, metrics: RECORD_METRICS.map((m) => m.key) });

  const byWeek = Object.fromEntries(RECORD_METRICS.map((m) => [m.key, new Map<string, number>()])) as Record<RecordMetric, Map<string, number>>;
  for (const m of RECORD_METRICS) {
    for (const [day, v] of daily[m.key]) {
      const w = weekStartOf(day);
      byWeek[m.key].set(w, (byWeek[m.key].get(w) ?? 0) + v);
    }
  }

  const rows = buildRecords(byWeek, currentWeek);
  return {
    weekStart: currentWeek,
    weekEnd: addDays(currentWeek, 6),
    today,
    /** Dias já passados nesta semana (1 = segunda): a semana atual ainda está em andamento. */
    daysElapsed: Math.round((new Date(`${today}T12:00:00Z`).getTime() - new Date(`${currentWeek}T12:00:00Z`).getTime()) / 86_400_000) + 1,
    records: rows,
    newRecords: rows.filter((r) => r.newRecord).length,
  };
}
