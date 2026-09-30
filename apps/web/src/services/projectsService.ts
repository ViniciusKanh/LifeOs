import { api } from "./api";
import type { GanttData, Project, ProjectDocument, ProjectForecast, ProjectKind, ProjectLink, ProjectOverview, ProjectPriority, ProjectStatus, Task } from "@/types";

/** Campos do cadastro completo — os mesmos na criação e na edição. */
export interface ProjectDetailsInput {
  description?: string | null;
  color?: string | null;
  status?: ProjectStatus;
  priority?: ProjectPriority | null;
  startDate?: string | null;
  dueDate?: string | null;
  objective?: string | null;
  scope?: string | null;
  successCriteria?: string | null;
  client?: string | null;
  area?: string | null;
  budget?: number | null;
  repositoryUrl?: string | null;
  links?: ProjectLink[];
  tags?: string[];
}

export interface ProjectCreateInput extends ProjectDetailsInput {
  name: string;
  kind?: ProjectKind;
  parentId?: string | null;
}

export interface ProjectUpdateInput extends ProjectDetailsInput {
  name?: string;
  // Flegar um projeto já existente como profissional/workspace (ou
  // reverter) — muda quais tarefas contam na dimensão Profissional do
  // Life Score, sem precisar recriar o projeto do zero.
  kind?: ProjectKind;
  color?: string | null;
  archived?: boolean;
}

export const projectsService = {
  list: (includeArchived = false) => api.get<Project[]>(`/projects${includeArchived ? "?includeArchived=true" : ""}`),
  create: (input: ProjectCreateInput) => api.post<Project>("/projects", input),
  update: (id: string, patch: ProjectUpdateInput) => api.patch<Project>(`/projects/${id}`, patch),
  remove: (id: string) => api.delete<void>(`/projects/${id}`),
  gantt: (id: string) => api.get<GanttData>(`/projects/${id}/gantt`),
  forecast: (id: string) => api.get<ProjectForecast>(`/projects/${id}/forecast`),
  get: (id: string) => api.get<Project>(`/projects/${id}`),
  overview: (id: string) => api.get<ProjectOverview>(`/projects/${id}/overview`),
  tasks: (id: string) => api.get<Array<Task & { attachment_count: number }>>(`/projects/${id}/tasks`),
  documents: (id: string) => api.get<ProjectDocument[]>(`/projects/${id}/documents`),
};

export const taskDependenciesService = {
  list: (taskId: string) => api.get<string[]>(`/tasks/${taskId}/dependencies`),
  add: (taskId: string, dependsOnId: string) => api.post<{ ok: boolean }>(`/tasks/${taskId}/dependencies`, { dependsOnId }),
  remove: (taskId: string, dependsOnId: string) => api.delete<void>(`/tasks/${taskId}/dependencies/${dependsOnId}`),
};
