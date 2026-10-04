import type { RpgTone } from "@/components/rpg/rpgAssets";
import type { ActionMode, Protocol } from "@/services/protocolsService";

/** Apresentação dos Protocolos (tons, artes e ordenação) — regras ficam no servidor. */
export const CATEGORY_TONE: Record<string, RpgTone> = {
  pessoal: "red",
  produtividade: "purple",
  trabalho: "blue",
  saude: "green",
  academico: "cyan",
  habitos: "orange",
  planejamento: "gold",
  social: "pink",
  "bem-estar": "cyan",
  financas: "gold",
  criatividade: "pink",
  digital: "blue",
};

/** Artes novas ficam em /protocols; as demais reutilizam artes existentes do jogo. */
const REUSED: Record<string, string> = { moon: "/assets/rpg/rewards/moon.webp", map: "/assets/rpg/items/map.webp", campfire: "/assets/rpg/items/campfire.webp", crystal: "/assets/rpg/items/crystal.webp" };
export const PROTOCOL_ARTS = ["moon", "storm", "stage", "heart", "study", "sunrise", "map", "campfire", "meditate", "coins", "crystal", "digital"] as const;
export const protocolArtUrl = (art: string) => REUSED[art] ?? `/assets/rpg/protocols/${art}.webp`;

export const MODE_UI: Record<ActionMode, { label: string; tone: RpgTone; hint: string }> = {
  auto: { label: "Automática", tone: "blue", hint: "Só navegação — não altera seus dados." },
  suggested: { label: "Sugerida", tone: "purple", hint: "Altera dados apenas se você marcar." },
  manual: { label: "Manual", tone: "orange", hint: "Você faz e marca como feito depois." },
};

export type ProtocolFilter = "all" | "mine" | "templates" | "used" | "recent" | "favorites";
export type ProtocolSort = "relevance" | "used" | "recent" | "az";

export function filterProtocols(list: Protocol[], filter: ProtocolFilter): Protocol[] {
  // Em "Todos", a cópia do usuário substitui o template de origem.
  const cloned = new Set(list.filter((p) => p.kind === "mine" && p.sourceTemplate).map((p) => `t:${p.sourceTemplate}`));
  const base = list.filter((p) => !cloned.has(p.ref));
  switch (filter) {
    case "mine":
      return list.filter((p) => p.kind === "mine");
    case "templates":
      return list.filter((p) => p.kind === "template");
    case "used":
      return base.filter((p) => p.uses > 0);
    case "recent":
      return base.filter((p) => p.lastRunAt);
    case "favorites":
      return list.filter((p) => p.favorite);
    default:
      return base;
  }
}

export function sortProtocols(list: Protocol[], sort: ProtocolSort): Protocol[] {
  const by: Record<ProtocolSort, (a: Protocol, b: Protocol) => number> = {
    relevance: (a, b) => b.relevance - a.relevance || b.uses - a.uses,
    used: (a, b) => b.uses - a.uses,
    recent: (a, b) => (b.lastRunAt ?? "").localeCompare(a.lastRunAt ?? ""),
    az: () => 0,
  };
  return [...list].sort((a, b) => by[sort](a, b) || a.name.localeCompare(b.name, "pt-BR"));
}

export function matchesProtocol(p: Protocol, q: string, categoryLabel: (id: string) => string): boolean {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const n = norm(q.trim());
  if (!n) return true;
  return [p.name, p.description, p.triggerDescription, categoryLabel(p.category), ...p.steps.map((s) => s.title)].some((f) => norm(f).includes(n));
}

export function ago(iso: string | null): string {
  if (!iso) return "Nunca usado";
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "Hoje";
  if (days === 1) return "Ontem";
  if (days < 7) return `${days} d atrás`;
  if (days < 30) return `${Math.floor(days / 7)} sem atrás`;
  return `${Math.floor(days / 30)} m atrás`;
}
