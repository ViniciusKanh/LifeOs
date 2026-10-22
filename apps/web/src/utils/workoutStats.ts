import type { Workout, WorkoutCategory } from "@/types";
import { localDateKey, parseUtcTimestamp } from "./localDate";

/**
 * Regras de exercício do front (resumo semanal, pace, inferência de tipo
 * para registros antigos). Fica fora dos componentes para ser reutilizável
 * e testável — a tela só exibe o resultado.
 */

/** Espelha inferWorkoutCategory da API para registros antigos (sem `category`). */
export function workoutCategoryOf(workout: Pick<Workout, "kind" | "category">): WorkoutCategory {
  if (workout.category) return workout.category;
  const k = workout.kind.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const rules: Array<[WorkoutCategory, RegExp]> = [
    ["musculacao", /muscula|academia|gym|peso|forca/],
    ["luta", /luta|muay|jiu|boxe|box|mma|judo|karate|kick|wrestling/],
    ["corrida", /corrid|run/],
    ["caminhada", /caminhad|walk/],
    ["bike", /bike|cicl|pedal|bicicleta|spinning/],
    ["natacao", /nata|swim/],
    ["crossfit", /crossfit/],
    ["funcional", /funcional/],
    ["hiit", /hiit/],
    ["pilates", /pilates/],
    ["yoga", /yoga|ioga/],
    ["alongamento", /along|stretch/],
    ["esporte_coletivo", /futebol|volei|basquete|handebol|esporte|futsal/],
  ];
  return rules.find(([, re]) => re.test(k))?.[0] ?? "outro";
}

/** Pace em minutos por km (null sem distância/duração válidas). */
export function paceMinPerKm(durationMinutes: number | null | undefined, distanceKm: number | null | undefined): number | null {
  if (!durationMinutes || !distanceKm || distanceKm <= 0 || durationMinutes <= 0) return null;
  return durationMinutes / distanceKm;
}

/** 5.5 → "5:30 /km". */
export function formatPace(pace: number | null): string | null {
  if (pace === null || !Number.isFinite(pace)) return null;
  let minutes = Math.floor(pace);
  let seconds = Math.round((pace - minutes) * 60);
  if (seconds === 60) {
    minutes += 1;
    seconds = 0;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")} /km`;
}

/** Volume de um treino de musculação (séries × reps × carga), em kg. */
export function strengthVolumeKg(workout: Pick<Workout, "sets">): number {
  return (workout.sets ?? []).reduce((sum, s) => sum + (s.sets ?? 0) * (s.reps ?? 0) * (s.load_kg ?? 0), 0);
}

export interface WeeklyWorkoutSummary {
  sessions: number;
  minutes: number;
  activeDays: number;
  /** Média de RPE só entre treinos que informaram esforço (null se nenhum). */
  avgRpe: number | null;
  byCategory: Array<{ category: WorkoutCategory; minutes: number; sessions: number }>;
}

/** Resumo da semana [weekStart, weekStart + 7 dias) no fuso local, a partir dos registros reais. */
export function weeklyWorkoutSummary(workouts: Workout[], weekStart: Date): WeeklyWorkoutSummary {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  const days = new Set<string>();
  const byCategory = new Map<WorkoutCategory, { minutes: number; sessions: number }>();
  let minutes = 0;
  let sessions = 0;
  const rpes: number[] = [];

  for (const w of workouts) {
    const at = parseUtcTimestamp(w.performed_at);
    if (at < weekStart || at >= weekEnd) continue;
    sessions += 1;
    minutes += w.duration_minutes ?? 0;
    days.add(localDateKey(at));
    if (w.rpe) rpes.push(w.rpe);
    const category = workoutCategoryOf(w);
    const current = byCategory.get(category) ?? { minutes: 0, sessions: 0 };
    current.minutes += w.duration_minutes ?? 0;
    current.sessions += 1;
    byCategory.set(category, current);
  }

  return {
    sessions,
    minutes,
    activeDays: days.size,
    avgRpe: rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null,
    byCategory: [...byCategory.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.minutes - a.minutes || b.sessions - a.sessions),
  };
}

/** Ordena do mais recente para o mais antigo comparando o instante real (formatos mistos no banco). */
export function sortWorkoutsDesc(workouts: Workout[]): Workout[] {
  return [...workouts].sort((a, b) => parseUtcTimestamp(b.performed_at).getTime() - parseUtcTimestamp(a.performed_at).getTime());
}
