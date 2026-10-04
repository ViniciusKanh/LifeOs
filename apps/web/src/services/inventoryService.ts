import { api } from "./api";

/** Espelho de /api/inventory (o servidor sincroniza os itens a partir de marcos reais). */
export const ITEM_TYPES = ["consumable", "relic", "cosmetic", "title", "material", "tool", "quest", "reward"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];
export type ItemRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type ItemAction = "use" | "equip" | "unequip";
export type ArtSet = "items" | "rewards" | "codex";

export interface InventoryItem {
  key: string;
  name: string;
  description: string;
  type: ItemType;
  rarity: ItemRarity;
  art: string;
  artSet: ArtSet;
  quantity: number;
  stackable: boolean;
  maxStack: number;
  effectText: string | null;
  durationText: string | null;
  obtainedBy: string | null;
  origin: { sourceType: string; label: string | null; at: string | null; link: string | null } | null;
  acquiredAt: string | null;
  lastAcquiredAt: string | null;
  useCount: number;
  favorite: boolean;
  archived: boolean;
  equipped: boolean;
  actions: ItemAction[];
  locked: boolean;
}

export interface ActiveEffect {
  id: string;
  itemKey: string;
  effectType: "XP_MULTIPLIER_FOCUS" | "XP_MULTIPLIER_TASK";
  value: number;
  label: string;
  startedAt: string;
  expiresAt: string;
}

export interface InventorySet {
  id: string;
  name: string;
  description: string;
  owned: number;
  total: number;
  items: Array<{ key: string; name: string; art: string; artSet: "items" | "codex"; owned: boolean }>;
  bonus: string;
  complete: boolean;
}

export interface InventoryRecent {
  key: string;
  name: string;
  rarity: ItemRarity;
  art: string;
  artSet: ArtSet;
  at: string;
  label: string | null;
}

export interface InventoryData {
  items: InventoryItem[];
  kpis: { totalItems: number; rareRelics: number; consumables: number; cosmetics: number; slotsUsed: number; capacity: number; activeBonuses: number };
  counts: Partial<Record<ItemType | "all", number>>;
  effects: ActiveEffect[];
  sets: InventorySet[];
  recent: InventoryRecent[];
  equipped: { title: string | null; frame: string; emblem: string | null };
}

export type InventoryHistoryType = "acquire" | "use" | "equip";
export interface InventoryHistoryRow {
  id: string;
  itemKey: string;
  itemName: string;
  type: "acquire" | "use" | "equip" | "unequip" | "remove" | "adjustment";
  quantity: number;
  sourceType: string;
  label: string | null;
  at: string;
}

export interface ActionResponse {
  ok: true;
  replayed?: boolean;
  message: string;
}

export const inventoryService = {
  get: () => api.get<InventoryData>("/inventory"),
  history: (type?: InventoryHistoryType, limit = 150) => api.get<InventoryHistoryRow[]>(`/inventory/history?limit=${limit}${type ? `&type=${type}` : ""}`),
  /** `requestId` torna o uso idempotente (clique duplo não consome duas vezes). */
  use: (itemKey: string, requestId: string) => api.post<ActionResponse>("/inventory/use", { itemKey, requestId }),
  equip: (itemKey: string, equip: boolean) => api.post<ActionResponse>("/inventory/equip", { itemKey, equip }),
  flags: (itemKey: string, flags: { favorite?: boolean; archived?: boolean }) => api.post<ActionResponse>("/inventory/flags", { itemKey, ...flags }),
};
