import type { AchievementTier } from "@/types";

/**
 * Identidade visual de cada tier de troféu (bronze/prata/ouro/platina) —
 * mesmo conceito de "raridade" de PlayStation/Xbox, centralizado aqui
 * para o card do catálogo, o popup de celebração e o sino do cabeçalho
 * usarem exatamente as mesmas cores e rótulos.
 */
export const TIER_LABEL: Record<AchievementTier, string> = {
  bronze: "Bronze",
  silver: "Prata",
  gold: "Ouro",
  platinum: "Platina",
};

export const TIER_EMOJI: Record<AchievementTier, string> = {
  bronze: "🥉",
  silver: "🥈",
  gold: "🥇",
  platinum: "💎",
};

/** Gradiente do medalhão — cor real de cada metal, não um tom genérico de marca. */
export const TIER_MEDAL_GRADIENT: Record<AchievementTier, string> = {
  bronze: "from-[#B87446] to-[#8A5230]",
  silver: "from-[#D8DCE3] to-[#9CA3AF]",
  gold: "from-[#FFD668] to-[#E8A93B]",
  platinum: "from-[#B9E7FF] via-[#9DB8FF] to-[#7C4DFF]",
};

export const TIER_GLOW: Record<AchievementTier, string> = {
  bronze: "shadow-[0_8px_24px_-8px_rgba(184,116,70,0.55)]",
  silver: "shadow-[0_8px_24px_-8px_rgba(156,163,175,0.6)]",
  gold: "shadow-[0_8px_28px_-8px_rgba(232,169,59,0.65)]",
  platinum: "shadow-[0_10px_32px_-8px_rgba(124,77,255,0.6)]",
};

export const TIER_TEXT_TONE: Record<AchievementTier, string> = {
  bronze: "text-[#8A5230] dark:text-[#D8A87C]",
  silver: "text-[#5B6172] dark:text-[#D8DCE3]",
  gold: "text-[#8A6414] dark:text-[#FFD668]",
  platinum: "text-brand-600 dark:text-brand-100",
};

export const TIER_BORDER_TONE: Record<AchievementTier, string> = {
  bronze: "border-[#B87446]/35",
  silver: "border-[#9CA3AF]/40",
  gold: "border-[#E8A93B]/40",
  platinum: "border-brand-500/35",
};

/** Ordem de exibição — do mais raro pro mais comum, como uma vitrine de troféus. */
export const TIER_ORDER: AchievementTier[] = ["platinum", "gold", "silver", "bronze"];
