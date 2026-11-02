import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { goalsHubService } from "@/services/goalsHubService";

const KEY = ["goals-hub"] as const;

export function useGoalsHub() {
  return useQuery({ queryKey: [...KEY, "overview"], queryFn: goalsHubService.overview, staleTime: 30_000 });
}
export function useGoalsAnalytics(enabled = true) {
  return useQuery({ queryKey: [...KEY, "analytics"], queryFn: goalsHubService.analytics, enabled, staleTime: 60_000 });
}
export function useGoalsInsights(enabled = true) {
  return useQuery({ queryKey: [...KEY, "insights"], queryFn: goalsHubService.insights, enabled, staleTime: 30_000 });
}
export function usePlanSuggestions() {
  return useQuery({ queryKey: [...KEY, "suggestions"], queryFn: goalsHubService.suggestions });
}

/** Ações de planejamento. Aplicar mexe em metas e tarefas: invalida tudo o que depende delas. */
export function useGoalsHubActions() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: KEY });
    void qc.invalidateQueries({ queryKey: ["goals"] });
    void qc.invalidateQueries({ queryKey: ["tasks"] });
  };
  const weeklyPlan = useMutation({ mutationFn: goalsHubService.weeklyPlan, onSuccess: refresh });
  const replan = useMutation({ mutationFn: goalsHubService.replan, onSuccess: refresh });
  const planAi = useMutation({ mutationFn: goalsHubService.planAi, onSuccess: refresh });
  const apply = useMutation({ mutationFn: ({ id, payload }: { id: string; payload?: unknown }) => goalsHubService.apply(id, payload), onSuccess: refresh });
  const reject = useMutation({ mutationFn: goalsHubService.reject, onSuccess: refresh });
  const ask = useMutation({ mutationFn: goalsHubService.ask });
  return { weeklyPlan, replan, planAi, apply, reject, ask };
}
