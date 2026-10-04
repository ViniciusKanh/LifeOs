import { CircleGauge, Flag, Goal, HeartPulse, Map, Repeat, ScrollText, Swords, type LucideIcon } from "lucide-react";
import type { RpgTone } from "@/components/rpg/rpgAssets";
import type { BottleneckLevel, CandidateType, GraphNodeType } from "@/services/bottlenecksService";

/** Apresentação do Detector de Gargalos (tons, rótulos, ícones e artes) — sem regra de negócio. */
export const LEVEL_UI: Record<BottleneckLevel, { label: string; tone: RpgTone; badge: string }> = {
  critical: { label: "Crítico", tone: "red", badge: "Prioridade crítica" },
  high: { label: "Alto", tone: "orange", badge: "Alta prioridade" },
  attention: { label: "Atenção", tone: "gold", badge: "Atenção" },
  normal: { label: "Normal", tone: "blue", badge: "Monitorar" },
};

export const TYPE_UI: Record<CandidateType | GraphNodeType, { label: string; icon: LucideIcon; tone: RpgTone }> = {
  TASK: { label: "Missão", icon: Swords, tone: "purple" },
  PROJECT: { label: "Projeto", icon: ScrollText, tone: "blue" },
  CAMPAIGN: { label: "Campanha", icon: Flag, tone: "gold" },
  MILESTONE: { label: "Marco", icon: Map, tone: "gold" },
  GOAL: { label: "Meta", icon: Goal, tone: "green" },
  HABIT: { label: "Hábito", icon: Repeat, tone: "green" },
  CAPACITY: { label: "Capacidade", icon: CircleGauge, tone: "orange" },
  HEALTH_SIGNAL: { label: "Saúde", icon: HeartPulse, tone: "pink" },
};

/** Artes reaproveitadas do jogo (nenhuma imagem nova por tipo). */
const ART: Record<CandidateType, string> = {
  TASK: "/assets/rpg/protocols/study.webp",
  PROJECT: "/assets/rpg/items/map.webp",
  CAMPAIGN: "/assets/rpg/items/map.webp",
  MILESTONE: "/assets/rpg/items/map.webp",
  HABIT: "/assets/rpg/protocols/sunrise.webp",
  CAPACITY: "/assets/rpg/protocols/storm.webp",
  HEALTH_SIGNAL: "/assets/rpg/protocols/meditate.webp",
};
export const bottleneckArt = (t: CandidateType) => ART[t];
export const ORACLE_ART = "/assets/rpg/avatars/mago.webp";
export const HERO_ART = "/assets/rpg/bottleneck-hero.webp";

export const CONFIDENCE_UI = { high: { label: "Evidência forte", tone: "green" }, medium: { label: "Evidência moderada", tone: "gold" }, low: { label: "Evidência fraca", tone: "muted" } } as const;

export const TIME_SOURCE_LABEL = {
  focus_history: "pelo seu histórico de foco",
  energy: "pelo horário de maior energia registrado",
  free_window: "próxima janela livre na agenda",
} as const;

export function dayLabel(date: string, today: string): string {
  const diff = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

