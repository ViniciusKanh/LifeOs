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

/** Quem faz cada passo, em linguagem simples. */
export const MODE_UI: Record<ActionMode, { label: string; tone: RpgTone; hint: string }> = {
  auto: { label: "Abre uma tela", tone: "blue", hint: "O LifeOS só leva você até a tela certa — nada é alterado." },
  suggested: { label: "LifeOS faz", tone: "purple", hint: "O LifeOS faz por você (cria, adia, ajusta) — só se você deixar marcado." },
  manual: { label: "Você faz", tone: "orange", hint: "Algo fora do app: você faz e marca como feito depois." },
};

/** "45 min" / "1 h 10 min" — duração total de um protocolo. */
export function formatMinutes(total: number): string {
  if (total <= 0) return "sem tempo definido";
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * Título exibido de um passo. Passos legados START_FOCUS (o módulo Foco foi
 * removido) aparecem como "Bloco de trabalho de N min" quando o título ainda
 * fala em foco; títulos personalizados pelo usuário são mantidos.
 */
export function stepDisplayTitle(s: { actionType: string; title: string; config?: Record<string, unknown>; details?: Record<string, unknown>; minutes?: number }): string {
  if (s.actionType !== "START_FOCUS" || !/foco|focus/i.test(s.title)) return s.title;
  const raw = s.config?.minutes ?? s.details?.minutes ?? s.minutes;
  const min = typeof raw === "number" && raw > 0 ? raw : null;
  return min ? `Bloco de trabalho de ${min} min` : "Bloco de trabalho";
}

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
