import type { CoverageStatus, DataHealthLabel, DataHealthSeverity, ReadinessStatus } from "@/types";

export const MODULE_EMOJI: Record<string, string> = {
  tasks: "✅",
  projects: "📁",
  goals: "🎯",
  habits: "🔁",
  education: "🎓",
  library: "📚",
  health: "❤️",
  focus: "⏱️",
  experiments: "🧪",
  signals: "📡",
};

export const COVERAGE_TONE: Record<CoverageStatus, string> = {
  alta: "bg-cat-green/10 text-cat-green",
  média: "bg-signal/15 text-signal-deep dark:text-signal",
  baixa: "bg-drop/10 text-drop",
};

export const COVERAGE_BAR_COLOR: Record<CoverageStatus, string> = {
  alta: "#2E7D6B",
  média: "#D97706",
  baixa: "#E1483E",
};

export const SEVERITY_TONE: Record<DataHealthSeverity, string> = {
  info: "bg-cat-blue/10 text-cat-blue",
  attention: "bg-signal/15 text-signal-deep dark:text-signal",
  warning: "bg-signal/20 text-signal-deep dark:text-signal",
  critical: "bg-drop/10 text-drop",
};

export const SEVERITY_LABEL: Record<DataHealthSeverity, string> = {
  info: "Info",
  attention: "Atenção",
  warning: "Alerta",
  critical: "Crítico",
};

export const READINESS_TONE: Record<ReadinessStatus, string> = {
  ready: "bg-cat-green/10 text-cat-green",
  partial: "bg-signal/15 text-signal-deep dark:text-signal",
  insufficient: "bg-drop/10 text-drop",
  unavailable: "bg-black/5 text-slate dark:bg-white/5",
};

export const READINESS_LABEL: Record<ReadinessStatus, string> = {
  ready: "Pronto",
  partial: "Parcial",
  insufficient: "Insuficiente",
  unavailable: "Indisponível",
};

export const SCORE_LABEL_TONE: Record<DataHealthLabel, string> = {
  Saudável: "text-cat-green",
  Bom: "text-cat-blue",
  Atenção: "text-signal-deep dark:text-signal",
  Crítico: "text-drop",
};

export const DIMENSION_COLOR = ["#7C4DFF", "#2F80FF", "#12B76A", "#FF7A45", "#08B6A6", "#FF3D93"];
