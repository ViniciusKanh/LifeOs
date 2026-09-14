import { api } from "./api";

export interface WorkNote {
  id: string;
  owner_id: string;
  title: string;
  content: string | null;
  occurred_at: string;
  created_at: string;
}

export interface WorkNoteInput {
  title: string;
  content?: string | null;
  occurredAt: string;
}

export const workNotesService = {
  list: (limit = 30) => api.get<WorkNote[]>(`/work-notes?limit=${limit}`),
  create: (input: WorkNoteInput) => api.post<WorkNote>("/work-notes", input),
  remove: (id: string) => api.delete<void>(`/work-notes/${id}`),
};
