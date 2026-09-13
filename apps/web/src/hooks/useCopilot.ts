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
