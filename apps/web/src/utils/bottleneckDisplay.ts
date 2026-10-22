import { CircleGauge, Flag, Goal, HeartPulse, Map, Repeat, ScrollText, Swords, type LucideIcon } from "lucide-react";
import type { RpgTone } from "@/components/rpg/rpgAssets";
import type { BottleneckLevel, CandidateType, GraphNodeType } from "@/services/bottlenecksService";

/** Apresentação do Detector de Gargalos (tons, rótulos, ícones e artes) — sem regra de negócio. */
export const LEVEL_UI: Record<BottleneckLevel, { label: string; tone: RpgTone; badge: string; meaning: string }> = {
  critical: { label: "Crítico", tone: "red", badge: "Resolver já", meaning: "Isso significa que muita coisa está parada esperando por este item — resolvê-lo é o que mais libera sua rotina agora." },
  high: { label: "Alto", tone: "orange", badge: "Resolver logo", meaning: "Isso significa que este item já segura outras partes da sua rotina; vale tratá-lo nos próximos dias." },
  attention: { label: "Atenção", tone: "gold", badge: "Fique de olho", meaning: "Isso significa que ainda não trava muito, mas pode virar problema se continuar parado." },
  normal: { label: "Baixo", tone: "blue", badge: "Tranquilo", meaning: "Isso significa que trava pouco por enquanto — só acompanhe." },
};

export const TYPE_UI: Record<CandidateType | GraphNodeType, { label: string; icon: LucideIcon; tone: RpgTone }> = {
  TASK: { label: "Tarefa", icon: Swords, tone: "purple" },
  PROJECT: { label: "Projeto", icon: ScrollText, tone: "blue" },
  CAMPAIGN: { label: "Campanha", icon: Flag, tone: "gold" },
  MILESTONE: { label: "Marco", icon: Map, tone: "gold" },
  GOAL: { label: "Meta", icon: Goal, tone: "green" },
  HABIT: { label: "Hábito", icon: Repeat, tone: "green" },
  CAPACITY: { label: "Agenda cheia", icon: CircleGauge, tone: "orange" },
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

export const CONFIDENCE_UI = { high: { label: "Certeza alta", tone: "green" }, medium: { label: "Certeza média", tone: "gold" }, low: { label: "Certeza baixa", tone: "muted" } } as const;

export const TIME_SOURCE_LABEL = {
  focus_history: "horário em que você costuma render mais",
  energy: "horário em que você registrou mais energia",
  free_window: "primeiro horário livre na sua agenda",
} as const;

/** Frase simples para a urgência (0–100) — só traduz o número que veio do servidor. */
export function urgencyMeaning(u: number): string {
  if (u >= 80) return "O prazo está muito perto ou já passou.";
  if (u >= 50) return "O prazo chega nos próximos dias.";
  if (u > 0) return "Existe prazo, mas ainda há folga.";
  return "Não há prazo apertado.";
}

/** Linguagem simples para a relação de cada item com o gargalo (grafo e listas). */
export const RELATION_LABEL = {
  center: "está travando",
  blocked: "espera por ele",
  blocker: "precisa vir antes",
  belongs: "faz parte de",
  affected: "é afetado",
} as const;

export function dayLabel(date: string, today: string): string {
  const diff = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

