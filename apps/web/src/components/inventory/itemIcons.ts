import { Crown, FlaskConical, Gift, Layers, LayoutGrid, Map, Shirt, Sparkles, Wrench, type LucideIcon } from "lucide-react";
import type { ItemType } from "@/services/inventoryService";

/** Ícone de cada tipo de item (abas, badges e listas usam o mesmo mapa). */
export const ITEM_TYPE_ICON: Record<ItemType | "all", LucideIcon> = {
  all: LayoutGrid,
  consumable: FlaskConical,
  relic: Sparkles,
  cosmetic: Shirt,
  title: Crown,
  material: Layers,
  tool: Wrench,
  quest: Map,
  reward: Gift,
};
