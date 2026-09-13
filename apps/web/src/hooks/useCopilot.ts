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
