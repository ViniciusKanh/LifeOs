import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { bottlenecksService, type AnalysisPeriod, type FocusInput } from "@/services/bottlenecksService";

const KEY = ["bottlenecks"] as const;

/**
 * Detector de Gargalos: análise determinística (cacheada no servidor e
 * invalidada pelos próprios dados). O Oráculo (IA) só roda sob demanda.
 */
export function useBottlenecks(period: AnalysisPeriod) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: [...KEY, period], queryFn: () => bottlenecksService.analyze(period), staleTime: 60_000 });
  const reanalyze = useMutation({
    mutationFn: () => bottlenecksService.analyze(period, true),
    onSuccess: (data) => qc.setQueryData([...KEY, period], data),
  });
  const scheduleFocus = useMutation({
    mutationFn: (input: FocusInput) => bottlenecksService.focusSchedule(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: ["capacity"] });
    },
  });
  return { ...query, reanalyze, scheduleFocus };
}

export function useBottleneckDetail(key: string | null, period: AnalysisPeriod) {
  return useQuery({ queryKey: [...KEY, "detail", key, period], queryFn: () => bottlenecksService.detail(key as string, period), enabled: !!key });
}

export function useBottleneckGraph(key: string | null, period: AnalysisPeriod) {
  return useQuery({ queryKey: [...KEY, "graph", key, period], queryFn: () => bottlenecksService.graph(key as string, period), enabled: !!key });
}

export function useBottleneckOracle() {
  return useMutation({ mutationFn: bottlenecksService.oracle });
}
