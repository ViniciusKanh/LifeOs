import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { contractGuildService } from "@/services/contractGuildService";
import { notifyGamification } from "@/services/gamificationService";

export const GUILD_KEY = ["contract-guild"] as const;

export const useGuildHub = () => useQuery({ queryKey: GUILD_KEY, queryFn: contractGuildService.hub, staleTime: 15_000 });
export const usePactDetail = (id: string | null) => useQuery({ queryKey: [...GUILD_KEY, "detail", id], queryFn: () => contractGuildService.detail(id!), enabled: !!id });

/**
 * Ações da Guilda. Toda mudança atualiza a Guilda, os contratos, as tarefas,
 * a Agenda e a gamificação — o progresso nasce das tarefas reais.
 */
export function useGuildActions() {
  const qc = useQueryClient();
  const sync = () => {
    for (const k of [GUILD_KEY, ["contracts"], ["tasks"], ["events"], ["goals"], ["projects"], ["gamification"], ["achievements"], ["today-hub"]]) void qc.invalidateQueries({ queryKey: k });
    notifyGamification();
  };
  return {
    sync,
    pause: useMutation({ mutationFn: ({ id, pause }: { id: string; pause: boolean }) => contractGuildService.pause(id, pause), onSuccess: sync }),
    cancel: useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string | null }) => contractGuildService.cancel(id, reason), onSuccess: sync }),
    activate: useMutation({ mutationFn: (id: string) => contractGuildService.activate(id), onSuccess: sync }),
    replan: useMutation({ mutationFn: ({ id, ...input }: { id: string; dueDate: string; spreadOverdue: boolean; reason?: string | null }) => contractGuildService.replan(id, input), onSuccess: sync }),
    feature: useMutation({ mutationFn: ({ id, featured }: { id: string; featured: boolean }) => contractGuildService.feature(id, featured), onSuccess: sync }),
    saveStages: useMutation({ mutationFn: ({ id, stages }: { id: string; stages: Parameters<typeof contractGuildService.saveStages>[1] }) => contractGuildService.saveStages(id, stages), onSuccess: sync }),
    completeStage: useMutation({ mutationFn: ({ id, stageId, done }: { id: string; stageId: string; done: boolean }) => contractGuildService.completeStage(id, stageId, done), onSuccess: sync }),
    setTaskStage: useMutation({ mutationFn: ({ id, taskId, stageId }: { id: string; taskId: string; stageId: string | null }) => contractGuildService.setTaskStage(id, taskId, stageId), onSuccess: sync }),
    seal: useMutation({ mutationFn: (id: string) => contractGuildService.seal(id), onSuccess: sync }),
    scribe: useMutation({ mutationFn: contractGuildService.scribe }),
  };
}
