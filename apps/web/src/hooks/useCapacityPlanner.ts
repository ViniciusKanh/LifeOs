import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { capacityService } from "@/services/capacityService";
import type { EffortType } from "@/types";

/** Dashboard completo do Capacity Planner (capacidade, tarefas, blocos, energia, focus, contexto) para uma data. */
export function useCapacityDay(date: string) {
  return useQuery({
    queryKey: ["capacity", "day", date],
    queryFn: () => capacityService.day(date),
  });
}

/** Sugestão de reorganização (preview) — nunca persiste sozinha; usuário precisa confirmar via useApplyPlan. */
export function useCapacityPlanPreview(date: string, enabled: boolean) {
  return useQuery({
    queryKey: ["capacity", "plan-preview", date],
    queryFn: () => capacityService.planPreview(date),
    enabled,
  });
}

export function useApplyCapacityPlan(date: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (blocks: { taskId: string; startTime: string; endTime: string; blockType: EffortType }[]) =>
      capacityService.planApply(date, blocks),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["capacity", "day", date] }),
  });
}

export function useCreateCapacityBlock(date: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: capacityService.createBlock,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["capacity", "day", date] }),
  });
}

export function useDeleteCapacityBlock(date: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => capacityService.deleteBlock(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["capacity", "day", date] }),
  });
}
