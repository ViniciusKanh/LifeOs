import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { taskService, type TaskInput } from "@/services/taskService";
import { triggerAchievementsCheck } from "@/services/achievementsService";
import type { Task } from "@/types";

const TASKS_KEY = ["tasks"];

export function useTasks() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: TASKS_KEY });
    // Concluir/mover/criar tarefa muda Produtividade e (se vinculada a
    // projeto profissional) a dimensão Profissional do Life Score —
    // sem isso, o Dashboard só atualizava esses números depois de um
    // reload manual da página.
    queryClient.invalidateQueries({ queryKey: ["analytics"] });
  };

  const tasksQuery = useQuery({ queryKey: TASKS_KEY, queryFn: taskService.list });

  const createTask = useMutation({
    mutationFn: (input: TaskInput) => taskService.create(input),
    onSuccess: invalidate,
  });

  const updateTask = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<TaskInput> }) => taskService.update(id, patch),
    onSuccess: (_data, variables) => {
      invalidate();
      // Concluir uma tarefa é o gatilho mais comum de conquista (ex.: "Produtivo", "Máquina de produtividade").
      if (variables.patch.status === "Concluído") triggerAchievementsCheck();
    },
  });

  const removeTask = useMutation({
    mutationFn: taskService.remove,
    onSuccess: invalidate,
  });

  // Atualização otimista: o card já muda de coluna no Kanban antes
  // da resposta do servidor voltar, e é revertido se a chamada falhar.
  const moveTask = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => taskService.move(id, status),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: TASKS_KEY });
      const previous = queryClient.getQueryData<Task[]>(TASKS_KEY);
      queryClient.setQueryData<Task[]>(TASKS_KEY, (old) =>
        old?.map((t) => (t.id === id ? { ...t, status } : t))
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(TASKS_KEY, context.previous);
    },
    onSettled: (_data, _error, variables) => {
      invalidate();
      if (variables.status === "Concluído") triggerAchievementsCheck();
    },
  });

  return {
    tasks: tasksQuery.data ?? [],
    isLoading: tasksQuery.isLoading,
    createTask: createTask.mutateAsync,
    updateTask: updateTask.mutateAsync,
    removeTask: removeTask.mutateAsync,
    moveTask: moveTask.mutate,
  };
}

/**
 * Tarefas de um único projeto — usado pelo Kanban de projetos
 * acadêmicos (TCC/dissertação/tese) em Educação. Reaproveita o mesmo
 * endpoint e as mesmas mutations de tarefa, apenas filtrando por
 * projectId, para não duplicar a lógica de criação/edição/drag.
 */
export function useProjectTasks(projectId: string | null) {
  const queryClient = useQueryClient();
  const key = ["tasks", "by-project", projectId];
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: TASKS_KEY });
    // Idem useTasks: o Kanban de projetos (Profissional/Workspace/
    // Acadêmico) também precisa refletir na hora no Life Score.
    queryClient.invalidateQueries({ queryKey: ["analytics"] });
  };

  const tasksQuery = useQuery({
    queryKey: key,
    queryFn: () => taskService.listByProject(projectId as string),
    enabled: !!projectId,
  });

  const createTask = useMutation({
    mutationFn: (input: TaskInput) => taskService.create({ ...input, projectId }),
    onSuccess: invalidate,
  });

  const updateTask = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<TaskInput> }) => taskService.update(id, patch),
    onSuccess: (_data, variables) => {
      invalidate();
      // Mesmo gatilho do useTasks — este hook alimenta o Kanban de
      // projetos (Educação/TCC e Projetos) e antes não disparava a
      // checagem de conquistas ao concluir uma tarefa por aqui.
      if (variables.patch.status === "Concluído") triggerAchievementsCheck();
    },
  });

  const removeTask = useMutation({
    mutationFn: taskService.remove,
    onSuccess: invalidate,
  });

  const moveTask = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => taskService.move(id, status),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Task[]>(key);
      queryClient.setQueryData<Task[]>(key, (old) => old?.map((t) => (t.id === id ? { ...t, status } : t)));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: (_data, _error, variables) => {
      invalidate();
      if (variables.status === "Concluído") triggerAchievementsCheck();
    },
  });

  return {
    tasks: tasksQuery.data ?? [],
    isLoading: tasksQuery.isLoading,
    createTask: createTask.mutateAsync,
    updateTask: updateTask.mutateAsync,
    removeTask: removeTask.mutateAsync,
    moveTask: moveTask.mutate,
  };
}

/**
 * Priorização automática de tarefas ("Foque nisso agora"): busca as
 * top-N tarefas em aberto por score de foco (calculado no backend a
 * partir de prazo, prioridade, impacto/urgência/esforço e
 * dependências). A chave inclui `["tasks", ...]` de propósito, para
 * que qualquer invalidate genérico de tarefas (criar/mover/concluir)
 * também refaça esta consulta.
 */
export function useFocusTasks(limit = 5) {
  const query = useQuery({
    queryKey: ["tasks", "focus", limit],
    queryFn: () => taskService.focusList(limit),
  });

  return {
    focusTasks: query.data?.tasks ?? [],
    isLoading: query.isLoading,
  };
}

/** Área Profissional: tarefas em aberto de projetos profissionais, ordenadas pelo Priority Score. */
export function useProfessionalTasks() {
  const query = useQuery({ queryKey: ["tasks", "professional"], queryFn: taskService.professionalList });
  return { tasks: query.data ?? [], isLoading: query.isLoading };
}

export function useTaskTimer(taskId: string | null) {
  const queryClient = useQueryClient();

  const activeQuery = useQuery({
    queryKey: ["tasks", "time-active", taskId],
    queryFn: () => taskService.activeTimeEntry(taskId as string),
    enabled: !!taskId,
    refetchInterval: 15_000,
  });

  const start = useMutation({
    mutationFn: () => taskService.startTime(taskId as string),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks", "time-active", taskId] }),
  });

  const stop = useMutation({
    mutationFn: () => taskService.stopTime(taskId as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", "time-active", taskId] });
      queryClient.invalidateQueries({ queryKey: TASKS_KEY });
    },
  });

  return {
    activeEntry: activeQuery.data ?? null,
    start: start.mutateAsync,
    stop: stop.mutateAsync,
    isStarting: start.isPending,
    isStopping: stop.isPending,
  };
}
