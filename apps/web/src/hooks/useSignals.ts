import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { signalsService } from "@/services/signalsService";
import type { SignalPeriod, TrendSignalKey } from "@/types";

/** Dashboard agregado de Signals (cards, radar, padrões, sugestão-base) para o período selecionado. */
export function useSignals(period: SignalPeriod) {
  return useQuery({
    queryKey: ["signals", period],
    queryFn: () => signalsService.dashboard(period),
  });
}

/** Série normalizada (0-100) de um sinal específico, para o gráfico "Variação dos sinais". */
export function useSignalTrend(period: SignalPeriod, signal: TrendSignalKey) {
  return useQuery({
    queryKey: ["signals", "trend", period, signal],
    queryFn: () => signalsService.trend(period, signal),
  });
}

/** Complemento opcional do Gemini sobre a sugestão determinística — chamado sob demanda, nunca automático. */
export function useSignalsAISuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (period: SignalPeriod) => signalsService.aiSuggestion(period),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["signals"] }),
  });
}
