import type { AttributeKey, Codex, Rarity } from "@/services/codexService";
import type { CodexSelection } from "@/components/codex/CodexSidebar";
import { relicSrc } from "./codexDisplay";

/**
 * Coleção do Códex ("enciclopédia" estilo Pokédex): junta descobertas,
 * conhecimentos, relíquias e títulos numa lista única e numerada.
 * Nada aqui é inventado — cada entrada é um item real do /api/codex, com
 * o estado vindo do backend (desbloqueado, visto, progresso).
 */

const REF = "/assets/rpg/codex/ref";
export const CODEX_REF = {
  scene: `${REF}/codex-scene.webp`,
  book: `${REF}/codex-book.webp`,
  mobileBanner: `${REF}/codex-mobile-banner.webp`,
  featured: `${REF}/codex-featured.webp`,
  camp: `${REF}/codex-camp.webp`,
  signpost: `${REF}/codex-signpost.webp`,
  chest: `${REF}/codex-chest.webp`,
  locked: `${REF}/codex-disc-locked.webp`,
} as const;

const DISCOVERY_ART = ["sprout", "crystal", "scroll", "flower", "mountain"].map((n) => `${REF}/codex-disc-${n}.webp`);

/** Ícone da categoria de conhecimento por atributo (mesma arte da coleção). */
export const ATTR_COLLECTION_ART: Record<AttributeKey, string> = {
  knowledge: `${REF}/codex-col-education.webp`,
  health: `${REF}/codex-col-health.webp`,
  focus: `${REF}/codex-col-productivity.webp`,
  discipline: `${REF}/codex-col-strategy.webp`,
  creativity: `${REF}/codex-col-mind.webp`,
  wellbeing: `${REF}/codex-col-life.webp`,
};

/** Arte estável por texto (mesma categoria → mesmo ícone em todas as telas). */
export function discoveryArt(category: string): string {
  let h = 0;
  for (const ch of category) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return DISCOVERY_ART[h % DISCOVERY_ART.length];
}

export type EntryKind = "discovery" | "knowledge" | "relic" | "title";
export type EntryState = "locked" | "discovered" | "new";

export interface CodexEntry {
  /** Número na enciclopédia (#001…), estável dentro de cada tipo. */
  no: number;
  key: string;
  kind: EntryKind;
  name: string;
  category: string;
  description: string;
  art: string;
  state: EntryState;
  rarity: Rarity | null;
  /** 0–100 para itens ainda bloqueados (quando o backend informa). */
  progress: number;
  /** Como desbloquear — só para itens bloqueados. */
  hint: string | null;
  at: string | null;
  selection: CodexSelection;
}

export const KIND_LABEL: Record<EntryKind, string> = {
  discovery: "Descoberta",
  knowledge: "Conhecimento",
  relic: "Relíquia",
  title: "Título",
};

export function buildCodexEntries(codex: Codex): CodexEntry[] {
  const attrLabel = new Map(codex.attributes.map((a) => [a.key, a.label]));
  const out: Omit<CodexEntry, "no">[] = [];

  for (const d of codex.discoveries) {
    out.push({
      key: `d-${d.id}`,
      kind: "discovery",
      name: d.title,
      category: d.category,
      description: d.description,
      art: discoveryArt(d.category),
      state: d.seen ? "discovered" : "new",
      rarity: null,
      progress: 100,
      hint: null,
      at: d.discoveredAt,
      selection: { kind: "discovery", item: d },
    });
  }
  for (const k of codex.knowledge) {
    out.push({
      key: `k-${k.id}`,
      kind: "knowledge",
      name: k.title,
      category: attrLabel.get(k.attribute) ?? k.category,
      description: k.summary,
      art: ATTR_COLLECTION_ART[k.attribute],
      state: !k.unlocked ? "locked" : k.seen ? "discovered" : "new",
      rarity: null,
      progress: k.progress,
      hint: k.unlocked ? null : k.unlock.type === "coins" ? `Desbloqueie por ${k.unlock.cost} moedas` : `Requer ${k.unlock.min} XP em ${attrLabel.get(k.attribute) ?? "atributo"}`,
      at: k.unlockedAt,
      selection: { kind: "knowledge", item: k },
    });
  }
  for (const r of codex.relics) {
    out.push({
      key: `r-${r.id}`,
      kind: "relic",
      name: r.name,
      category: "Relíquias",
      description: r.description,
      art: relicSrc(r.id),
      state: !r.unlocked ? "locked" : r.seen ? "discovered" : "new",
      rarity: r.rarity,
      progress: r.progress,
      hint: r.unlocked ? null : r.obtainedBy,
      at: r.unlockedAt,
      selection: { kind: "relic", item: r },
    });
  }
  for (const t of codex.titles) {
    out.push({
      key: `t-${t.id}`,
      kind: "title",
      name: t.name,
      category: "Títulos",
      description: t.description,
      art: `${REF}/codex-disc-scroll.webp`,
      state: !t.unlocked ? "locked" : t.seen ? "discovered" : "new",
      rarity: t.rarity,
      progress: t.progress,
      hint: t.unlocked ? null : t.description,
      at: t.unlockedAt,
      selection: { kind: "title", item: t },
    });
  }
  return out.map((e, i) => ({ ...e, no: i + 1 }));
}

/** Categorias da "Coleção do Códex" — conhecimento por atributo + relíquias + títulos. */
export interface CollectionCategory {
  id: string;
  label: string;
  art: string;
  unlocked: number;
  total: number;
}

export function collectionCategories(codex: Codex): CollectionCategory[] {
  const cats: CollectionCategory[] = codex.attributes.map((a) => {
    const items = codex.knowledge.filter((k) => k.attribute === a.key);
    return { id: a.key, label: a.label, art: ATTR_COLLECTION_ART[a.key], unlocked: items.filter((k) => k.unlocked).length, total: items.length };
  });
  cats.push({ id: "relic", label: "Relíquias", art: `${REF}/codex-disc-crystal.webp`, unlocked: codex.relics.filter((r) => r.unlocked).length, total: codex.relics.length });
  cats.push({ id: "title", label: "Títulos", art: `${REF}/codex-disc-scroll.webp`, unlocked: codex.titles.filter((t) => t.unlocked).length, total: codex.titles.length });
  return cats.filter((c) => c.total > 0);
}

export const entryNo = (n: number) => `#${String(n).padStart(3, "0")}`;
