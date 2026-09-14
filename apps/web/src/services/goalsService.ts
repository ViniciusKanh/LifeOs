import { api } from "./api";
import type { Goal, GoalDetail, GoalForecast, GoalKind, GoalPeriod, GoalStats, GoalStatus } from "@/types";

export interface GoalCreateInput {
  parentGoalId?: string | null;
  title: string;
  description?: string;
  category?: string;
  kind?: GoalKind;
  targetValue?: number;
  unit?: string;
  dueDate?: string;
  period?: GoalPeriod;
  nextAction?: string;
  nextActionDue?: string;
}

export interface GoalUpdateInput extends Omit<Partial<GoalCreateInput>, "nextAction" | "nextActionDue"> {
  status?: GoalStatus;
  currentValue?: number;
  nextAction?: string | null;
  nextActionDue?: string | null;
}

export const goalsService = {
  list: (params?: { status?: string; parentGoalId?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return api.get<Goal[]>(`/goals${qs ? `?${qs}` : ""}`);
  },
  get: (id: string) => api.get<GoalDetail>(`/goals/${id}`),
  create: (input: GoalCreateInput) => api.post<Goal>("/goals", input),
  update: (id: string, patch: GoalUpdateInput) => api.patch<Goal>(`/goals/${id}`, patch),
  remove: (id: string) => api.delete<void>(`/goals/${id}`),
  addProgress: (id: string, value: number, note?: string) => api.post<Goal>(`/goals/${id}/progress`, { value, note }),
  stats: () => api.get<GoalStats>("/goals/stats"),
  forecast: (id: string) => api.get<GoalForecast>(`/goals/${id}/forecast`),
};
