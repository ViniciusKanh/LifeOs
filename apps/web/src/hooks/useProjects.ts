import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  projectsService,
  taskDependenciesService,
  type ProjectCreateInput,
  type ProjectUpdateInput,
} from "@/services/projectsService";

import { localIsoDate } from "@/utils/dashboardMetrics";
import type { ProjectKind } from "@/types";
import { notifyGamification } from "@/services/gamificationService";

const PROJECTS_KEY = ["projects"];

export function useProjects(includeArchived = false) {
  const queryClient = useQueryClient();
  const key = [...PROJECTS_KEY, includeArchived];

  const query = useQuery({ queryKey: key, queryFn: () => projectsService.list(includeArchived) });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
    // Mudar o "kind" de um projeto (ex.: flegar como Profissional) muda
    // quais tarefas contam na dimensão Profissional do Life Score.
    queryClient.invalidateQueries({ queryKey: ["analytics"] });
    queryClient.invalidateQueries({ queryKey: ["direction"] });
  };

  const createProject = useMutation({ mutationFn: (input: ProjectCreateInput) => projectsService.create(input), onSuccess: invalidate });
  const updateProject = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ProjectUpdateInput }) => projectsService.update(id, patch),
    onSuccess: (_data, vars) => {
      invalidate();
      // Projeto concluído rende XP/moedas uma única vez no backend.
      if (vars.patch.status === "completed") notifyGamification();
    },
  });
  const removeProject = useMutation({ mutationFn: (id: string) => projectsService.remove(id), onSuccess: invalidate });

  return {
    projects: query.data ?? [],
    isLoading: query.isLoading,
    createProject: createProject.mutateAsync,
    updateProject: updateProject.mutateAsync,
    removeProject: removeProject.mutateAsync,
  };
}

export function useGantt(projectId: string | undefined) {
  const queryClient = useQueryClient();
  const key = ["projects", "gantt", projectId];

  const query = useQuery({
    queryKey: key,
    queryFn: () => projectsService.gantt(projectId as string),
    enabled: !!projectId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const addDependency = useMutation({
    mutationFn: ({ taskId, dependsOnId }: { taskId: string; dependsOnId: string }) => taskDependenciesService.add(taskId, dependsOnId),
    onSuccess: invalidate,
  });
  const removeDependency = useMutation({
    mutationFn: ({ taskId, dependsOnId }: { taskId: string; dependsOnId: string }) => taskDependenciesService.remove(taskId, dependsOnId),
    onSuccess: invalidate,
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    addDependency: addDependency.mutateAsync,
    removeDependency: removeDependency.mutateAsync,
  };
}

/** Previsão matemática (não-IA) de conclusão do projeto, calculada a partir do ritmo real de tarefas concluídas. */
export function useProjectForecast(projectId: string | undefined) {
  const query = useQuery({
    queryKey: ["projects", "forecast", projectId],
    queryFn: () => projectsService.forecast(projectId as string),
    enabled: !!projectId,
  });

  return { forecast: query.data?.forecast ?? null, reason: query.data?.reason ?? null, isLoading: query.isLoading };
}

/**
 * Detalhe do projeto: metadados + indicadores + tarefas + documentos.
 * Tudo vem do backend já filtrado pelo dono autenticado.
 */
export function useProjectDetail(projectId: string | undefined) {
  const enabled = !!projectId;
  const project = useQuery({ queryKey: ["projects", "detail", projectId], queryFn: () => projectsService.get(projectId as string), enabled });
  const overview = useQuery({ queryKey: ["projects", "overview", projectId], queryFn: () => projectsService.overview(projectId as string), enabled });
  const tasks = useQuery({ queryKey: ["projects", "tasks", projectId], queryFn: () => projectsService.tasks(projectId as string), enabled });
  const documents = useQuery({ queryKey: ["projects", "documents", projectId], queryFn: () => projectsService.documents(projectId as string), enabled });

  return {
    project: project.data ?? null,
    isLoading: project.isLoading,
    error: project.error as Error | null,
    overview: overview.data ?? null,
    isOverviewLoading: overview.isLoading,
    tasks: tasks.data ?? [],
    isTasksLoading: tasks.isLoading,
    documents: documents.data ?? [],
    isDocumentsLoading: documents.isLoading,
  };
}

/**
 * Carga por projeto. A chave fica sob ["projects"] para ser revalidada
 * junto com qualquer mudança de tarefa/projeto (useTasks já invalida "projects").
 */
export function useProjectWorkload(options: { days?: number; kind?: ProjectKind } = {}) {
  const today = localIsoDate();
  const days = options.days ?? 30;
  const query = useQuery({
    queryKey: [...PROJECTS_KEY, "workload", today, days, options.kind ?? "all"],
    queryFn: () => projectsService.workload({ today, days, kind: options.kind }),
  });
  return { workload: query.data ?? null, isLoading: query.isLoading, isError: query.isError };
}
