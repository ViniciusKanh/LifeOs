import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { moduleHubService, type AdvisorModule, type EducationStage } from "@/services/moduleHubService";

// As chaves ficam sob o prefixo de cada módulo: as mutações já existentes
// (useBank, useHealth, useEducations) invalidam o prefixo e o hub recalcula junto.
export const HUB_KEYS = { bank: ["bank", "hub"], education: ["educations", "hub"], health: ["health", "hub"] } as const;

export function useBankHub() {
  return useQuery({ queryKey: HUB_KEYS.bank, queryFn: moduleHubService.bank, staleTime: 15_000 });
}

export function useEducationHub() {
  return useQuery({ queryKey: HUB_KEYS.education, queryFn: moduleHubService.education, staleTime: 10_000 });
}

export function useHealthHub() {
  return useQuery({ queryKey: HUB_KEYS.health, queryFn: moduleHubService.health, staleTime: 10_000 });
}

export function useAdvisor(module: AdvisorModule) {
  return useMutation({ mutationFn: (body: { useAi: boolean; question?: string; research?: boolean }) => moduleHubService.advisor(module, body) });
}

export function useEducationHubActions() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["educations"] });
    void qc.invalidateQueries({ queryKey: ["tasks"] });
  };
  return {
    createStage: useMutation({ mutationFn: moduleHubService.createStage, onSuccess: refresh }),
    applyTemplate: useMutation({ mutationFn: moduleHubService.applyStageTemplate, onSuccess: refresh }),
    updateStage: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: Partial<Pick<EducationStage, "title" | "status" | "dueDate" | "notes" | "position">> }) => moduleHubService.updateStage(id, patch),
      onSuccess: refresh,
    }),
    deleteStage: useMutation({ mutationFn: moduleHubService.deleteStage, onSuccess: refresh }),
    generatePlan: useMutation({ mutationFn: moduleHubService.generatePlan, onSuccess: refresh }),
    decidePlan: useMutation({
      mutationFn: ({ id, decision, items }: { id: string; decision: "apply" | "reject"; items?: Array<{ date: string; subjectId?: string | null; minutes: number; title: string }> }) =>
        moduleHubService.decidePlan(id, decision, items),
      onSuccess: refresh,
    }),
  };
}
