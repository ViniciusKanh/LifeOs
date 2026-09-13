import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { copilotService } from "@/services/copilotService";
import { ApiError } from "@/services/api";

const DAILY_INSIGHT_KEY = ["copilot", "daily-insight"];

/**
 * Copilot proativo: busca o insight do dia já pronto assim que o
 * Dashboard abre (o backend gera e guarda em cache na primeira vez do
 * dia) — o usuário não precisa clicar em nada pra ver algo. O botão
 * "gerar outro insight" continua disponível e, ao regenerar, atualiza
 * este mesmo cache do dia.
 */
export function useDailyInsight() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: DAILY_INSIGHT_KEY, queryFn: copilotService.dailyInsight, retry: false });

  const regenerate = useMutation({
    mutationFn: copilotService.generateInsight,
    onSuccess: (data) => queryClient.setQueryData(DAILY_INSIGHT_KEY, data),
  });

  return {
    text: query.data?.text ?? null,
    isLoading: query.isLoading,
    error: (query.error ?? regenerate.error) as ApiError | null,
    regenerate: regenerate.mutateAsync,
    isRegenerating: regenerate.isPending,
  };
}

/** LifeOS Copilot — gera um insight sob demanda com base nos dados reais do usuário (Gemini, configurado em Configurações). */
export function useCopilotInsight() {
  const mutation = useMutation({ mutationFn: copilotService.generateInsight });
  return {
    generate: mutation.mutateAsync,
    isGenerating: mutation.isPending,
    text: mutation.data?.text ?? null,
    error: mutation.error as ApiError | null,
  };
}

/** Mesma ideia do Copilot do Dashboard, mas focado só nos dados de bem-estar (água, sono, exercício, humor) — usado na tela de Saúde. */
export function useHealthInsight() {
  const mutation = useMutation({ mutationFn: copilotService.generateHealthInsight });
  return {
    generate: mutation.mutateAsync,
    isGenerating: mutation.isPending,
    text: mutation.data?.text ?? null,
    error: mutation.error as ApiError | null,
  };
}

/** Mesma ideia, focado em uma única formação (disciplinas, prazos, horas de estudo) — usado no painel de Educação. */
export function useEducationInsight() {
  const mutation = useMutation({ mutationFn: copilotService.generateEducationInsight });
  return {
    generate: mutation.mutateAsync,
    isGenerating: mutation.isPending,
    text: mutation.data?.text ?? null,
    error: mutation.error as ApiError | null,
  };
}

/** Mesma ideia, focado em sequências, consistência e horários reais de check-in — usado na tela de Hábitos. */
export function useHabitsInsight() {
  const mutation = useMutation({ mutationFn: copilotService.generateHabitsInsight });
  return {
    generate: mutation.mutateAsync,
    isGenerating: mutation.isPending,
    text: mutation.data?.text ?? null,
    error: mutation.error as ApiError | null,
  };
}

/** Mesma ideia, focado no período selecionado em Analytics (totais, variação e correlações reais). */
export function useAnalyticsInsight() {
  const mutation = useMutation({ mutationFn: copilotService.generateAnalyticsInsight });
  return {
    generate: mutation.mutateAsync,
    isGenerating: mutation.isPending,
    text: mutation.data?.text ?? null,
    error: mutation.error as ApiError | null,
  };
}
