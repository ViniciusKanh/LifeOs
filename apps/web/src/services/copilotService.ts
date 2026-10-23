import { api } from "./api";

export type CopilotActionName =
  | "criar_tarefa"
  | "concluir_tarefa"
  | "mover_tarefa"
  | "marcar_habito"
  | "criar_evento"
  | "criar_meta"
  | "criar_projeto"
  | "capturar_inbox"
  | "registrar_agua"
  | "registrar_treino"
  | "registrar_leitura"
  | "registrar_sono"
  | "registrar_humor";

/** Proposta de ação do Copilot — nada foi gravado ainda; só existe depois que o usuário confirma explicitamente. */
export interface CopilotActionProposal {
  action: CopilotActionName;
  summary: string;
  /** Prévia campo a campo do que será gravado. */
  details?: Array<{ label: string; value: string }>;
  args: Record<string, unknown>;
  /** "local" = comando rápido reconhecido sem IA; "ia" = interpretado pelo Gemini. */
  source?: "local" | "ia";
}

export type CopilotAssistResponse =
  | { kind: "reply"; text: string }
  | { kind: "proposal"; proposal: CopilotActionProposal }
  | { kind: "clarify"; message: string };

/** Prévia instantânea (só parser local, sem IA): "none" quando o texto não é um comando rápido. */
export type CopilotParseResponse = CopilotAssistResponse | { kind: "none" };

export interface CopilotConfirmResponse {
  message: string;
  /** Tela do item criado/alterado, quando houver. */
  link: string | null;
}

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
    api.post<CopilotConfirmResponse>("/copilot/assist/confirm", { action, args }),
  /** Prévia sem IA para a paleta (Ctrl/Cmd+K) enquanto o usuário digita — nunca grava. */
  parse: (message: string) => api.post<CopilotParseResponse>("/copilot/parse", { message }),
};
