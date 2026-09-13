import { api } from "./api";
import type { FocusSession, FocusSummary } from "@/types";

export const focusService = {
  list: (limit = 30) => api.get<FocusSession[]>(`/focus/sessions?limit=${limit}`),
  active: () => api.get<FocusSession | null>("/focus/sessions/active"),
  start: (input: { taskId?: string | null; projectId?: string | null; mode?: "pomodoro" | "free_timer"; plannedMinutes?: number }) =>
    api.post<FocusSession>("/focus/sessions/start", input),
  stop: (id: string, input: { perceivedProductivity?: number; distractions?: number; notes?: string }) =>
    api.patch<FocusSession>(`/focus/sessions/${id}/stop`, input),
  remove: (id: string) => api.delete<void>(`/focus/sessions/${id}`),
  summary: () => api.get<FocusSummary>("/focus/summary"),
};
