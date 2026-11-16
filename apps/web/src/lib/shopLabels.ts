import type { RpgTone } from "@/components/rpg/rpgAssets";
import type { ShopCategory, ShopRarity } from "@/services/shopService";

/**
 * Rótulos/ícones/tons da Loja Arcana — centralizados aqui porque eram
 * copiados em cada tela (Loja, Inventário do Herói, admin de produtos).
 */
export const CATEGORY_LABEL: Record<ShopCategory, string> = {
  pocoes: "Poções",
  vestimentas: "Vestimentas",
  artefatos: "Artefatos",
  personalizacao: "Personalização",
  boosters: "Boosters",
  decoracao: "Decoração",
  reliquias: "Relíquias",
  materiais: "Materiais",
  pacotes: "Pacotes",
};

export const CATEGORY_ICON: Record<ShopCategory, string> = {
  pocoes: "🧪",
  vestimentas: "🧥",
  artefatos: "🔮",
  personalizacao: "🎨",
  boosters: "⚡",
  decoracao: "🏺",
  reliquias: "💎",
  materiais: "🧵",
  pacotes: "📦",
};

export const RARITY_LABEL: Record<ShopRarity, { label: string; tone: RpgTone }> = {
  comum: { label: "Comum", tone: "muted" },
  incomum: { label: "Incomum", tone: "green" },
  raro: { label: "Raro", tone: "blue" },
  epico: { label: "Épico", tone: "purple" },
  lendario: { label: "Lendário", tone: "gold" },
  mitico: { label: "Mítico", tone: "pink" },
};
