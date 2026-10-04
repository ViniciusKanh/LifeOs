import { BookOpen, Flame, Heart, Leaf, Orbit, Sun, type LucideIcon } from "lucide-react";
import type { RpgTone } from "@/components/rpg/rpgAssets";
import type { AttributeKey, Rarity } from "@/services/codexService";

/** Apresentação do Códex (cores semânticas, ícones e artes) — sem regra de negócio. */
const BASE = "/assets/rpg";
export const CODEX_HERO = `${BASE}/codex-hero.webp`;
export const CODEX_ATTR_HEADER = `${BASE}/codex/attributes-header.webp`;

export const ATTR_UI: Record<AttributeKey, { tone: RpgTone; icon: LucideIcon; art: string }> = {
  focus: { tone: "red", icon: Flame, art: `${BASE}/codex/attr-focus.webp` },
  health: { tone: "green", icon: Heart, art: `${BASE}/codex/attr-health.webp` },
  knowledge: { tone: "blue", icon: BookOpen, art: `${BASE}/codex/attr-knowledge.webp` },
  discipline: { tone: "gold", icon: Sun, art: `${BASE}/codex/attr-discipline.webp` },
  creativity: { tone: "pink", icon: Orbit, art: `${BASE}/codex/attr-creativity.webp` },
  wellbeing: { tone: "cyan", icon: Leaf, art: `${BASE}/codex/attr-wellbeing.webp` },
};

export const relicSrc = (id: string) => `${BASE}/codex/relic-${id}.webp`;

export const RARITY: Record<Rarity, { label: string; tone: RpgTone }> = {
  common: { label: "Comum", tone: "muted" },
  uncommon: { label: "Incomum", tone: "green" },
  rare: { label: "Raro", tone: "blue" },
  epic: { label: "Épico", tone: "purple" },
  legendary: { label: "Lendário", tone: "gold" },
};

export const CONFIDENCE_LABEL = { low: "Confiança baixa", medium: "Confiança média", high: "Confiança alta" } as const;

/** "2 dias atrás" a partir de um timestamp do SQLite/ISO. */
export function timeAgo(at: string): string {
  const t = Date.parse(at.includes("T") ? at : `${at.replace(" ", "T")}Z`);
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 7) return `${days} dias atrás`;
  if (days < 14) return "1 semana atrás";
  if (days < 60) return `${Math.floor(days / 7)} semanas atrás`;
  return `${Math.floor(days / 30)} meses atrás`;
}
