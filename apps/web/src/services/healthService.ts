import { api } from "./api";
import type { WaterEntry, SleepEntry, Workout, MoodEntry, HealthSummary } from "@/types";

export const healthService = {
  summary: (date?: string) => api.get<HealthSummary>(`/health/summary${date ? `?date=${date}` : ""}`),

  listWater: (date?: string) => api.get<WaterEntry[]>(`/health/water${date ? `?date=${date}` : ""}`),
  addWater: (amountMl: number) => api.post<WaterEntry>("/health/water", { amountMl }),
  removeWater: (id: string) => api.delete<void>(`/health/water/${id}`),

  listSleep: (limit = 30) => api.get<SleepEntry[]>(`/health/sleep?limit=${limit}`),
  addSleep: (input: { wentToBedAt: string; wokeUpAt: string; quality?: number; notes?: string }) =>
    api.post<SleepEntry>("/health/sleep", input),
  removeSleep: (id: string) => api.delete<void>(`/health/sleep/${id}`),

  listWorkouts: (limit = 30) => api.get<Workout[]>(`/health/workouts?limit=${limit}`),
  addWorkout: (input: {
    kind: string;
    durationMinutes?: number;
    distanceKm?: number;
    calories?: number;
    intensity?: "leve" | "moderada" | "intensa";
    notes?: string;
  }) => api.post<Workout>("/health/workouts", input),
  removeWorkout: (id: string) => api.delete<void>(`/health/workouts/${id}`),

  listMood: (limit = 30) => api.get<MoodEntry[]>(`/health/mood?limit=${limit}`),
  addMood: (input: { mood: number; energy: number; stress?: number; note?: string }) =>
    api.post<MoodEntry>("/health/mood", input),
};
