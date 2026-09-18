import { api } from "./api";
import type {
  CapacityDayDashboard,
  CapacityPlanningSuggestion,
  EffortType,
} from "@/types";

export const capacityService = {
  day: (date: string) => api.get<CapacityDayDashboard>(`/capacity/day?date=${date}`),
  planPreview: (date: string) => api.get<CapacityPlanningSuggestion>(`/capacity/plan/preview?date=${date}`),
  planApply: (date: string, blocks: { taskId: string; startTime: string; endTime: string; blockType: EffortType }[]) =>
    api.post<{ applied: number }>("/capacity/plan/apply", { date, blocks }),
  createBlock: (payload: {
    date: string;
    startTime: string;
    endTime: string;
    entityType: "task" | "free_block";
    entityId?: string | null;
    title?: string | null;
    blockType?: EffortType;
  }) => api.post<{ id: string }>("/capacity/blocks", payload),
  updateBlock: (id: string, payload: { startTime?: string; endTime?: string }) =>
    api.patch<{ ok: true }>(`/capacity/blocks/${id}`, payload),
  deleteBlock: (id: string) => api.delete<void>(`/capacity/blocks/${id}`),
};
