import { api } from "./api";

/** Proposta de ação do Copilot — nada foi gravado ainda; só existe depois que o usuário confirma explicitamente. */
export interface CopilotActionProposal {
  action: string;
  summary: string;
  args: Record<string, unknown>;
}

export type CopilotAssistResponse =
  | { kind: "reply"; text: string }
  | { kind: "proposal"; proposal: CopilotActionProposal }
  | { kind: "clarify"; message: string };

export const copilotService = {
  dailyInsight: () => api.get<{ text: string; generatedAt?: string }>("/copilot/daily-insight"),
  generateInsight: () => api.post<{ text: string }>("/copilot/insight"),
  generateHealthInsight: () => api.post<{ text: string }>("/copilot/health-insight"),
  generateEducationInsight: (educationId: string) => api.post<{ text: string }>("/copilot/education-insight", { educationId }),
  generateHabitsInsight: () => api.post<{ text: string }>("/copilot/habits-insight"),
  generateAnalyticsInsight: (days: number) => api.post<{ text: string }>("/copilot/analytics-insight", { days }),

  /**
   * Copilot com ações reais: manda uma mensagem em linguagem natural
   * e recebe OU uma resposta em texto, OU uma proposta de ação que
   * ainda precisa ser confirmada (nunca escreve nada sozinho).
   */
  assist: (message: string) => api.post<CopilotAssistResponse>("/copilot/assist", { message }),
  /** Único ponto que efetivamente executa uma ação do Copilot — só deve ser chamado depois que o usuário confirmar a proposta na tela. */
  confirmAssist: (action: string, args: Record<string, unknown>) =>
    api.post<{ message: string }>("/copilot/assist/confirm", { action, args }),
};
