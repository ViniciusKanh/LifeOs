import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { automationsService, type AutomationModule } from "@/services/automationsService";

export function useAutomations(module: AutomationModule) {
  const qc = useQueryClient();
  const key = ["automations", module] as const;
  const list = useQuery({ queryKey: key, queryFn: () => automationsService.list(module) });
  // Executar pode criar sugestões/planos: atualiza os painéis do módulo também.
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
    const related: Record<AutomationModule, string[]> = {
      grimoire: ["grimoire"],
      goals: ["goals-hub"],
      bank: ["bank", "hub"],
      education: ["educations", "hub"],
      health: ["health", "hub"],
      agenda: ["events"],
      missions: ["tasks", "missions3"],
      quests: ["gamification", "quests"],
      diary: ["journal"],
      lab: ["experiments"],
      hero: ["achievements"],
      journey: ["analytics"],
      habits: ["habits"],
      library: ["books"],
      admin: ["life-admin"],
      today: ["today-hub"],
      contracts: ["contract-guild"],
      tavern: ["tavern3"],
      forge: ["forge"],
      reviews: ["journey-review"],
      skills: ["skill-tree"],
    };
    void qc.invalidateQueries({ queryKey: related[module] });
  };
  const update = useMutation({
    mutationFn: ({ automationKey, patch }: { automationKey: string; patch: { enabled?: boolean; config?: Record<string, unknown> } }) =>
      automationsService.update(module, automationKey, patch),
    onSuccess: refresh,
  });
  const run = useMutation({ mutationFn: (automationKey: string) => automationsService.run(module, automationKey), onSettled: refresh });
  return { automations: list.data ?? [], isLoading: list.isLoading, isError: list.isError, refetch: list.refetch, update, run };
}

export function useAutomationRuns(module: AutomationModule, key: string | null) {
  return useQuery({ queryKey: ["automations", module, "runs", key], queryFn: () => automationsService.runs(module, key as string), enabled: !!key });
}
