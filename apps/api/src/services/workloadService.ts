import type { getDb } from "../db/client.js";

type Db = ReturnType<typeof getDb>;

/**
 * Carga de trabalho por projeto — usada no Dashboard, em Projetos e na
 * área Profissional (uma única fonte, sem duplicar regra na UI).
 *
 * Tudo é derivado das tabelas originais:
 *  - tasks (status, prazos, estimate_minutes, time_spent_minutes, completed_at)
 *  - time_entries (cronômetro das tarefas) + focus_sessions (Focus Mode)
 * Nenhum valor é estimado: sem estimativa nas tarefas, as horas
 * restantes ficam 0 e `unestimatedOpen` diz quantas tarefas faltam estimar.
 */

export const DONE_STATUS = "Concluído";
const DOING_STATUSES = ["Em Andamento", "Em Revisão"];

export type LoadPressure = "critical" | "attention" | "ok" | "idle";

export interface ProjectLoad {
  id: string | null;
  name: string;
  color: string | null;
  kind: string | null;
  status: string | null;
  dueDate: string | null;
  total: number;
  done: number;
  open: number;
  doing: number;
  todo: number;
  overdue: number;
  dueThisWeek: number;
  unestimatedOpen: number;
  openEstimateMinutes: number;
  remainingMinutes: number;
  spentMinutes: number;
  loggedMinutesPeriod: number;
  completedPeriod: number;
  createdPeriod: number;
  progressPct: number;
  nextDue: { taskId: string; title: string; date: string } | null;
  daysToDeadline: number | null;
  /** Horas/dia necessárias para zerar o restante estimado até o prazo do projeto (null sem prazo ou sem estimativa). */
  hoursPerDayNeeded: number | null;
  pressure: LoadPressure;
}

export interface WorkloadSummary {
  periodDays: number;
  today: string;
  projects: ProjectLoad[];
  totals: {
    open: number;
    overdue: number;
    dueThisWeek: number;
    remainingMinutes: number;
    loggedMinutesPeriod: number;
    completedPeriod: number;
    createdPeriod: number;
    unestimatedOpen: number;
    /** Semanas para zerar o restante estimado no ritmo de horas registradas do período (null sem histórico). */
    weeksToClear: number | null;
  };
}

export function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function shiftDays(iso: string, delta: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return isoDate(d);
}

export function daysBetween(fromIso: string, toIso: string) {
  return Math.round((Date.parse(`${toIso}T12:00:00Z`) - Date.parse(`${fromIso}T12:00:00Z`)) / 86_400_000);
}

/** Classificação da pressão — regra única, explicada na UI. */
export function classifyPressure(p: Pick<ProjectLoad, "open" | "overdue" | "dueThisWeek" | "hoursPerDayNeeded">): LoadPressure {
  if (p.open === 0) return "idle";
  if (p.overdue > 0 || (p.hoursPerDayNeeded !== null && p.hoursPerDayNeeded > 6)) return "critical";
  if (p.dueThisWeek > 0 || (p.hoursPerDayNeeded !== null && p.hoursPerDayNeeded > 3)) return "attention";
  return "ok";
}

const num = (v: unknown) => Number(v ?? 0);

export async function getProjectWorkload(
  db: Db,
  ownerId: string,
  opts: { today: string; days: number; kind?: string }
): Promise<WorkloadSummary> {
  const { today, days, kind } = opts;
  const from = shiftDays(today, -days);
  const weekEnd = shiftDays(today, 7);
  const kindFilter = kind ? "AND p.kind = ?" : "";
  const kindArgs = kind ? [kind] : [];
  // Sem filtro de tipo, tarefas sem projeto entram como um bucket próprio.
  const taskScope = kind ? `AND t.project_id IN (SELECT p.id FROM projects p WHERE p.owner_id = ? ${kindFilter})` : "";
  const taskScopeArgs = kind ? [ownerId, ...kindArgs] : [];
  const doing = DOING_STATUSES.map(() => "?").join(", ");

  const [projectsRes, aggRes, loggedRes, focusRes, nextRes] = await Promise.all([
    db.execute({
      sql: `SELECT p.id, p.name, p.color, p.kind, p.status, p.due_date FROM projects p
            WHERE p.owner_id = ? AND p.archived_at IS NULL ${kindFilter}`,
      args: [ownerId, ...kindArgs],
    }),
    db.execute({
      sql: `SELECT t.project_id AS pid,
              COUNT(*) AS total,
              SUM(CASE WHEN t.status = ? THEN 1 ELSE 0 END) AS done,
              SUM(CASE WHEN t.status IN (${doing}) THEN 1 ELSE 0 END) AS doing,
              SUM(CASE WHEN t.status != ? AND t.due_date IS NOT NULL AND t.due_date < date(?) THEN 1 ELSE 0 END) AS overdue,
              SUM(CASE WHEN t.status != ? AND t.due_date IS NOT NULL AND t.due_date >= date(?) AND t.due_date < date(?, '+1 day') THEN 1 ELSE 0 END) AS due_week,
              SUM(CASE WHEN t.status != ? AND t.estimate_minutes IS NULL THEN 1 ELSE 0 END) AS unestimated,
              SUM(CASE WHEN t.status != ? THEN COALESCE(t.estimate_minutes, 0) ELSE 0 END) AS open_estimate,
              SUM(CASE WHEN t.status != ? THEN MAX(COALESCE(t.estimate_minutes, 0) - COALESCE(t.time_spent_minutes, 0), 0) ELSE 0 END) AS remaining,
              SUM(COALESCE(t.time_spent_minutes, 0)) AS spent,
              SUM(CASE WHEN t.status = ? AND date(COALESCE(t.completed_at, t.updated_at)) > date(?) THEN 1 ELSE 0 END) AS done_period,
              SUM(CASE WHEN t.created_at >= date(?, '+1 day') THEN 1 ELSE 0 END) AS created_period
            FROM tasks t
            WHERE t.owner_id = ? ${taskScope}
            GROUP BY t.project_id`,
      args: [
        DONE_STATUS,
        ...DOING_STATUSES,
        DONE_STATUS, today,
        DONE_STATUS, today, weekEnd,
        DONE_STATUS,
        DONE_STATUS,
        DONE_STATUS,
        DONE_STATUS, from,
        from,
        ownerId, ...taskScopeArgs,
      ],
    }),
    // Cronômetro das tarefas (time_entries) — projeto da entrada ou da tarefa.
    db.execute({
      sql: `SELECT COALESCE(e.project_id, t.project_id) AS pid, SUM(COALESCE(e.duration_minutes, 0)) AS mins
            FROM time_entries e LEFT JOIN tasks t ON t.id = e.task_id AND t.owner_id = e.owner_id
            WHERE e.owner_id = ? AND e.ended_at IS NOT NULL AND e.started_at >= date(?, '+1 day')
            GROUP BY pid`,
      args: [ownerId, from],
    }),
    db.execute({
      sql: `SELECT COALESCE(f.project_id, t.project_id) AS pid, SUM(COALESCE(f.actual_minutes, 0)) AS mins
            FROM focus_sessions f LEFT JOIN tasks t ON t.id = f.task_id AND t.owner_id = f.owner_id
            WHERE f.owner_id = ? AND f.started_at >= date(?, '+1 day')
            GROUP BY pid`,
      args: [ownerId, from],
    }),
    db.execute({
      sql: `SELECT t.id, t.title, t.project_id AS pid, date(t.due_date) AS due FROM tasks t
            WHERE t.owner_id = ? AND t.status != ? AND t.due_date IS NOT NULL ${taskScope}
            ORDER BY date(t.due_date) ASC LIMIT 400`,
      args: [ownerId, DONE_STATUS, ...taskScopeArgs],
    }),
  ]);

  const key = (pid: unknown) => (pid == null ? "__none__" : String(pid));
  const logged = new Map<string, number>();
  for (const r of [...loggedRes.rows, ...focusRes.rows] as unknown as Array<{ pid: string | null; mins: number }>) {
    logged.set(key(r.pid), (logged.get(key(r.pid)) ?? 0) + num(r.mins));
  }
  const nextDue = new Map<string, { taskId: string; title: string; date: string }>();
  for (const r of nextRes.rows as unknown as Array<{ id: string; title: string; pid: string | null; due: string }>) {
    if (!nextDue.has(key(r.pid))) nextDue.set(key(r.pid), { taskId: r.id, title: r.title, date: r.due });
  }
  const agg = new Map((aggRes.rows as unknown as Array<Record<string, unknown>>).map((r) => [key(r.pid), r]));
  const projects = projectsRes.rows as unknown as Array<{ id: string; name: string; color: string | null; kind: string; status: string; due_date: string | null }>;

  const build = (id: string | null, meta: { name: string; color: string | null; kind: string | null; status: string | null; dueDate: string | null }): ProjectLoad => {
    const a = agg.get(key(id)) ?? {};
    const total = num(a.total);
    const done = num(a.done);
    const open = total - done;
    const doingCount = num(a.doing);
    const remaining = num(a.remaining);
    const dueDate = meta.dueDate ? meta.dueDate.slice(0, 10) : null;
    const daysToDeadline = dueDate ? daysBetween(today, dueDate) : null;
    const hoursPerDayNeeded =
      remaining > 0 && daysToDeadline !== null ? Math.round((remaining / 60 / Math.max(1, daysToDeadline)) * 10) / 10 : null;
    const base = {
      id,
      ...meta,
      dueDate,
      total,
      done,
      open,
      doing: doingCount,
      todo: Math.max(0, open - doingCount),
      overdue: num(a.overdue),
      dueThisWeek: num(a.due_week),
      unestimatedOpen: num(a.unestimated),
      openEstimateMinutes: num(a.open_estimate),
      remainingMinutes: remaining,
      spentMinutes: num(a.spent),
      loggedMinutesPeriod: Math.round(logged.get(key(id)) ?? 0),
      completedPeriod: num(a.done_period),
      createdPeriod: num(a.created_period),
      progressPct: total > 0 ? Math.round((done / total) * 100) : 0,
      nextDue: nextDue.get(key(id)) ?? null,
      daysToDeadline,
      hoursPerDayNeeded,
    };
    return { ...base, pressure: classifyPressure(base) };
  };

  const list = projects.map((p) => build(p.id, { name: p.name, color: p.color, kind: p.kind, status: p.status, dueDate: p.due_date }));
  if (!kind && agg.has("__none__")) {
    list.push(build(null, { name: "Sem projeto", color: null, kind: null, status: null, dueDate: null }));
  }

  // Ordena por pressão e depois por volume em aberto — o que precisa de atenção vem primeiro.
  const rank: Record<LoadPressure, number> = { critical: 0, attention: 1, ok: 2, idle: 3 };
  list.sort((a, b) => rank[a.pressure] - rank[b.pressure] || b.open - a.open || b.remainingMinutes - a.remainingMinutes);

  const sum = (f: (p: ProjectLoad) => number) => list.reduce((s, p) => s + f(p), 0);
  const remainingMinutes = sum((p) => p.remainingMinutes);
  const loggedMinutesPeriod = sum((p) => p.loggedMinutesPeriod);
  const weeklyPace = (loggedMinutesPeriod / days) * 7;

  return {
    periodDays: days,
    today,
    projects: list,
    totals: {
      open: sum((p) => p.open),
      overdue: sum((p) => p.overdue),
      dueThisWeek: sum((p) => p.dueThisWeek),
      remainingMinutes,
      loggedMinutesPeriod,
      completedPeriod: sum((p) => p.completedPeriod),
      createdPeriod: sum((p) => p.createdPeriod),
      unestimatedOpen: sum((p) => p.unestimatedOpen),
      weeksToClear: remainingMinutes > 0 && weeklyPace > 0 ? Math.round((remainingMinutes / weeklyPace) * 10) / 10 : null,
    },
  };
}

/**
 * "Hoje" no fuso do usuário: o frontend manda a data local (YYYY-MM-DD).
 * Só aceita até 1 dia de diferença da data do servidor (UTC) — fusos
 * reais nunca passam disso — e cai na data do servidor em qualquer outro caso.
 */
export function resolveClientToday(raw: unknown): string {
  const server = isoDate(new Date());
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return server;
  return Math.abs(daysBetween(server, raw)) <= 1 ? raw : server;
}
