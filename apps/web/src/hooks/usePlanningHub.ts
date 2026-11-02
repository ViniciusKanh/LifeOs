import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { planningHubService } from "@/services/planningHubService";
import { notifyGamification } from "@/services/gamificationService";

// As chaves ficam sob o prefixo de cada módulo de origem: as mutações já
// existentes (eventos, tarefas, quests, conselho) invalidam o prefixo e o hub recalcula junto.
export const PLANNING_KEYS = {
  agenda: ["events", "hub"],
  council: ["war-council", "hub"],
  missions: ["tasks", "hub"],
  guild: ["gamification", "quests", "hub"],
} as const;

export const useAgendaHub = () => useQuery({ queryKey: PLANNING_KEYS.agenda, queryFn: planningHubService.agenda, staleTime: 15_000 });
export const useCouncilHub = () => useQuery({ queryKey: PLANNING_KEYS.council, queryFn: planningHubService.council, staleTime: 15_000 });
export const useMissionsHub = () => useQuery({ queryKey: PLANNING_KEYS.missions, queryFn: planningHubService.missions, staleTime: 10_000 });
export const useGuildHub = () => useQuery({ queryKey: PLANNING_KEYS.guild, queryFn: planningHubService.guild, staleTime: 15_000 });

/** Mutações compartilhadas: qualquer alteração de agenda/missão atualiza as quatro telas. */
export function usePlanningActions() {
  const qc = useQueryClient();
  const refresh = () => {
    for (const k of [["events"], ["tasks"], ["war-council"], ["gamification", "quests"], ["automations"]]) void qc.invalidateQueries({ queryKey: k });
  };
  return {
    createBlock: useMutation({ mutationFn: planningHubService.createBlock, onSuccess: refresh }),
    eventMeta: useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof planningHubService.eventMeta>[1] }) => planningHubService.eventMeta(id, patch), onSuccess: refresh }),
    reschedule: useMutation({ mutationFn: ({ id, ...input }: { id: string; date: string; start: string | null; durationMinutes?: number }) => planningHubService.reschedule(id, input), onSuccess: refresh }),
    planTask: useMutation({ mutationFn: ({ id, plannedDate }: { id: string; plannedDate: string | null }) => planningHubService.planTask(id, plannedDate), onSuccess: refresh }),
    generateSuggestion: useMutation({ mutationFn: planningHubService.generateSuggestion, onSuccess: refresh }),
    decideSuggestion: useMutation({
      mutationFn: ({ id, decision, payload }: { id: string; decision: "apply" | "reject"; payload?: Parameters<typeof planningHubService.decideSuggestion>[2] }) => planningHubService.decideSuggestion(id, decision, payload),
      onSuccess: refresh,
    }),
    addSubtasks: useMutation({ mutationFn: ({ taskId, titles }: { taskId: string; titles: string[] }) => planningHubService.addSubtasks(taskId, titles), onSuccess: refresh }),
    toggleSubtask: useMutation({ mutationFn: ({ id, done }: { id: string; done: boolean }) => planningHubService.toggleSubtask(id, done), onSuccess: refresh }),
    deleteSubtask: useMutation({ mutationFn: planningHubService.deleteSubtask, onSuccess: refresh }),
    breakdown: useMutation({ mutationFn: planningHubService.breakdown }),
    /** Notifica o HUD global (XP/moedas) depois de concluir missão ou resgatar quest. */
    refreshAll: () => {
      refresh();
      notifyGamification();
    },
  };
}
