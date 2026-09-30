import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { taskService } from "@/services/taskService";

/** Anexos de uma tarefa. Mudanças também invalidam os "Documentos" e a visão geral dos projetos. */
export function useTaskAttachments(taskId: string | null | undefined) {
  const queryClient = useQueryClient();
  const key = ["tasks", "attachments", taskId];

  const query = useQuery({
    queryKey: key,
    queryFn: () => taskService.listAttachments(taskId as string),
    enabled: !!taskId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ["projects", "documents"] });
    queryClient.invalidateQueries({ queryKey: ["projects", "overview"] });
    queryClient.invalidateQueries({ queryKey: ["projects", "tasks"] });
  };

  const add = useMutation({
    mutationFn: (input: { dataUri: string; fileName?: string | null; caption?: string | null }) =>
      taskService.addAttachment(taskId as string, input),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (attachmentId: string) => taskService.removeAttachment(taskId as string, attachmentId),
    onSuccess: invalidate,
  });

  return {
    attachments: query.data ?? [],
    isLoading: query.isLoading && !!taskId,
    addAttachment: add.mutateAsync,
    isAdding: add.isPending,
    removeAttachment: remove.mutateAsync,
  };
}
