import { BookOpen, CalendarDays, CheckSquare, Flame, GraduationCap, HeartPulse, Leaf, Moon, Repeat, Sun, Zap, type LucideIcon } from "lucide-react";
import type { RpgTone } from "@/components/rpg";
import type { AlgorithmId, ArtifactIcon, Rarity } from "@/services/intelligenceService";

/** Apresentação da Forja da Inteligência (rótulos, cores e ícones). Nenhum número é calculado aqui. */

export const HERO_ART = "/assets/rpg/intelligence-hero.webp";
export const CORE_ART = "/assets/rpg/intelligence-core.webp";

export const RARITY_UI: Record<Rarity, { label: string; tone: RpgTone }> = {
  common: { label: "Comum", tone: "muted" },
  uncommon: { label: "Incomum", tone: "green" },
  rare: { label: "Raro", tone: "blue" },
  epic: { label: "Épico", tone: "purple" },
  legendary: { label: "Lendário", tone: "gold" },
};

export const ARTIFACT_ICON: Record<ArtifactIcon, { icon: LucideIcon; tone: RpgTone }> = {
  sun: { icon: Sun, tone: "gold" },
  leaf: { icon: Leaf, tone: "green" },
  flame: { icon: Flame, tone: "orange" },
  bolt: { icon: Zap, tone: "cyan" },
  book: { icon: GraduationCap, tone: "blue" },
};

export const STATUS_UI = {
  production: { label: "Produção", tone: "green" as RpgTone },
  experimental: { label: "Experimental", tone: "orange" as RpgTone },
};

/** Ícone por fonte da runa (feature). */
export const SOURCE_ICON: Record<string, LucideIcon> = {
  saude: HeartPulse,
  foco: Flame,
  tarefas: CheckSquare,
  habitos: Repeat,
  educacao: GraduationCap,
  leitura: BookOpen,
  calendario: CalendarDays,
};
export const RUNE_ICON: Record<string, LucideIcon> = { sleep_duration: Moon, sleep_quality: Moon, energy: Zap };

export const ALGO_SHORT: Record<AlgorithmId, string> = {
  baseline: "Linha de base",
  logistic: "Reg. Logística",
  naive_bayes: "Naive Bayes",
  knn: "k-NN",
  tree: "Árvore",
};

export const pct = (v: number | null | undefined, digits = 0) => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(digits).replace(".", ",")}%`);
export const num = (v: number) => v.toLocaleString("pt-BR");

/** Glossário: linguagem do Aventureiro → termo técnico do Cientista. */
export const GLOSSARY = {
  precision: "Precisão = acerto geral (accuracy) na validação temporal.",
  balance: "Equilíbrio = acurácia balanceada: média do acerto nos dias positivos e negativos.",
  confidence: "Confiança = Brier Skill Score: quanto as probabilidades são melhores que chutar a taxa-base (0% = igual ao acaso).",
};
