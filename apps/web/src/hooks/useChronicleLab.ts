import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { chronicleLabService } from "@/services/chronicleLabService";

// Chave sob o prefixo do módulo: um registro de experimento (["experiments"]) invalida o hub junto.
export const LAB_HUB_KEY = ["experiments", "hub"] as const;

export const useLabHub = () => useQuery({ queryKey: LAB_HUB_KEY, queryFn: chronicleLabService.lab, staleTime: 15_000 });

export function useLabActions() {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ["experiments"] });
  return {
    setGoal: useMutation({ mutationFn: ({ id, goalId }: { id: string; goalId: string | null }) => chronicleLabService.setGoal(id, goalId), onSuccess: refresh }),
    explain: useMutation({ mutationFn: ({ id, question }: { id: string; question?: string }) => chronicleLabService.explain(id, question) }),
  };
}
