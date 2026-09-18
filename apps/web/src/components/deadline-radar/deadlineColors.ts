import type { DeadlineStatus, DeadlineRisk } from "@/types";

export const STATUS_LABEL: Record<DeadlineStatus, string> = {
  atrasado: "Atrasado",
  vence_hoje: "Vence hoje",
  vence_7d: "Vence em 7 dias",
  vence_30d: "Em 8–30 dias",
  no_prazo: "No prazo",
  concluido: "Concluído",
};

export const STATUS_TONE: Record<DeadlineStatus, string> = {
  atrasado: "bg-drop/10 text-drop",
  vence_hoje: "bg-signal/15 text-signal-deep",
  vence_7d: "bg-cat-blue/10 text-cat-blue",
  vence_30d: "bg-cat-purple/10 text-cat-purple",
  no_prazo: "bg-cat-green/10 text-cat-green",
  concluido: "bg-cat-green/10 text-cat-green",
};

export const RISK_LABEL: Record<DeadlineRisk, string> = {
  low: "Baixo",
  medium: "Médio",
  high: "Alto",
  critical: "Crítico",
};

export const RISK_TONE: Record<DeadlineRisk, string> = {
  low: "bg-cat-green/10 text-cat-green",
  medium: "bg-signal/15 text-signal-deep",
  high: "bg-cat-pink/10 text-cat-pink",
  critical: "bg-drop/10 text-drop",
};

export const RISK_BAR_COLOR: Record<DeadlineRisk, string> = {
  low: "#2E7D6B",
  medium: "#C9821E",
  high: "#E0578B",
  critical: "#D64545",
};

export const AREA_PALETTE = ["#8B5CF6", "#3B6FE0", "#2E7D6B", "#C9821E", "#E0578B", "#94A3B8"];

/** Emoji por status — reforço visual rápido na lista de itens críticos. */
export const STATUS_EMOJI: Record<string, string> = {
  atrasado: "🔴",
  vence_hoje: "🟠",
  vence_7d: "🟡",
  vence_30d: "🔵",
  no_prazo: "🟢",
  concluido: "✅",
};

/** Emoji por área — usado nos badges das listas de prazos. */
export const AREA_EMOJI: Record<string, string> = {
  Educação: "🎓",
  Projetos: "📁",
  Profissional: "💼",
  Pessoal: "🌱",
  Outros: "📌",
};

export const STATUS_BORDER_COLOR: Record<string, string> = {
  atrasado: "#D64545",
  vence_hoje: "#C9821E",
  vence_7d: "#C9821E",
  vence_30d: "#8B5CF6",
  no_prazo: "#2E7D6B",
  concluido: "#2E7D6B",
};
