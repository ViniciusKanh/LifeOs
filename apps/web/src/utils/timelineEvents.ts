import type { TimelineEvent } from "@/types";

/**
 * Para onde navegar ao clicar num evento da Timeline. A maioria dos tipos
 * só tem um módulo de destino (sem id do item específico no payload); os
 * poucos que carregam o id real da entidade (projeto, campanha, experimento)
 * usam uma função que monta o link com esse id.
 */
const TYPE_ROUTE: Record<TimelineEvent["type"], string | ((e: TimelineEvent) => string)> = {
  task: "/tarefas",
  habit: "/habitos",
  workout: "/saude",
  reading: "/biblioteca",
  education: "/educacao",
  sleep: "/saude",
  mood: "/saude",
  water: "/saude",
  work_note: "/profissional",
  experiment: (e) => (e.id ? `/experimentos/${e.id}` : "/experimentos"),
  journal: "/diario",
  life_admin: "/administracao",
  review: "/revisoes",
  focus: "/tarefas",
  project: (e) => (e.id ? `/projetos/${e.id}` : "/projetos"),
  contract: "/contratos",
  campaign: (e) => (typeof e.campaign_id === "string" && e.campaign_id ? `/forja-campanhas/${e.campaign_id}` : "/forja-campanhas"),
  codex: "/codex",
  achievement: "/conquistas",
  reward: "/tesouro",
  level_up: "/perfil",
  inventory: "/inventario",
  protocol: "/protocolos",
  recovery: "/saude",
  season: "/quests",
  grimoire: "/grimorio",
  guild: "/guilda",
  war_council: "/conselho",
  bank: "/banco",
};

/** Rota de destino do evento, ou null quando não há tela correspondente (não deveria ocorrer, mas evita quebrar se um tipo novo aparecer sem ser mapeado). */
export function timelineEventRoute(e: TimelineEvent): string | null {
  const entry = TYPE_ROUTE[e.type];
  if (!entry) return null;
  return typeof entry === "function" ? entry(e) : entry;
}

/** Cor semântica do evento, seguindo a paleta conceitual do LifeOS (azul=produtividade, roxo=IA/estratégia, verde=saúde, rosa=leitura/emocional, âmbar=destaque/recompensa). */
const TYPE_TONE: Record<TimelineEvent["type"], "blue" | "purple" | "green" | "pink" | "amber"> = {
  task: "blue",
  habit: "green",
  workout: "green",
  reading: "pink",
  education: "blue",
  sleep: "green",
  mood: "green",
  water: "green",
  work_note: "blue",
  experiment: "purple",
  journal: "pink",
  life_admin: "blue",
  review: "blue",
  focus: "purple",
  project: "purple",
  contract: "purple",
  campaign: "purple",
  codex: "purple",
  achievement: "amber",
  reward: "amber",
  level_up: "amber",
  inventory: "amber",
  protocol: "blue",
  recovery: "green",
  season: "amber",
  grimoire: "blue",
  guild: "purple",
  war_council: "purple",
  bank: "amber",
};

export function timelineEventTone(e: TimelineEvent): "blue" | "purple" | "green" | "pink" | "amber" {
  return TYPE_TONE[e.type] ?? "blue";
}

/** Chave do dia (YYYY-MM-DD) de um evento, no fuso local do navegador — só para agrupar visualmente a lista. */
export function timelineDayKeyLocal(at: string): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Agrupa os eventos (já ordenados do mais novo pro mais antigo) por dia local, preservando a ordem. */
export function groupTimelineByDay(events: TimelineEvent[]): Array<{ dayKey: string; events: TimelineEvent[] }> {
  const groups: Array<{ dayKey: string; events: TimelineEvent[] }> = [];
  for (const e of events) {
    const dayKey = timelineDayKeyLocal(e.at);
    const last = groups[groups.length - 1];
    if (last && last.dayKey === dayKey) last.events.push(e);
    else groups.push({ dayKey, events: [e] });
  }
  return groups;
}

/** Rótulo amigável do dia: "Hoje", "Ontem" ou a data por extenso em pt-BR. */
export function timelineDayLabel(dayKey: string): string {
  const todayKey = timelineDayKeyLocal(new Date().toISOString());
  const yesterdayKey = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return timelineDayKeyLocal(d.toISOString());
  })();
  if (dayKey === todayKey) return "Hoje";
  if (dayKey === yesterdayKey) return "Ontem";
  const d = new Date(`${dayKey}T00:00:00`);
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}
