import { api } from "./api";

export interface InboxItem {
  id: string;
  owner_id: string;
  content: string;
  processed_at: string | null;
  created_at: string;
}

export interface ProcessInboxInput {
  action: "task" | "discard";
  title?: string;
  projectId?: string | null;
  priority?: "Baixa" | "Média" | "Alta";
  dueDate?: string | null;
}

export interface InboxStats {
  pending: number;
  processedLast7d: number;
  capturedLast7d: number;
}

export const inboxService = {
  list: (includeProcessed = false, limit = includeProcessed ? 200 : 100) =>
    api.get<InboxItem[]>(`/inbox?includeProcessed=${includeProcessed}&limit=${limit}`),
  stats: () => api.get<InboxStats>("/inbox/stats"),
  create: (content: string) => api.post<InboxItem>("/inbox", { content }),
  process: (id: string, input: ProcessInboxInput) => api.patch<{ processed: boolean; taskId: string | null }>(`/inbox/${id}/process`, input),
  remove: (id: string) => api.delete<void>(`/inbox/${id}`),
};
