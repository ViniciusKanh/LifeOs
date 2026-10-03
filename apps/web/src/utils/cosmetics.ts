import type { Achievement, AchievementTier } from "@/types";
import { RPG_BANNERS, type RpgBanner } from "@/components/rpg/rpgAssets";
import type { FrameId } from "@/hooks/useRpgPreferences";

/**
 * Cosméticos do personagem: só aparência, nunca vantagem. Desbloqueio
 * derivado de dados reais (nível do ledger de XP e conquistas oficiais).
 */
export const FRAMES: Array<{ id: FrameId; label: string; requires: AchievementTier | null; hint: string }> = [
  { id: "bronze", label: "Bronze", requires: null, hint: "Disponível desde o início" },
  { id: "silver", label: "Prata", requires: "silver", hint: "Desbloqueie uma conquista de prata" },
  { id: "gold", label: "Ouro", requires: "gold", hint: "Desbloqueie uma conquista de ouro" },
  { id: "rare", label: "Arcana", requires: "platinum", hint: "Desbloqueie uma conquista de platina" },
];

export const TITLES: Array<{ id: string; label: string; level: number }> = [
  { id: "aprendiz", label: "Aprendiz da Jornada", level: 1 },
  { id: "explorador", label: "Explorador", level: 3 },
  { id: "estrategista", label: "Estrategista", level: 5 },
  { id: "guardiao", label: "Guardião da Rotina", level: 8 },
  { id: "mestre", label: "Mestre da Consistência", level: 12 },
  { id: "lenda", label: "Lenda da Jornada", level: 20 },
];

export const PROFILE_BANNERS: Array<{ id: RpgBanner; label: string }> = (
  [
    ["perfil", "Pôr do sol do herói"],
    ["dashboard", "Vale do castelo"],
    ["conquistas", "Colina do troféu"],
    ["analytics", "Castelo noturno"],
    ["reino", "Lago do reino"],
    ["missoes", "Estandarte"],
    ["biblioteca", "Torres ao entardecer"],
    ["educacao", "Academia"],
    ["habitos", "Floresta"],
    ["diario", "Pôr do sol"],
  ] as const
).map(([id, label]) => ({ id, label }));

export function unlockedTiers(achievements: Achievement[]): Set<AchievementTier> {
  return new Set(achievements.filter((a) => a.unlockedAt).map((a) => a.tier));
}

export function isFrameUnlocked(frame: FrameId, tiers: Set<AchievementTier>): boolean {
  const f = FRAMES.find((x) => x.id === frame);
  return !f?.requires || tiers.has(f.requires);
}

/** Título equipado válido para o nível atual (ou o maior disponível). */
export function resolveTitle(titleId: string | null, level: number): string {
  const available = TITLES.filter((t) => t.level <= level);
  const chosen = available.find((t) => t.id === titleId);
  return (chosen ?? available[available.length - 1] ?? TITLES[0]).label;
}

export function bannerSrc(id: RpgBanner): string {
  return RPG_BANNERS[id] ?? RPG_BANNERS.dashboard;
}
