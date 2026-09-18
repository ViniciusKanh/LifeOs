import { api } from "./api";
import type { DataHealthSummary } from "@/types";

export const dataHealthService = {
  get: () => api.get<DataHealthSummary>("/data-health"),
  recheck: () => api.post<DataHealthSummary>("/data-health/recheck", {}),
};
