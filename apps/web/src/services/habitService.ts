import { api } from "./api";
import type { Habit, HabitStats, HabitSummary, HabitTaskGenerationInput, HabitTaskGenerationResult } from "@/types";

/** Fontes de marcação automática (registro real de outro módulo). */
export type HabitAutoSource = "workout" | "reading" | "water" | "journal" | "tasks" | "flashcards";

export interface HabitAutoSourceInfo {
  key: HabitAutoSource;
  label: string;
  unit: string | null;
  thresholdLabel: string | null;
  available: boolean;
}

/** Colunas de hábitos automáticos/encadeados (0073) — ficam aqui para não mexer no tipo base compartilhado. */
export interface HabitAutoFields {
  auto_source?: HabitAutoSource | null;
  auto_threshold?: number | null;
  after_habit_id?: string | null;
}
export type HabitWithAuto = Habit & HabitAutoFields;

export interface HabitAutoInput {
  autoSource?: HabitAutoSource | null;
  autoThreshold?: number | null;
  afterHabitId?: string | null;
}

export const habitService = {
  list: () => api.get<HabitWithAuto[]>("/habits"),
  create: (input: { name: string; icon?: string; category?: string; frequency?: Habit["frequency"]; targetCount?: number } & HabitAutoInput) =>
    api.post<HabitWithAuto>("/habits", input),
  update: (
    id: string,
    patch: { name?: string; icon?: string | null; category?: string | null; frequency?: Habit["frequency"]; targetCount?: number } & HabitAutoInput
  ) => api.patch<HabitWithAuto>(`/habits/${id}`, patch),
  autoSources: () => api.get<HabitAutoSourceInfo[]>("/habits/auto-sources"),
  remove: (id: string) => api.delete<void>(`/habits/${id}`),
  checkIn: (id: string, entryDate: string, count = 1) =>
    api.post<void>(`/habits/${id}/check-in`, { entryDate, count }),
  entries: (id: string, from?: string, to?: string) => {
    const qs = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();
    return api.get<Array<{ entry_date: string; count: number }>>(`/habits/${id}/entries${qs ? `?${qs}` : ""}`);
  },
  summary: () => api.get<HabitSummary[]>("/habits/summary"),
  stats: (days = 30) => api.get<HabitStats>(`/habits/stats?days=${days}`),
  /** Gerador parametrizável: período, hábitos, carga, prioridade, status e projeto (idempotente por hábito/dia). */
  generateTasks: (input: HabitTaskGenerationInput) => api.post<HabitTaskGenerationResult>("/habits/generate-tasks", input),
};
