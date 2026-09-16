import { api } from "./api";
import type { WaterEntry, SleepEntry, Workout, MoodEntry, HealthSummary, HealthCorrelation } from "@/types";

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

export interface WorkoutInput {
  kind: string;
  durationMinutes: number;
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

export const healthService = {
  summary: (date?: string) => api.get<HealthSummary>(`/health/summary${date ? `?date=${date}` : ""}`),
  correlations: () => api.get<HealthCorrelation[]>("/health/correlations"),

  listWater: (date?: string) => api.get<WaterEntry[]>(`/health/water${date ? `?date=${date}` : ""}`),
  addWater: (input: number | WaterEntryInput) =>
    api.post<WaterEntry>("/health/water", typeof input === "number" ? { amountMl: input } : input),
  updateWater: (id: string, patch: Partial<WaterEntryInput>) => api.patch<WaterEntry>(`/health/water/${id}`, patch),
  removeWater: (id: string) => api.delete<void>(`/health/water/${id}`),

  listSleep: (limit = 30) => api.get<SleepEntry[]>(`/health/sleep?limit=${limit}`),
  addSleep: (input: SleepEntryInput) => api.post<SleepEntry>("/health/sleep", input),
  updateSleep: (id: string, patch: Partial<SleepEntryInput>) => api.patch<SleepEntry>(`/health/sleep/${id}`, patch),
  removeSleep: (id: string) => api.delete<void>(`/health/sleep/${id}`),

  listWorkouts: (limit = 30) => api.get<Workout[]>(`/health/workouts?limit=${limit}`),
  addWorkout: (input: WorkoutInput) => api.post<Workout>("/health/workouts", input),
  updateWorkout: (id: string, patch: Partial<WorkoutInput>) => api.patch<Workout>(`/health/workouts/${id}`, patch),
  removeWorkout: (id: string) => api.delete<void>(`/health/workouts/${id}`),

  listMood: (limit = 30) => api.get<MoodEntry[]>(`/health/mood?limit=${limit}`),
  addMood: (input: MoodEntryInput) => api.post<MoodEntry>("/health/mood", input),
  updateMood: (id: string, patch: Partial<MoodEntryInput>) => api.patch<MoodEntry>(`/health/mood/${id}`, patch),
  removeMood: (id: string) => api.delete<void>(`/health/mood/${id}`),
};
