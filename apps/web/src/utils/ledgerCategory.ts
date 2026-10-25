import { BookOpen, Flame, FlaskConical, Landmark, LayoutGrid, ScrollText, ShoppingBag, Sparkles, Target, Timer, Trophy, type LucideIcon } from "lucide-react";
import type { RpgTone } from "@/components/rpg";

/**
 * Categoria visual de cada movimentação do extrato (coin_ledger), derivada
 * do `source_type` real gravado pelo backend -- nunca inventa uma origem,
 * só agrupa o catálogo já existente (gamificationService.award + Banco +
 * Tesouro) em grupos com ícone/cor do design system, pro extrato ficar
 * legível num relance (item D.10 da análise de mercado).
 */
export interface LedgerCategory {
  key: string;
  label: string;
  icon: LucideIcon;
  tone: RpgTone;
  /** source_type reais que caem nesta categoria -- usado no filtro (bank.routes GET /ledger?sourceTypes=). */
  sourceTypes: string[];
}

export const LEDGER_CATEGORIES: LedgerCategory[] = [
  { key: "missoes", label: "Missões", icon: ScrollText, tone: "purple", sourceTypes: ["task", "quest", "contract", "project", "milestone", "set", "life_admin", "day"] },
  { key: "habitos", label: "Hábitos", icon: Flame, tone: "green", sourceTypes: ["habit", "habit_entry", "habit_streak"] },
  { key: "foco", label: "Foco", icon: Timer, tone: "cyan", sourceTypes: ["focus", "focus_count"] },
  { key: "educacao", label: "Educação & Diário", icon: BookOpen, tone: "pink", sourceTypes: ["journal", "journal_count", "review"] },
  { key: "experimentos", label: "Experimentos", icon: FlaskConical, tone: "cyan", sourceTypes: ["experiment"] },
  { key: "conquistas", label: "Conquistas & Nível", icon: Trophy, tone: "gold", sourceTypes: ["achievement", "level"] },
  { key: "campanhas", label: "Campanhas & Códex", icon: Sparkles, tone: "purple", sourceTypes: ["campaign", "grimoire", "codex"] },
  { key: "loja", label: "Loja & Tesouro", icon: ShoppingBag, tone: "orange", sourceTypes: ["treasure", "redemption"] },
  { key: "banco", label: "Banco", icon: Landmark, tone: "blue", sourceTypes: ["bank", "bank_deposit", "bank_loan"] },
];

const SOURCE_TO_CATEGORY = new Map<string, LedgerCategory>(
  LEDGER_CATEGORIES.flatMap((cat) => cat.sourceTypes.map((s) => [s, cat] as const)),
);

const FALLBACK_CATEGORY: LedgerCategory = { key: "outros", label: "Outros", icon: LayoutGrid, tone: "muted", sourceTypes: [] };

/** Categoria visual de um `source_type` real do extrato -- "Outros" para qualquer valor fora do catálogo conhecido. */
export function ledgerCategoryOf(sourceType: string): LedgerCategory {
  return SOURCE_TO_CATEGORY.get(sourceType) ?? FALLBACK_CATEGORY;
}

/** Ícone+tom de uma categoria pelo próprio key (ex.: vindo do filtro selecionado). */
export function ledgerCategoryByKey(key: string): LedgerCategory | undefined {
  return LEDGER_CATEGORIES.find((c) => c.key === key);
}
