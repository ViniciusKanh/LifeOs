import { api } from "./api";
import type { WaterEntry, SleepEntry, Workout, MoodEntry, HealthSummary, HealthCorrelation, WorkoutCategory, FightModality } from "@/types";
import { browserTzOffset } from "@/utils/localDate";

export interface WaterEntryInput {
  amountMl: number;
  recordedAt?: string;
}

export interface SleepEntryInput {
  wentToBedAt: string;
  wokeUpAt: string;
  quality?: number | null;
  notes?: string | null;
}

export interface WorkoutSetInput {
  exercise: string;
  sets?: number | null;
  reps?: number | null;
  loadKg?: number | null;
}

export interface WorkoutInput {
  /** Tipo estável; a API grava o rótulo em `kind` para compatibilidade. */
  category: WorkoutCategory;
  kind?: string;
  durationMinutes: number;
  modality?: FightModality | null;
  rpe?: number | null;
  muscleGroups?: string | null;
  rounds?: number | null;
  roundMinutes?: number | null;
  sets?: WorkoutSetInput[];
  distanceKm?: number | null;
  calories?: number | null;
  intensity?: "leve" | "moderada" | "intensa" | null;
  notes?: string | null;
  performedAt?: string;
}

export interface MoodEntryInput {
  mood: number;
  energy: number;
  stress?: number | null;
  note?: string | null;
  recordedAt?: string;
}

/** Monta "?date=...&tz=..." — tz e o offset de Date.prototype.getTimezoneOffset()
 * de quem esta usando o app, pra o backend filtrar "hoje"/"o dia X" no fuso
 * certo em vez do fuso do servidor (ver localDayBoundsUtc no health.routes.ts). */
function dateQuery(date?: string, tzOffsetMinutes?: number) {
  if (!date) return "";
  const tz = tzOffsetMinutes ?? browserTzOffset();
  return `?date=${date}&tz=${tz}`;
}

export const healthService = {
  summary: (date?: string, tzOffsetMinutes?: number) => api.get<HealthSummary>(`/health/summary${dateQuery(date, tzOffsetMinutes)}`),
  correlations: () => api.get<HealthCorrelation[]>("/health/correlations"),

  listWater: (date?: string, tzOffsetMinutes?: number) => api.get<WaterEntry[]>(`/health/water${dateQuery(date, tzOffsetMinutes)}`),
  addWater: (input: number | WaterEntryInput) =>
    api.post<WaterEntry>("/health/water", typeof input === "number" ? { amountMl: input } : input),
  updateWater: (id: string, patch: Partial<WaterEntryInput>) => api.patch<WaterEntry>(`/health/water/${id}`, patch),
  removeWater: (id: string) => api.delete<void>(`/health/water/${id}`),

  listSleep: (limit = 30) => api.get<SleepEntry[]>(`/health/sleep?limit=${limit}`),
  addSleep: (input: SleepEntryInput) => api.post<SleepEntry>("/health/sleep", input),
  updateSleep: (id: string, patch: Partial<SleepEntryInput>) => api.patch<SleepEntry>(`/health/sleep/${id}`, patch),
  removeSleep: (id: string) => api.delete<void>(`/health/sleep/${id}`),

  listWorkouts: (limit = 60) => api.get<Workout[]>(`/health/workouts?limit=${limit}`),
  addWorkout: (input: WorkoutInput) => api.post<Workout>("/health/workouts", input),
  updateWorkout: (id: string, patch: Partial<WorkoutInput>) => api.patch<Workout>(`/health/workouts/${id}`, patch),
  removeWorkout: (id: string) => api.delete<void>(`/health/workouts/${id}`),

  listMood: (limit = 30) => api.get<MoodEntry[]>(`/health/mood?limit=${limit}`),
  addMood: (input: MoodEntryInput) => api.post<MoodEntry>("/health/mood", input),
  updateMood: (id: string, patch: Partial<MoodEntryInput>) => api.patch<MoodEntry>(`/health/mood/${id}`, patch),
  removeMood: (id: string) => api.delete<void>(`/health/mood/${id}`),
};
