import type { RpgTone } from "@/components/rpg/rpgAssets";
import type { ArtSet, InventoryItem, ItemRarity, ItemType } from "@/services/inventoryService";

/**
 * Apresentação da Coleção / Inventário (rótulos, tons e ordenação).
 * Regras (posse, efeitos, ações válidas) vêm sempre do servidor.
 */

/** Tokens de raridade do inventário: comum neutro, incomum azul, raro ciano, épico magenta, lendário dourado. */
export const ITEM_RARITY: Record<ItemRarity, { label: string; tone: RpgTone }> = {
  common: { label: "Comum", tone: "green" },
  uncommon: { label: "Incomum", tone: "blue" },
  rare: { label: "Raro", tone: "cyan" },
  epic: { label: "Épico", tone: "pink" },
  legendary: { label: "Lendário", tone: "gold" },
};
export const RARITY_RANK: ItemRarity[] = ["common", "uncommon", "rare", "epic", "legendary"];

export const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  consumable: "Consumível",
  relic: "Relíquia",
  cosmetic: "Cosmético",
  title: "Título",
  material: "Material",
  tool: "Ferramenta",
  quest: "Missão",
  reward: "Recompensa",
};
/** Ordem das abas (como na referência); só aparecem as que têm itens. */
export const TYPE_TABS: Array<{ id: ItemType; label: string }> = [
  { id: "consumable", label: "Consumíveis" },
  { id: "relic", label: "Relíquias" },
  { id: "cosmetic", label: "Cosméticos" },
  { id: "title", label: "Títulos" },
  { id: "material", label: "Materiais" },
  { id: "tool", label: "Ferramentas" },
  { id: "quest", label: "Missão" },
  { id: "reward", label: "Recompensas" },
];

export const ORIGIN_LABEL: Record<string, string> = {
  level: "Nível",
  campaign: "Campanha",
  milestone: "Marco de campanha",
  achievement: "Conquista",
  codex: "Códex",
  treasure: "Tesouro",
  focus_count: "Foco",
  journal_count: "Diário",
  set: "Conjunto",
  profile: "Perfil",
};

export function itemArtUrl(art: string, set: ArtSet): string {
  if (set === "rewards") return `/assets/rpg/rewards/${art}.webp`;
  if (set === "codex") return `/assets/rpg/codex/${art}.webp`;
  return `/assets/rpg/items/${art}.webp`;
}

/** Relíquias do Códex são quadradas: aparecem inteiras (contain) em molduras retangulares. */
export const artFit = (set: ArtSet) => (set === "codex" ? "object-contain p-1.5" : "object-cover");

export type ItemSort = "recent" | "oldest" | "rarest" | "used" | "quantity" | "az";
export const ITEM_SORTS: Array<{ id: ItemSort; label: string }> = [
  { id: "recent", label: "Mais recentes" },
  { id: "oldest", label: "Mais antigos" },
  { id: "rarest", label: "Mais raros" },
  { id: "used", label: "Mais usados" },
  { id: "quantity", label: "Quantidade" },
  { id: "az", label: "A-Z" },
];

/** Favoritos sempre primeiro; depois o critério escolhido (determinístico). */
export function sortItems(list: InventoryItem[], sort: ItemSort): InventoryItem[] {
  const t = (i: InventoryItem) => i.lastAcquiredAt ?? i.acquiredAt ?? "";
  const by: Record<ItemSort, (a: InventoryItem, b: InventoryItem) => number> = {
    recent: (a, b) => t(b).localeCompare(t(a)),
    oldest: (a, b) => (a.acquiredAt ?? "").localeCompare(b.acquiredAt ?? ""),
    rarest: (a, b) => RARITY_RANK.indexOf(b.rarity) - RARITY_RANK.indexOf(a.rarity),
    used: (a, b) => b.useCount - a.useCount,
    quantity: (a, b) => b.quantity - a.quantity,
    az: () => 0,
  };
  return [...list].sort((a, b) => Number(b.favorite) - Number(a.favorite) || by[sort](a, b) || a.name.localeCompare(b.name, "pt-BR"));
}

export function matchesItemQuery(i: InventoryItem, q: string): boolean {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const n = norm(q.trim());
  if (!n) return true;
  return [i.name, i.description, ITEM_TYPE_LABEL[i.type], i.effectText ?? "", i.origin?.label ?? ""].some((f) => norm(f).includes(n));
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const min = Math.round(diff / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min atrás`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} hora${h > 1 ? "s" : ""} atrás`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} dia${d > 1 ? "s" : ""} atrás`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "—");

/** Texto do botão principal do card conforme a ação válida (nunca mostra ação inválida). */
export function primaryAction(i: InventoryItem): { kind: "use" | "equip" | "unequip" | "origin" | "details"; label: string } {
  if (i.actions.includes("use")) return { kind: "use", label: "Usar" };
  if (i.actions.includes("equip")) return { kind: "equip", label: "Equipar" };
  if (i.actions.includes("unequip")) return { kind: "unequip", label: "Remover" };
  if (i.type === "relic" && i.origin?.link) return { kind: "origin", label: "Ver origem" };
  return { kind: "details", label: "Detalhes" };
}
