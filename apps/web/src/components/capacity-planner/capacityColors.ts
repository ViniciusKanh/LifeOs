/** Cores por tipo de esforço/bloco — mesma paleta conceitual do LifeOS (roxo = foco/estratégia). */
export const EFFORT_COLOR: Record<string, string> = {
  deep_work: "#8B5CF6",
  normal: "#3B6FE0",
  light: "#2E7D6B",
};

export const EFFORT_LABEL: Record<string, string> = {
  deep_work: "Trabalho profundo",
  normal: "Normal",
  light: "Leve",
};

export const AREA_PALETTE = ["#3B6FE0", "#8B5CF6", "#2E7D6B", "#C9821E", "#E0578B", "#14B8A6", "#6366F1"];

export const WORKLOAD_TONE: Record<string, { label: string; className: string }> = {
  leve: { label: "Leve", className: "bg-cat-green/10 text-cat-green" },
  equilibrada: { label: "Equilibrada", className: "bg-cat-blue/10 text-cat-blue" },
  alta: { label: "Alta", className: "bg-signal/15 text-signal-deep" },
  sobrecarga: { label: "Sobrecarga", className: "bg-drop/10 text-drop" },
};

export const STATUS_BAR_COLOR: Record<string, string> = {
  leve: "#2E7D6B",
  equilibrada: "#3B6FE0",
  alta: "#C9821E",
  sobrecarga: "#D64545",
};

/** Emoji por tipo de esforço — reforço visual rápido nas listas de tarefas/plano. */
export const EFFORT_EMOJI: Record<string, string> = {
  deep_work: "🧠",
  normal: "⚙️",
  light: "🪶",
};

/** Emoji por nível de ocupação do dia. */
export const WORKLOAD_EMOJI: Record<string, string> = {
  leve: "🌿",
  equilibrada: "🟦",
  alta: "🟠",
  sobrecarga: "🔴",
};

/** Emoji por nível de energia/foco previstos (Signals/Focus). */
export const ENERGY_EMOJI: Record<string, string> = { Alta: "🔋", Média: "🔌", Baixa: "🪫" };
export const FOCUS_EMOJI: Record<string, string> = { Bom: "🎯", Regular: "🙂", Fraco: "😴" };
