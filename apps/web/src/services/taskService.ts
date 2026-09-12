import { api } from "./api";
import type { Task } from "@/types";

export const taskService = {
  list: () => api.get<Task[]>("/tasks"),
  create: (input: { title: string; status?: string; priority?: Task["priority"]; projectId?: string }) =>
    api.post<Task>("/tasks", input),
  move: (id: string, status: string) => api.patch<void>(`/tasks/${id}/move`, { status }),
  update: (id: string, patch: Partial<Task>) => api.patch<Task>(`/tasks/${id}`, patch),
  remove: (id: string) => api.delete<void>(`/tasks/${id}`),
};
