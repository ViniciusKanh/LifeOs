import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { copilotService } from "@/services/copilotService";
import { ApiError } from "@/services/api";
import { triggerAchievementsCheck } from "@/services/achievementsService";

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

/**
 * Copilot com ações reais: envia a mensagem do usuário e devolve
 * texto simples, um pedido de esclarecimento, ou uma proposta de
 * ação. A proposta fica em memória local (não é gravada em lugar
 * nenhum) até `confirm()` ser chamado explicitamente — é o próprio
 * componente de UI que decide quando isso acontece, sempre a partir
 * de um clique do usuário, nunca automaticamente.
 */
export function useCopilotAssistant() {
  const queryClient = useQueryClient();

  const ask = useMutation({ mutationFn: (message: string) => copilotService.assist(message) });
  const confirm = useMutation({
    mutationFn: ({ action, args }: { action: string; args: Record<string, unknown> }) =>
      copilotService.confirmAssist(action, args),
    onSuccess: () => {
      // Uma ação confirmada pode ter mudado tarefas, hábitos ou
      // eventos — invalida tudo que pode ter sido afetado em vez de
      // adivinhar qual ação específica rodou, e também dispara a
      // checagem de conquistas (mesmo gatilho usado em outras telas).
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["habits"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      triggerAchievementsCheck();
    },
  });

  return {
    ask: ask.mutateAsync,
    isAsking: ask.isPending,
    askError: ask.error as ApiError | null,
    confirm: confirm.mutateAsync,
    isConfirming: confirm.isPending,
    confirmError: confirm.error as ApiError | null,
  };
}
