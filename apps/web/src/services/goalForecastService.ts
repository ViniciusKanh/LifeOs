import { api } from "./api";
import type { GoalForecastDashboard, GoalForecastPeriodFilter } from "@/types";

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export const goalForecastService = {
  dashboard: (period: GoalForecastPeriodFilter) =>
    api.get<GoalForecastDashboard>(`/goal-forecast?period=${period}&today=${localToday()}`),
};
