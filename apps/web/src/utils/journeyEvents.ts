import type { TimelineEvent } from "@/types";

/**
 * Crônica 2.0 — regras de apresentação sobre o histórico canônico
 * (/analytics/timeline). Nada aqui cria eventos: só classifica, agrupa e filtra.
 */

export const TYPE_MODULE: Record<string, string> = {
  task: "Missões",
  focus: "Missões",
  project: "Projetos",
  habit: "Hábitos",
  workout: "Saúde",
  sleep: "Saúde",
  mood: "Saúde",
  water: "Saúde",
  recovery: "Saúde",
  reading: "Biblioteca",
  education: "Educação",
  grimoire: "Grimório",
  work_note: "Profissional",
  experiment: "Laboratório",
  journal: "Diário",
  life_admin: "Administração",
  review: "Revisões",
  war_council: "Conselho",
  contract: "Contratos",
  campaign: "Forja",
  codex: "Códex",
  achievement: "Conquistas",
  reward: "Tesouro",
  inventory: "Coleção",
  level_up: "Perfil",
  archetype: "Build",
  season: "Temporada",
  protocol: "Protocolos",
  guild: "Guilda",
  bank: "Banco",
};
export const moduleOf = (e: TimelineEvent) => TYPE_MODULE[e.type] ?? "Outros";

/** Eventos especiais (destaque na linha do tempo e nos Marcos). */
export function isSpecial(e: TimelineEvent): boolean {
  if (["level_up", "archetype", "season", "project"].includes(e.type)) return true;
  if (e.type === "achievement") return e.tier === "gold" || e.tier === "platinum" || String(e.id).startsWith("custom-");
  if (e.type === "campaign") return e.kind === "completed" || e.kind === "milestone";
  if (e.type === "experiment") return /conclu/i.test(e.label);
  if (e.type === "codex") return e.kind === "relic" || e.kind === "title";
  if (e.type === "inventory") return e.icon === "🏅";
  if (e.type === "education") return true;
  return false;
}

/** Referência estável do evento original ("tipo:id"), usada pelos favoritos. */
export function eventKey(e: TimelineEvent): string {
  return `${e.type}:${String(e.id).replace(/[^A-Za-z0-9_:.-]/g, "_").slice(0, 120)}`;
}

export type Impact = "all" | "reward" | "high" | "special";
export interface JourneyFilters {
  module: string;
  type: string;
  impact: Impact;
  favorites: boolean;
  query: string;
}
export const EMPTY_FILTERS: JourneyFilters = { module: "all", type: "all", impact: "all", favorites: false, query: "" };

export function filterEvents(events: TimelineEvent[], f: JourneyFilters, favs: Set<string>): TimelineEvent[] {
  const q = f.query.trim().toLowerCase();
  return events.filter(
    (e) =>
      (f.module === "all" || moduleOf(e) === f.module) &&
      (f.type === "all" || e.type === f.type) &&
      (f.impact === "all" ||
        (f.impact === "reward" && ((e.xp ?? 0) > 0 || (e.coins ?? 0) > 0)) ||
        (f.impact === "high" && ((e.xp ?? 0) >= 50 || isSpecial(e))) ||
        (f.impact === "special" && isSpecial(e))) &&
      (!f.favorites || favs.has(eventKey(e))) &&
      (!q || e.label.toLowerCase().includes(q)),
  );
}

export type JourneyItem = { kind: "single"; event: TimelineEvent } | { kind: "group"; key: string; type: string; label: string; icon: string; events: TimelineEvent[]; xp: number; coins: number; at: string };

const GROUP_MIN = 3;
const GROUP_LABEL: Record<string, (n: number, evs: TimelineEvent[]) => string> = {
  water: (n, evs) => `Água: ${n} registros (${evs.reduce((s, e) => s + Number(e.amount_ml ?? 0), 0)} ml)`,
  habit: (n) => `${n} hábitos cumpridos`,
  task: (n) => `${n} missões concluídas`,
  reading: (n, evs) => `${n} sessões de leitura (${evs.reduce((s, e) => s + Number(e.pages_read ?? 0), 0)} páginas)`,
  focus: (n, evs) => `${n} sessões de foco (${evs.reduce((s, e) => s + Number(e.duration_minutes ?? 0), 0)} min)`,
  mood: (n) => `${n} check-ins de humor`,
};

/**
 * Agrupa eventos do mesmo tipo no mesmo dia (3+), mantendo cada registro
 * acessível dentro do grupo. Eventos especiais nunca são agrupados.
 */
export function groupDay(events: TimelineEvent[]): JourneyItem[] {
  const byType = new Map<string, TimelineEvent[]>();
  for (const e of events) if (!isSpecial(e)) byType.set(e.type, [...(byType.get(e.type) ?? []), e]);
  const grouped = new Set<string>([...byType].filter(([, l]) => l.length >= GROUP_MIN).map(([t]) => t));
  const out: JourneyItem[] = [];
  const emitted = new Set<string>();
  for (const e of events) {
    if (!grouped.has(e.type) || isSpecial(e)) {
      out.push({ kind: "single", event: e });
      continue;
    }
    if (emitted.has(e.type)) continue;
    emitted.add(e.type);
    const evs = byType.get(e.type)!;
    const label = GROUP_LABEL[e.type]?.(evs.length, evs) ?? `${evs.length}× ${e.label}`;
    out.push({
      kind: "group",
      key: `${e.type}-${String(evs[0]!.id)}`,
      type: e.type,
      label,
      icon: e.icon,
      events: evs,
      xp: evs.reduce((s, x) => s + (x.xp ?? 0), 0),
      coins: evs.reduce((s, x) => s + (x.coins ?? 0), 0),
      at: e.at,
    });
  }
  return out;
}
