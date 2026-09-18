import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { experimentService } from "@/services/experimentService";
import type { CreateExperimentInput, ExperimentStatus } from "@/types";

const LIST_KEY = ["experiments"];
const SUMMARY_KEY = ["experiments", "summary"];
const INSIGHTS_KEY = ["experiments", "insights"];
const CATALOG_KEY = ["experiments", "metrics-catalog"];
const RULES_KEY = ["experiments", "verification-rules"];

/** Lista + KPIs + insights da página principal de Experimentos Pessoais. */
export function useExperiments() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: LIST_KEY });
    queryClient.invalidateQueries({ queryKey: SUMMARY_KEY });
    queryClient.invalidateQueries({ queryKey: INSIGHTS_KEY });
    queryClient.invalidateQueries({ queryKey: ["experiments", "detail"] });
    queryClient.invalidateQueries({ queryKey: ["analytics"] });
  };

  const listQuery = useQuery({ queryKey: LIST_KEY, queryFn: experimentService.list });
  const summaryQuery = useQuery({ queryKey: SUMMARY_KEY, queryFn: experimentService.summary });
  const insightsQuery = useQuery({ queryKey: INSIGHTS_KEY, queryFn: experimentService.insights });

  const createExperiment = useMutation({ mutationFn: (input: CreateExperimentInput) => experimentService.create(input), onSuccess: invalidate });
  const removeExperiment = useMutation({ mutationFn: (id: string) => experimentService.remove(id), onSuccess: invalidate });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ExperimentStatus }) => experimentService.setStatus(id, status),
    onSuccess: invalidate,
  });

  return {
    experiments: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    summary: summaryQuery.data ?? null,
    insights: insightsQuery.data ?? [],
    createExperiment: createExperiment.mutateAsync,
    isCreating: createExperiment.isPending,
    removeExperiment: removeExperiment.mutateAsync,
    setStatus: setStatus.mutateAsync,
    refetch: () => Promise.all([listQuery.refetch(), summaryQuery.refetch(), insightsQuery.refetch()]),
  };
}

/** Catálogo de métricas disponíveis (com aviso de histórico) — usado pelo wizard. */
export function useExperimentMetricsCatalog() {
  return useQuery({ queryKey: CATALOG_KEY, queryFn: experimentService.metricsCatalog });
}

export function useExperimentVerificationRules() {
  return useQuery({ queryKey: RULES_KEY, queryFn: experimentService.verificationRules });
}
