import { api } from "./api";
import type { DeadlinePeriodFilter, DeadlineRadarDashboard } from "@/types";

function localToday(): string {
  // Data local do navegador (evita "vence hoje" virar "amanhã" por UTC).
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export const deadlineRadarService = {
  dashboard: (period: DeadlinePeriodFilter) =>
    api.get<DeadlineRadarDashboard>(`/deadline-radar?period=${period}&today=${localToday()}`),
};
