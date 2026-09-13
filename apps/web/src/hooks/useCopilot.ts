import { useMutation } from "@tanstack/react-query";
import { copilotService } from "@/services/copilotService";
import { ApiError } from "@/services/api";

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
