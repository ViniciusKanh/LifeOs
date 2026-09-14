import { api } from "./api";
import type { FocusTask, Task, TimeEntry } from "@/types";

export interface TaskInput {
  title: string;
  description?: string | null;
  status?: string;
  priority?: Task["priority"];
  projectId?: string | null;
  dueDate?: string | null;
  startDate?: string | null;
  estimateMinutes?: number | null;
}

export const taskService = {
  list: () => api.get<Task[]>("/tasks"),
  // Usado pelo Kanban de projetos acadêmicos (Educação): tarefas de
  // um único projeto (academic_projects.project_id), sem afetar a
  // listagem geral de Tarefas.
  listByProject: (projectId: string) => api.get<Task[]>(`/tasks?projectId=${encodeURIComponent(projectId)}`),
  create: (input: TaskInput) => api.post<Task>("/tasks", input),
  move: (id: string, status: string) => api.patch<void>(`/tasks/${id}/move`, { status }),
  update: (id: string, patch: Partial<TaskInput>) => api.patch<Task>(`/tasks/${id}`, patch),
  remove: (id: string) => api.delete<void>(`/tasks/${id}`),

  // Priorização automática ("Foque nisso agora"): top-N tarefas em
  // aberto ordenadas pelo score de foco (prazo + prioridade +
  // impacto/urgência/esforço + dependências), calculado no backend.
  focusList: (limit = 5) => api.get<{ tasks: FocusTask[] }>(`/tasks/focus?limit=${limit}`),

  activeTimeEntry: (id: string) => api.get<TimeEntry | null>(`/tasks/${id}/time/active`),
  startTime: (id: string) => api.post<TimeEntry>(`/tasks/${id}/time/start`),
  stopTime: (id: string) => api.patch<Task>(`/tasks/${id}/time/stop`),
};
