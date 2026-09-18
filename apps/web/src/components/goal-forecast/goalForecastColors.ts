import type { GoalForecastStatus, GoalRisk } from "@/types";

export const STATUS_LABEL: Record<GoalForecastStatus, string> = {
  ahead: "Adiantada",
  on_track: "No ritmo",
  attention: "Atenção",
  at_risk: "Em risco",
  overdue: "Atrasada",
  completed: "Concluída",
  insufficient_data: "Dados insuficientes",
};

export const STATUS_TONE: Record<GoalForecastStatus, string> = {
  ahead: "bg-cat-green/10 text-cat-green",
  on_track: "bg-cat-blue/10 text-cat-blue",
  attention: "bg-signal/15 text-signal-deep",
  at_risk: "bg-drop/10 text-drop",
  overdue: "bg-drop/10 text-drop",
  completed: "bg-cat-green/10 text-cat-green",
  insufficient_data: "bg-paper-border/60 dark:bg-ink-border/40 text-slate",
};

export const RISK_LABEL: Record<GoalRisk, string> = { low: "Baixo", medium: "Médio", high: "Alto", critical: "Crítico" };
export const RISK_TONE: Record<GoalRisk, string> = {
  low: "bg-cat-green/10 text-cat-green",
  medium: "bg-signal/15 text-signal-deep",
  high: "bg-cat-pink/10 text-cat-pink",
  critical: "bg-drop/10 text-drop",
};

export const AREA_PALETTE = ["#8B5CF6", "#2E7D6B", "#3B6FE0", "#C9821E", "#E0578B", "#94A3B8"];

export const STATUS_BAR_COLOR: Record<string, string> = {
  ahead: "#2E7D6B",
  on_track: "#3B6FE0",
  attention: "#C9821E",
  at_risk: "#E0578B",
  overdue: "#D64545",
  completed: "#2E7D6B",
  insufficient_data: "#94A3B8",
};

/** Emoji por status — leitura rápida na lista e nos badges. */
export const STATUS_EMOJI: Record<string, string> = {
  ahead: "🚀",
  on_track: "🟢",
  attention: "🟡",
  at_risk: "🟠",
  overdue: "🔴",
  completed: "✅",
  insufficient_data: "❔",
};

/** Emoji por área — mesmo padrão usado em Capacity Planner e Deadline Radar. */
export const AREA_EMOJI: Record<string, string> = {
  Educação: "🎓",
  Saúde: "💪",
  Profissional: "💼",
  Pessoal: "🌱",
  Financeira: "💰",
  Outros: "📌",
};
