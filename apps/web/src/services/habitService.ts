import { api } from "./api";
import type { Habit, HabitStats, HabitSummary } from "@/types";

export const habitService = {
  list: () => api.get<Habit[]>("/habits"),
  create: (input: { name: string; icon?: string; category?: string; frequency?: Habit["frequency"]; targetCount?: number }) =>
    api.post<Habit>("/habits", input),
  update: (
    id: string,
    patch: { name?: string; icon?: string | null; category?: string | null; frequency?: Habit["frequency"]; targetCount?: number }
  ) => api.patch<Habit>(`/habits/${id}`, patch),
  remove: (id: string) => api.delete<void>(`/habits/${id}`),
  checkIn: (id: string, entryDate: string, count = 1) =>
    api.post<void>(`/habits/${id}/check-in`, { entryDate, count }),
  entries: (id: string, from?: string, to?: string) => {
    const qs = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();
    return api.get<Array<{ entry_date: string; count: number }>>(`/habits/${id}/entries${qs ? `?${qs}` : ""}`);
  },
  summary: () => api.get<HabitSummary[]>("/habits/summary"),
  stats: (days = 30) => api.get<HabitStats>(`/habits/stats?days=${days}`),
};
