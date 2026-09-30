import type { CalendarItem, DeadlineRadarDashboard, GoalForecastDashboard, LifeScoreBreakdown, Project, Task, TimelineEvent } from "@/types";

/**
 * Regras do Dashboard (fora da UI): tudo aqui é derivado de dados reais já
 * carregados pelos hooks — nenhum número é estimado ou inventado. Quando
 * não há dado suficiente, as funções devolvem null/vazio e a tela mostra
 * um estado vazio honesto.
 */

export const DONE = "Concluído";

export function localIsoDate(d = new Date()) {
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

/** Variação do Life Score contra o snapshot mais próximo de 7 dias atrás (em pontos). */
export function lifeScoreWeekDelta(history: LifeScoreBreakdown[], today: string): { delta: number; since: string } | null {
  if (history.length < 2) return null;
  const target = localIsoDate(new Date(new Date(`${today}T12:00:00`).getTime() - 7 * 86_400_000));
  const past = [...history].filter((h) => h.date <= target).pop() ?? (history[0].date < today ? history[0] : null);
  const current = history.find((h) => h.date === today) ?? history[history.length - 1];
  if (!past || past.date === current.date) return null;
  return { delta: Math.round(current.overall - past.overall), since: past.date };
}

export type AttentionTone = "critical" | "warning" | "info";

export interface AttentionItem {
  id: string;
  tone: AttentionTone;
  title: string;
  description: string;
  actionLabel: string;
  href?: string;
  action?: "water";
}

/** Itens que "merecem atenção" — prazos, água, metas em risco, hábitos pendentes à noite. */
export function buildAttentionItems(params: {
  deadlines: DeadlineRadarDashboard | null | undefined;
  goals: GoalForecastDashboard | null | undefined;
  waterMl: number;
  waterGoalMl: number;
  habitsPending: number;
  hour: number;
}): AttentionItem[] {
  const items: AttentionItem[] = [];
  const s = params.deadlines?.summary;
  if (s && s.overdue + s.dueToday > 0) {
    const first = params.deadlines?.critical[0];
    items.push({
      id: "deadlines",
      tone: s.overdue > 0 ? "critical" : "warning",
      title: s.overdue > 0 ? `${s.overdue} prazo(s) vencido(s)` : `${s.dueToday} prazo(s) vence(m) hoje`,
      description: first ? `${first.title}${first.daysRemaining < 0 ? ` — ${Math.abs(first.daysRemaining)} dia(s) de atraso` : " vence hoje"}.` : "Veja no Deadline Radar.",
      actionLabel: "Deadline Radar",
      href: "/deadline-radar",
    });
  }
  // Água só cobra a partir do meio da manhã — antes disso "0 L" não é sinal de nada.
  if (params.hour >= 10 && params.waterMl < params.waterGoalMl) {
    items.push({
      id: "water",
      tone: params.waterMl < params.waterGoalMl / 2 ? "warning" : "info",
      title: "Água abaixo da meta",
      description: `Você registrou ${(params.waterMl / 1000).toFixed(1)} L de ${(params.waterGoalMl / 1000).toFixed(1)} L hoje.`,
      actionLabel: "+250 ml",
      action: "water",
    });
  }
  const risky = params.goals?.risks ?? [];
  if (risky.length > 0) {
    items.push({
      id: "goals",
      tone: risky.some((g) => g.risk === "critical" || g.status === "overdue") ? "critical" : "warning",
      title: `${risky.length} meta(s) em risco`,
      description: risky.slice(0, 3).map((g) => g.title).join(", ") + ".",
      actionLabel: "Goal Forecast",
      href: "/goal-forecast",
    });
  }
  if (params.hour >= 18 && params.habitsPending > 0) {
    items.push({
      id: "habits",
      tone: "info",
      title: `${params.habitsPending} hábito(s) pendente(s)`,
      description: "Ainda dá tempo de manter a sequência hoje.",
      actionLabel: "Hábitos",
      href: "/habitos",
    });
  }
  return items;
}

export interface DayEntry {
  id: string;
  time: string | null; // HH:MM ou null para "dia todo"
  sortKey: string;
  title: string;
  subtitle: string;
  done: boolean;
  href: string | null;
}

function hhmm(iso: string) {
  const norm = iso.includes("T") ? iso : iso.replace(" ", "T");
  const d = new Date(/Z|[+-]\d\d:?\d\d$/.test(norm) ? norm : `${norm}Z`);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

const TIMELINE_SUBTITLE: Partial<Record<TimelineEvent["type"], string>> = {
  task: "Tarefa concluída",
  habit: "Hábito cumprido",
  workout: "Exercício",
  reading: "Leitura",
  education: "Educação",
  sleep: "Sono",
  mood: "Humor registrado",
  water: "Água",
  work_note: "Reunião / anotação",
  experiment: "Experimento",
  journal: "Diário",
};

/** Agenda do dia (Calendário) + o que já aconteceu (Timeline), numa linha do tempo única. */
export function buildDayEntries(calendar: CalendarItem[], events: TimelineEvent[], today: string): DayEntry[] {
  const planned: DayEntry[] = calendar
    .filter((c) => c.startsAt.slice(0, 10) === today)
    .map((c) => {
      const time = c.allDay ? null : hhmm(c.startsAt);
      return {
        id: `cal-${c.id}`,
        time,
        sortKey: time ?? "00:00",
        title: c.title,
        subtitle: c.sourceType === "task" ? "Prazo de tarefa" : c.sourceType === "goal" ? "Marco de meta" : c.sourceType === "academic_project" ? "Acadêmico" : "Evento",
        done: false,
        href: c.link,
      };
    });
  const happened: DayEntry[] = events
    .filter((e) => String(e.at).slice(0, 10) === today && e.type !== "water")
    .map((e) => {
      const time = hhmm(String(e.at));
      return { id: `tl-${e.type}-${e.id}`, time, sortKey: time, title: e.label, subtitle: TIMELINE_SUBTITLE[e.type] ?? "Registro", done: true, href: "/timeline" };
    });
  return [...planned, ...happened].sort((a, b) => {
    if (a.time === null && b.time !== null) return -1;
    if (b.time === null && a.time !== null) return 1;
    return a.sortKey.localeCompare(b.sortKey);
  });
}

/** Paleta categórica do LifeOS em ordem fixa (nunca ciclada por ranking). */
export const CATEGORY_ORDER = ["#7C4DFF", "#2F80FF", "#FF7A45", "#12B76A", "#FF3D93", "#08B6A6", "#9550FF"];

/** Carga aberta por projeto (treemap). "Sem projeto" agrega o resto. */
export function openLoadByProject(tasks: Task[], projects: Project[]) {
  const byProject = new Map<string, number>();
  for (const t of tasks) {
    if (t.status === DONE) continue;
    const key = t.project_id ?? "__none__";
    byProject.set(key, (byProject.get(key) ?? 0) + 1);
  }
  const ordered = projects.map((p) => p.id);
  return Array.from(byProject.entries()).map(([id, value]) => {
    const project = projects.find((p) => p.id === id);
    const idx = Math.max(0, ordered.indexOf(id));
    return {
      id,
      label: project?.name ?? "Sem projeto",
      value,
      color: project?.color ?? (id === "__none__" ? "#6E7391" : CATEGORY_ORDER[idx % CATEGORY_ORDER.length]),
      href: project ? `/projetos/${project.id}` : "/tarefas",
    };
  });
}

/** Composição das tarefas dos últimos 30 dias (criadas ou concluídas no período). */
export function taskComposition(tasks: Task[], today: string) {
  const from = localIsoDate(new Date(new Date(`${today}T12:00:00`).getTime() - 30 * 86_400_000));
  const recent = tasks.filter(
    (t) => t.created_at.slice(0, 10) >= from || (t.completed_at ?? "").slice(0, 10) >= from
  );
  let done = 0;
  let doing = 0;
  let pending = 0;
  let overdue = 0;
  for (const t of recent) {
    if (t.status === DONE) done += 1;
    else if (t.due_date && t.due_date.slice(0, 10) < today) overdue += 1;
    else if (t.status === "Em Andamento" || t.status === "Em Revisão") doing += 1;
    else pending += 1;
  }
  return { total: recent.length, done, doing, pending, overdue };
}
