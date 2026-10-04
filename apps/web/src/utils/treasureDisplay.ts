import type { LimitPeriod, Reward, RewardArt, RewardCategory, RewardRarity } from "@/services/gamificationService";
import type { RpgTone } from "@/components/rpg/rpgAssets";

/**
 * Apresentação do Tesouro (rótulos, tons, artes, agrupamento e ordenação).
 * Regras de disponibilidade vêm sempre do backend (reward.availability).
 */

export const RARITY: Record<RewardRarity, { label: string; tone: RpgTone }> = {
  comum: { label: "Comum", tone: "muted" },
  incomum: { label: "Incomum", tone: "green" },
  raro: { label: "Raro", tone: "blue" },
  epico: { label: "Épico", tone: "purple" },
  lendario: { label: "Lendário", tone: "gold" },
};
export const RARITY_ORDER: RewardRarity[] = ["comum", "incomum", "raro", "epico", "lendario"];

/** Abas de filtro → categorias (as antigas da Loja caem no grupo mais próximo). */
export const CATEGORY_GROUPS = [
  { id: "descanso", label: "Descanso", members: ["descanso"] },
  { id: "diversao", label: "Diversão", members: ["diversao", "lazer", "experiencia"] },
  { id: "autocuidado", label: "Autocuidado", members: ["autocuidado", "comida"] },
  { id: "social", label: "Social", members: ["social"] },
  { id: "premium", label: "Premium", members: ["premium"] },
  { id: "personalizado", label: "Personalizado", members: ["personalizado", "compras", "outro"] },
] as const;
export type CategoryGroup = (typeof CATEGORY_GROUPS)[number]["id"];

export function categoryGroup(category: RewardCategory): CategoryGroup {
  return CATEGORY_GROUPS.find((g) => (g.members as readonly string[]).includes(category))?.id ?? "personalizado";
}
export const categoryLabel = (category: RewardCategory) => CATEGORY_GROUPS.find((g) => g.id === categoryGroup(category))!.label;

/** Arte padrão por categoria quando a recompensa não escolheu uma. */
const CATEGORY_ART: Record<CategoryGroup, RewardArt> = { descanso: "moon", diversao: "tv", autocuidado: "spa", social: "pizza", premium: "travel", personalizado: "gift" };
export const ART_LABEL: Record<RewardArt, string> = {
  tv: "Tela/filme",
  dessert: "Sobremesa",
  pizza: "Pizza",
  gamepad: "Videogame",
  trail: "Passeio",
  moon: "Descanso",
  spa: "Spa",
  travel: "Viagem",
  coffee: "Café",
  book: "Livro",
  music: "Música",
  gift: "Presente",
};

export function rewardArtUrl(art: string | null | undefined, category?: RewardCategory): string {
  const id = art && art in ART_LABEL ? art : category ? CATEGORY_ART[categoryGroup(category)] : "gift";
  return `/assets/rpg/rewards/${id}.webp`;
}

export const LIMIT_LABEL: Record<LimitPeriod, string> = { none: "Sem limite", day: "1 por dia", week: "1 por semana", month: "1 por mês" };

/** Linha de limite/recarga do card ("∞ Sem limite", "1 por semana", "Recarga de 12h", "3/5"). */
export function limitText(r: Pick<Reward, "limitPeriod" | "cooldownHours" | "redemptionLimit" | "timesRedeemed">): string {
  const parts: string[] = [];
  if (r.limitPeriod !== "none") parts.push(LIMIT_LABEL[r.limitPeriod]);
  else if (r.cooldownHours > 0) parts.push(`Recarga de ${r.cooldownHours}h`);
  if (r.redemptionLimit != null) parts.push(`${r.timesRedeemed}/${r.redemptionLimit} usos`);
  return parts.length > 0 ? parts.join(" · ") : "Sem limite";
}

/** Requisito real exibido no badge roxo (nunca "XP ganho" — resgatar não dá XP). */
export function requirementText(r: Pick<Reward, "requiredLevel" | "requiredXp" | "requiredAchievementId">): string {
  if (r.requiredLevel) return `Nv. ${r.requiredLevel}+`;
  if (r.requiredXp) return `${r.requiredXp.toLocaleString("pt-BR")} XP total`;
  if (r.requiredAchievementId) return "Conquista";
  return "Sem requisito";
}

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(today.getTime() - 86_400_000);
  const hm = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return `Hoje ${hm}`;
  if (d.toDateString() === yest.toDateString()) return `Ontem ${hm}`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export type SortKey = "relevantes" | "baratas" | "caras" | "raras" | "recentes";
export const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: "relevantes", label: "Mais relevantes" },
  { id: "baratas", label: "Mais baratas" },
  { id: "caras", label: "Mais caras" },
  { id: "raras", label: "Mais raras" },
  { id: "recentes", label: "Mais recentes" },
];

/**
 * "Mais relevantes" é determinístico: disponíveis → favoritas → categorias
 * que o usuário mais resgata → mais perto de liberar → raridade → nome.
 */
export function sortRewards(list: Reward[], sort: SortKey, groupScore: Partial<Record<CategoryGroup, number>> = {}): Reward[] {
  const rarity = (r: Reward) => RARITY_ORDER.indexOf(r.rarity);
  const by: Record<SortKey, (a: Reward, b: Reward) => number> = {
    relevantes: (a, b) =>
      Number(b.availability.available) - Number(a.availability.available) ||
      Number(b.isFavorite) - Number(a.isFavorite) ||
      (groupScore[categoryGroup(b.category)] ?? 0) - (groupScore[categoryGroup(a.category)] ?? 0) ||
      a.availability.missingCoins + a.availability.missingGems * 10 - (b.availability.missingCoins + b.availability.missingGems * 10) ||
      rarity(b) - rarity(a) ||
      a.name.localeCompare(b.name, "pt-BR"),
    baratas: (a, b) => a.cost - b.cost || a.name.localeCompare(b.name, "pt-BR"),
    caras: (a, b) => b.cost - a.cost || a.name.localeCompare(b.name, "pt-BR"),
    raras: (a, b) => rarity(b) - rarity(a) || a.cost - b.cost,
    recentes: (a, b) => b.createdAt.localeCompare(a.createdAt),
  };
  return [...list].sort(by[sort]);
}

/** Busca por nome, descrição, categoria e tags (sem acento/caixa). */
export function matchesQuery(r: Reward, q: string): boolean {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const needle = norm(q.trim());
  if (!needle) return true;
  return [r.name, r.description ?? "", categoryLabel(r.category), ...r.tags].some((f) => norm(f).includes(needle));
}

/** Faixa de preço sugerida por porte (referência; o usuário decide). */
export function suggestedPrice(bands: Record<"pequena" | "media" | "grande" | "premium", [number, number]> | undefined, group: CategoryGroup): [number, number] | null {
  if (!bands) return null;
  if (group === "premium") return bands.premium;
  if (group === "social") return bands.grande;
  if (group === "descanso") return bands.media;
  return bands.pequena;
}
