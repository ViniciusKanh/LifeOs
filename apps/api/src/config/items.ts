import type { Rarity } from "./codex.js";

/**
 * Coleção / Inventário — catálogo central. Itens NUNCA alteram dados reais
 * (sono, exercício, humor, Life Score, métricas): os efeitos são só de
 * gamificação (XP com limite e duração) ou cosméticos. Não há compra com
 * dinheiro real, sorteio ou loot box: todo item nasce de um marco real.
 */

export const ITEM_TYPES = ["consumable", "relic", "cosmetic", "title", "material", "tool", "quest", "reward"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const EFFECT_TYPES = ["XP_MULTIPLIER_FOCUS", "XP_MULTIPLIER_TASK", "INVENTORY_CAPACITY", "REWARD_COUPON", "COSMETIC_UNLOCK"] as const;
export type EffectType = (typeof EFFECT_TYPES)[number];

/** Regras de cada efeito. Iguais não acumulam multiplicativamente. */
export const EFFECT_RULES = {
  XP_MULTIPLIER_FOCUS: { pct: 25, durationMin: 30, stacking: "extend" as const, maxRemainingMin: 90, label: "XP de foco" },
  XP_MULTIPLIER_TASK: { pct: 25, durationMin: 24 * 60, stacking: "block" as const, maxRemainingMin: 24 * 60, label: "XP da próxima missão" },
} as const;
export type TimedEffect = keyof typeof EFFECT_RULES;

export interface ItemDef {
  id: string;
  name: string;
  description: string;
  type: Exclude<ItemType, "relic" | "title" | "cosmetic" | "reward" | "quest">;
  rarity: Rarity;
  art: string;
  stackable: boolean;
  maxStack: number;
  /** Texto do efeito (sempre de gamificação). */
  effectText: string | null;
  durationText: string | null;
  effect: { type: EffectType; value: number; passive?: boolean } | null;
  obtainedBy: string;
}

export const ITEM_CATALOG: ItemDef[] = [
  {
    id: "pocao-foco",
    name: "Poção de Foco",
    description: "Um gole antes da sessão de concentração.",
    type: "consumable",
    rarity: "common",
    art: "potion",
    stackable: true,
    maxStack: 99,
    effectText: "+25% XP em sessões de foco",
    durationText: "30 min",
    effect: { type: "XP_MULTIPLIER_FOCUS", value: 25 },
    obtainedBy: "1 a cada nível alcançado",
  },
  {
    id: "pergaminho-disciplina",
    name: "Pergaminho da Disciplina",
    description: "Fortalece a disciplina para concluir a próxima missão.",
    type: "consumable",
    rarity: "rare",
    art: "scroll",
    stackable: true,
    maxStack: 99,
    effectText: "+25% XP na próxima missão concluída",
    durationText: "até 24 h",
    effect: { type: "XP_MULTIPLIER_TASK", value: 25 },
    obtainedBy: "A cada 3 níveis e 2 por campanha concluída",
  },
  {
    id: "mochila-explorador",
    name: "Mochila de Explorador",
    description: "Espaço extra para os tesouros da jornada.",
    type: "tool",
    rarity: "legendary",
    art: "backpack",
    stackable: false,
    maxStack: 1,
    effectText: "+50 espaços no inventário (visual)",
    durationText: "Passivo",
    effect: { type: "INVENTORY_CAPACITY", value: 50, passive: true },
    obtainedBy: "Alcançar o nível 5",
  },
  {
    id: "lanterna-explorador",
    name: "Lanterna do Explorador",
    description: "Ilumina as longas sessões de trabalho profundo.",
    type: "tool",
    rarity: "rare",
    art: "lantern",
    stackable: false,
    maxStack: 1,
    effectText: "Colecionável do Conjunto do Explorador",
    durationText: "Passivo",
    effect: null,
    obtainedBy: "25 sessões de foco registradas",
  },
  {
    id: "kit-acampamento",
    name: "Kit de Acampamento",
    description: "Para descansar e recomeçar depois de uma grande campanha.",
    type: "tool",
    rarity: "common",
    art: "campfire",
    stackable: false,
    maxStack: 1,
    effectText: "Colecionável do Conjunto do Explorador",
    durationText: "Passivo",
    effect: null,
    obtainedBy: "Concluir a primeira campanha",
  },
  {
    id: "fragmento-cristal",
    name: "Fragmento de Cristal",
    description: "Lascas de clareza deixadas por cada marco e conquista.",
    type: "material",
    rarity: "uncommon",
    art: "crystal",
    stackable: true,
    maxStack: 999,
    effectText: null,
    durationText: null,
    effect: null,
    obtainedBy: "Marcos de campanha e conquistas",
  },
  {
    id: "pena-escriba",
    name: "Pena de Escriba",
    description: "Guardada a cada dez crônicas escritas no Diário.",
    type: "material",
    rarity: "common",
    art: "quill",
    stackable: true,
    maxStack: 999,
    effectText: null,
    durationText: null,
    effect: null,
    obtainedBy: "A cada 10 entradas do Diário",
  },
];

export const itemDef = (id: string) => ITEM_CATALOG.find((i) => i.id === id) ?? null;

/** Molduras do perfil: cosméticos liberados por conquistas oficiais (mesma regra do Perfil). */
export const FRAME_ITEMS = [
  { id: "bronze", name: "Moldura de Bronze", rarity: "common" as Rarity, requires: null as string | null, obtainedBy: "Disponível desde o início" },
  { id: "silver", name: "Moldura de Prata", rarity: "uncommon" as Rarity, requires: "silver", obtainedBy: "Uma conquista de prata" },
  { id: "gold", name: "Moldura de Ouro", rarity: "epic" as Rarity, requires: "gold", obtainedBy: "Uma conquista de ouro" },
  { id: "rare", name: "Moldura Arcana", rarity: "legendary" as Rarity, requires: "platinum", obtainedBy: "Uma conquista de platina" },
];

/** Conjuntos: bônus SEMPRE cosmético (emblema equipável no perfil). */
export interface SetDef {
  id: string;
  name: string;
  description: string;
  /** Chaves de item: catálogo (id), relic:<id>, title:<id>. */
  items: string[];
  emblem: { name: string; rarity: Rarity };
}
export const ITEM_SETS: SetDef[] = [
  {
    id: "explorador",
    name: "Conjunto do Explorador",
    description: "Para quem desbrava longas jornadas.",
    items: ["mochila-explorador", "lanterna-explorador", "kit-acampamento", "relic:bussola"],
    emblem: { name: "Emblema do Explorador", rarity: "epic" },
  },
  {
    id: "disciplina",
    name: "Conjunto da Disciplina",
    description: "Constância transformada em hábito.",
    items: ["pergaminho-disciplina", "relic:ampulheta", "relic:grimorio", "title:guardiao"],
    emblem: { name: "Emblema da Disciplina", rarity: "legendary" },
  },
  {
    id: "alquimista",
    name: "Conjunto do Alquimista",
    description: "Hipóteses, foco e clareza.",
    items: ["pocao-foco", "fragmento-cristal", "relic:frasco", "title:alquimista-foco"],
    emblem: { name: "Emblema do Alquimista", rarity: "rare" },
  },
];

export const INVENTORY_RULES = {
  /** Capacidade é só métrica visual nesta versão — nunca bloqueia nem é vendida. */
  baseCapacity: 100,
  grants: {
    potionPerLevel: 1,
    scrollEveryLevels: 3,
    scrollsPerCampaign: 2,
    backpackLevel: 5,
    lanternFocusSessions: 25,
    penEveryJournalEntries: 10,
  },
} as const;
