import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { taskService } from "@/services/taskService";
import type { Task } from "@/types";

const TASKS_KEY = ["tasks"];

export function useTasks() {
  const queryClient = useQueryClient();

  const tasksQuery = useQuery({ queryKey: TASKS_KEY, queryFn: taskService.list });

  const createTask = useMutation({
    mutationFn: taskService.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
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
    onSettled: () => queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
  });

  return {
    tasks: tasksQuery.data ?? [],
    isLoading: tasksQuery.isLoading,
    createTask: createTask.mutateAsync,
    moveTask: moveTask.mutate,
  };
}
