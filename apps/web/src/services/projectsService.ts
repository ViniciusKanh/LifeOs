import { api } from "./api";
import type { GanttData, Project, ProjectForecast, ProjectKind } from "@/types";

export interface ProjectCreateInput {
  name: string;
  description?: string | null;
  kind?: ProjectKind;
  color?: string | null;
  parentId?: string | null;
}

export interface ProjectUpdateInput {
  name?: string;
  description?: string | null;
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
};

export const taskDependenciesService = {
  list: (taskId: string) => api.get<string[]>(`/tasks/${taskId}/dependencies`),
  add: (taskId: string, dependsOnId: string) => api.post<{ ok: boolean }>(`/tasks/${taskId}/dependencies`, { dependsOnId }),
  remove: (taskId: string, dependsOnId: string) => api.delete<void>(`/tasks/${taskId}/dependencies/${dependsOnId}`),
};
