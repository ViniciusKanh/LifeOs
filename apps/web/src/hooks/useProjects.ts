import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  projectsService,
  taskDependenciesService,
  type ProjectCreateInput,
  type ProjectUpdateInput,
} from "@/services/projectsService";

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
  };

  const createProject = useMutation({ mutationFn: (input: ProjectCreateInput) => projectsService.create(input), onSuccess: invalidate });
  const updateProject = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ProjectUpdateInput }) => projectsService.update(id, patch),
    onSuccess: invalidate,
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
