import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { experimentService } from "@/services/experimentService";
import type { ExperimentCheckinStatus, ExperimentPerceivedResult, ExperimentPerception, ExperimentWorthContinuing, UpdateExperimentInput } from "@/types";

/** Detalhe completo de um experimento: comparação, check-ins, observações e interpretação. */
export function useExperiment(id: string | undefined) {
  const queryClient = useQueryClient();
  const key = ["experiments", "detail", id];
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ["experiments"] });
  };

  const detailQuery = useQuery({
    queryKey: key,
    queryFn: () => experimentService.get(id as string),
    enabled: !!id,
  });

  const updateExperiment = useMutation({
    mutationFn: (patch: UpdateExperimentInput) => experimentService.update(id as string, patch),
    onSuccess: invalidate,
  });

  const setStatus = useMutation({
    mutationFn: (status: Parameters<typeof experimentService.setStatus>[1]) => experimentService.setStatus(id as string, status),
    onSuccess: invalidate,
  });

  const conclude = useMutation({
    mutationFn: (input: { personalConclusion?: string; worthContinuing?: ExperimentWorthContinuing; perceivedResult?: ExperimentPerceivedResult }) =>
      experimentService.conclude(id as string, input),
    onSuccess: invalidate,
  });

  const upsertLog = useMutation({
    mutationFn: (input: { logDate: string; checkinStatus?: ExperimentCheckinStatus | null; perception?: ExperimentPerception | null; notes?: string | null }) =>
      experimentService.upsertLog(id as string, input),
    onSuccess: invalidate,
  });

  const analyze = useMutation({
    mutationFn: (question?: string) => experimentService.analyze(id as string, question),
  });

  return {
    detail: detailQuery.data ?? null,
    isLoading: detailQuery.isLoading,
    isError: detailQuery.isError,
    refetch: detailQuery.refetch,
    updateExperiment: updateExperiment.mutateAsync,
    setStatus: setStatus.mutateAsync,
    isChangingStatus: setStatus.isPending,
    conclude: conclude.mutateAsync,
    isConcluding: conclude.isPending,
    upsertLog: upsertLog.mutateAsync,
    isSavingLog: upsertLog.isPending,
    analyze: analyze.mutateAsync,
    isAnalyzing: analyze.isPending,
    analysisText: analyze.data?.text ?? null,
    analysisError: analyze.isError,
  };
}
