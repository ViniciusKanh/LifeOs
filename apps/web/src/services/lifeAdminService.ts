import { api } from "./api";
import type { LifeAdminCategory, LifeAdminDetail, LifeAdminItem, LifeAdminKind, LifeAdminSummary } from "@/types";

export interface LifeAdminInput {
  kind: LifeAdminKind;
  title: string;
  category: LifeAdminCategory;
  dueDate?: string | null;
  recurrenceMonths?: number | null;
  remindDaysBefore?: number;
  amount?: number | null;
  reference?: string | null;
  location?: string | null;
  notes?: string | null;
  /** null remove o arquivo; ausente mantém. */
  fileDataUri?: string | null;
  fileName?: string | null;
  status?: "active" | "archived";
}

export const lifeAdminService = {
  list: (includeArchived = false) => api.get<LifeAdminItem[]>(`/life-admin${includeArchived ? "?includeArchived=true" : ""}`),
  summary: () => api.get<LifeAdminSummary>("/life-admin/summary"),
  get: (id: string) => api.get<LifeAdminDetail>(`/life-admin/${id}`),
  file: (id: string) => api.get<{ dataUri: string; fileName: string | null; mime: string | null }>(`/life-admin/${id}/file`),
  create: (input: LifeAdminInput) => api.post<LifeAdminDetail>("/life-admin", input),
  update: (id: string, patch: Partial<LifeAdminInput>) => api.patch<LifeAdminDetail>(`/life-admin/${id}`, patch),
  remove: (id: string) => api.delete<void>(`/life-admin/${id}`),
  markDone: (id: string, input: { doneAt?: string; amount?: number | null; note?: string | null; nextDueDate?: string | null }) =>
    api.post<LifeAdminDetail>(`/life-admin/${id}/done`, input),
  removeHistory: (id: string, historyId: string) => api.delete<LifeAdminDetail>(`/life-admin/${id}/history/${historyId}`),
};
