import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { userDayContext } from "./localDayService.js";
import { moveTaskStatus, TASK_STATUSES } from "./taskWriteService.js";
import { computeCapacitySummary } from "./capacityPlannerService.js";

/**
 * Missões 3.0 — números do quadro, cargas e análises calculados das tarefas
 * reais (mesma fonte de /api/tasks). Nenhuma métrica é guardada em cópia.
 */

export class BoardError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const DONE = "Concluído";
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const mondayOf = (day: string) => {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
  return addDays(day, -((dow + 6) % 7));
};

type Row = Record<string, unknown>;
const num = (v: unknown) => (v == null ? 0 : Number(v));

/** Indicadores, metadados dos cartões (subtarefas, dependências, XP ganho) e análises. */
export async function getMissionsOverview(db: Client, ownerId: string) {
  const { today } = await userDayContext(db, ownerId);
  const from30 = addDays(today, -29);
  const [tasksR, subsR, depsR, xpR, timeR, xpAllR] = await Promise.all([
    db.execute({
      sql: `SELECT id, status, priority, difficulty, due_date, planned_date, estimate_minutes, time_spent_minutes, completed_at, created_at, project_id, goal_id, contract_id, archived_at
            FROM tasks WHERE owner_id = ? AND parent_task_id IS NULL`,
      args: [ownerId],
    }),
    db.execute({ sql: "SELECT task_id, COUNT(*) AS total, SUM(done) AS done FROM subtasks WHERE owner_id = ? GROUP BY task_id", args: [ownerId] }),
    db.execute({
      sql: `SELECT d.task_id, d.depends_on_id, t.status AS dep_status, t.title AS dep_title FROM task_dependencies d
            JOIN tasks t ON t.id = d.depends_on_id AND t.owner_id = ? JOIN tasks o ON o.id = d.task_id AND o.owner_id = ?`,
      args: [ownerId, ownerId],
    }),
    db.execute({ sql: "SELECT source_id, SUM(xp) AS xp FROM xp_events WHERE owner_id = ? AND source_type = 'task' GROUP BY source_id", args: [ownerId] }),
    db.execute({ sql: "SELECT COALESCE(SUM(duration_minutes), 0) AS m FROM time_entries WHERE owner_id = ? AND task_id IS NOT NULL AND substr(started_at, 1, 10) >= ?", args: [ownerId, from30] }),
    db.execute({ sql: "SELECT COALESCE(SUM(xp), 0) AS xp FROM xp_events WHERE owner_id = ? AND source_type = 'task' AND day_key >= ?", args: [ownerId, from30] }),
  ]);
  const tasks = tasksR.rows as Row[];
  const open = tasks.filter((t) => t.status !== DONE);
  const done = tasks.filter((t) => t.status === DONE);
  const dueOf = (t: Row) => (t.due_date ? String(t.due_date).slice(0, 10) : null);
  const overdue = open.filter((t) => dueOf(t) && dueOf(t)! < today);
  const forToday = open.filter((t) => dueOf(t) === today || (t.planned_date && String(t.planned_date) === today));
  const doneLast30 = done.filter((t) => t.completed_at && String(t.completed_at).slice(0, 10) >= from30);
  const createdLast30 = tasks.filter((t) => String(t.created_at).slice(0, 10) >= from30);

  // Análises: conclusões por semana (12 semanas), precisão das estimativas e lead time.
  const weeks: Array<{ week: string; done: number; created: number }> = [];
  const firstWeek = addDays(mondayOf(today), -77);
  for (let i = 0; i < 12; i++) weeks.push({ week: addDays(firstWeek, i * 7), done: 0, created: 0 });
  const weekIdx = (day: string) => Math.floor((Date.parse(`${mondayOf(day)}T12:00:00Z`) - Date.parse(`${firstWeek}T12:00:00Z`)) / (7 * 86_400_000));
  for (const t of done) {
    if (!t.completed_at) continue;
    const i = weekIdx(String(t.completed_at).slice(0, 10));
    if (i >= 0 && i < 12) weeks[i]!.done++;
  }
  for (const t of tasks) {
    const i = weekIdx(String(t.created_at).slice(0, 10));
    if (i >= 0 && i < 12) weeks[i]!.created++;
  }
  const estimated = done.filter((t) => num(t.estimate_minutes) > 0 && num(t.time_spent_minutes) > 0);
  const ratio = estimated.length ? estimated.reduce((s, t) => s + num(t.time_spent_minutes) / num(t.estimate_minutes), 0) / estimated.length : null;
  const lead = done.filter((t) => t.completed_at).map((t) => (Date.parse(String(t.completed_at)) - Date.parse(String(t.created_at))) / 86_400_000).filter((d) => d >= 0);
  const leadMedian = lead.length ? [...lead].sort((a, b) => a - b)[Math.floor(lead.length / 2)]! : null;
  const byPriority = (["Alta", "Média", "Baixa"] as const).map((p) => ({ priority: p, open: open.filter((t) => t.priority === p).length, done: doneLast30.filter((t) => t.priority === p).length }));
  const onTime = doneLast30.filter((t) => dueOf(t)).map((t) => String(t.completed_at).slice(0, 10) <= dueOf(t)!);

  const subs = new Map((subsR.rows as Row[]).map((r) => [String(r.task_id), { total: num(r.total), done: num(r.done) }]));
  const deps = new Map<string, Array<{ id: string; title: string; done: boolean }>>();
  for (const d of depsR.rows as Row[]) {
    const list = deps.get(String(d.task_id)) ?? [];
    list.push({ id: String(d.depends_on_id), title: String(d.dep_title), done: d.dep_status === DONE });
    deps.set(String(d.task_id), list);
  }
  const xp = new Map((xpR.rows as Row[]).map((r) => [String(r.source_id), num(r.xp)]));
  const cards: Record<string, { subtasks: { total: number; done: number } | null; blockedBy: Array<{ id: string; title: string; done: boolean }>; xpEarned: number }> = {};
  for (const t of tasks) {
    const id = String(t.id);
    const s = subs.get(id) ?? null;
    const b = deps.get(id) ?? [];
    const x = xp.get(id) ?? 0;
    if (s || b.length || x) cards[id] = { subtasks: s, blockedBy: b, xpEarned: x };
  }

  return {
    today,
    indicators: {
      done: done.length,
      open: open.length,
      inProgress: open.filter((t) => t.status === "Em Andamento").length,
      today: forToday.length,
      overdue: overdue.length,
      completionRate: createdLast30.length ? Math.round((doneLast30.length / Math.max(createdLast30.length, doneLast30.length)) * 100) : null,
      xpLast30: num(xpAllR.rows[0]?.xp),
      estimatedOpenMinutes: open.reduce((s, t) => s + num(t.estimate_minutes), 0),
      unestimatedOpen: open.filter((t) => !num(t.estimate_minutes)).length,
      executedLast30Minutes: num(timeR.rows[0]?.m) || doneLast30.reduce((s, t) => s + num(t.time_spent_minutes), 0),
      definitions: {
        completionRate: "Concluídas nos últimos 30 dias ÷ maior valor entre criadas e concluídas no mesmo período.",
        xpLast30: "XP de missões concluídas (motor oficial) nos últimos 30 dias.",
        executedLast30Minutes: "Tempo cronometrado em missões nos últimos 30 dias (ou tempo gasto registrado nelas).",
      },
    },
    cards,
    analytics: {
      weeks,
      estimateRatio: ratio == null ? null : Math.round(ratio * 100) / 100,
      estimatedSample: estimated.length,
      leadTimeMedianDays: leadMedian == null ? null : Math.round(leadMedian * 10) / 10,
      byPriority,
      onTimeRate: onTime.length ? Math.round((onTime.filter(Boolean).length / onTime.length) * 100) : null,
      onTimeSample: onTime.length,
    },
  };
}

/** Carga dos próximos dias: capacidade livre x esforço planejado (mesma regra do Planejamento de Capacidade). */
export async function getMissionsLoad(db: Client, ownerId: string, days = 10) {
  const { today } = await userDayContext(db, ownerId);
  const out = [];
  for (let i = 0; i < Math.min(14, Math.max(3, days)); i++) {
    const day = addDays(today, i);
    const c = await computeCapacitySummary(db, ownerId, day);
    out.push({ date: day, freeMinutes: c.freeMinutes, plannedMinutes: c.plannedMinutes, overloadMinutes: c.overloadMinutes, occupancyPct: Math.round(c.occupancyRate * 100), level: c.workloadLevel, window: c.windowLabel });
  }
  return { today, days: out };
}

/**
 * Reordena um cartão dentro da coluna (e move de coluna, com todos os efeitos
 * oficiais do Kanban quando o status muda). board_order é um número entre os
 * vizinhos — sem renumerar a coluna inteira.
 */
export async function reorderTask(db: Client, ownerId: string, input: { taskId: string; status: string; beforeId?: string | null; afterId?: string | null }) {
  if (!(TASK_STATUSES as readonly string[]).includes(input.status)) throw new BoardError("Coluna inválida.");
  const cur = await db.execute({ sql: "SELECT status FROM tasks WHERE id = ? AND owner_id = ?", args: [input.taskId, ownerId] });
  if (!cur.rows[0]) throw new BoardError("Missão não encontrada.", 404);
  const orderOf = async (id: string | null | undefined) => {
    if (!id) return null;
    const r = await db.execute({ sql: "SELECT board_order, created_at FROM tasks WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
    const row = r.rows[0];
    if (!row) return null;
    return row.board_order == null ? Date.parse(String(row.created_at)) / 1000 : Number(row.board_order);
  };
  const [before, after] = await Promise.all([orderOf(input.beforeId), orderOf(input.afterId)]);
  const order = before != null && after != null ? (before + after) / 2 : before != null ? before - 1 : after != null ? after + 1 : Date.now() / 1000;
  if (String(cur.rows[0].status) !== input.status) await moveTaskStatus(db, ownerId, input.taskId, input.status);
  await db.execute({ sql: "UPDATE tasks SET board_order = ? WHERE id = ? AND owner_id = ?", args: [order, input.taskId, ownerId] });
  return { order };
}

/** Arquiva/desarquiva missão concluída (missão aberta não pode sumir das outras telas sem ser feita). */
export async function setTaskArchived(db: Client, ownerId: string, taskId: string, archived: boolean) {
  const r = await db.execute({ sql: "SELECT status FROM tasks WHERE id = ? AND owner_id = ?", args: [taskId, ownerId] });
  if (!r.rows[0]) throw new BoardError("Missão não encontrada.", 404);
  if (archived && r.rows[0].status !== DONE) throw new BoardError("Só missões concluídas podem ser arquivadas.");
  await db.execute({ sql: `UPDATE tasks SET archived_at = ${archived ? "datetime('now')" : "NULL"} WHERE id = ? AND owner_id = ?`, args: [taskId, ownerId] });
  return { archived };
}

/* ───────────── automações diárias (F e G) ───────────── */

type Outcome = { status: "ok" | "skipped" | "error"; summary: string };

async function notify(db: Client, ownerId: string, kind: string, title: string, body: string, dedupKey: string) {
  const dup = await db.execute({ sql: "SELECT 1 FROM notifications WHERE owner_id = ? AND kind = ? AND title = ? AND substr(created_at, 1, 10) = date('now')", args: [ownerId, kind, title] });
  if (dup.rows.length) return false;
  await db.execute({ sql: "INSERT INTO notifications (id, owner_id, kind, title, body) VALUES (?, ?, ?, ?, ?)", args: [nanoid(), ownerId, kind, title, `${body}`.slice(0, 500)] });
  void dedupKey;
  return true;
}

/** F — Replanejamento: lista atrasadas e sugere novas datas pela capacidade livre (só sugere). */
export async function runReplanOverdue(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const { today } = await userDayContext(db, ownerId);
  const r = await db.execute({
    sql: `SELECT id, title, due_date, estimate_minutes FROM tasks WHERE owner_id = ? AND status != 'Concluído' AND due_date IS NOT NULL AND substr(due_date, 1, 10) < ? ORDER BY due_date LIMIT ?`,
    args: [ownerId, today, Number(config.maxItems ?? 5)],
  });
  if (!r.rows.length) return { status: "skipped", summary: "Nenhuma missão atrasada." };
  const suggestions: string[] = [];
  let day = today;
  for (const t of r.rows as Row[]) {
    let tries = 0;
    while (tries < 10) {
      const c = await computeCapacitySummary(db, ownerId, day);
      if (c.freeMinutes - c.plannedMinutes >= (num(t.estimate_minutes) || 30)) break;
      day = addDays(day, 1);
      tries++;
    }
    suggestions.push(`“${String(t.title).slice(0, 60)}” → ${day.split("-").reverse().join("/")}`);
  }
  if (config.inApp !== false) await notify(db, ownerId, "missions_replan", `${r.rows.length} missão(ões) atrasada(s): sugestão de novas datas`, suggestions.join(" · "), `replan:${today}`);
  return { status: "ok", summary: `Sugestões: ${suggestions.join("; ")}. Nada foi alterado — confirme nas Missões.` };
}

/** G — Revisão: missões paradas em “Em Revisão” há N dias pedem validação. */
export async function runReviewCheck(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const days = Number(config.staleDays ?? 3);
  const r = await db.execute({
    sql: "SELECT title FROM tasks WHERE owner_id = ? AND status = 'Em Revisão' AND updated_at < datetime('now', ?) ORDER BY updated_at LIMIT 10",
    args: [ownerId, `-${days} days`],
  });
  if (!r.rows.length) return { status: "skipped", summary: `Nada parado em revisão há mais de ${days} dias.` };
  const titles = (r.rows as Row[]).map((x) => String(x.title).slice(0, 60));
  if (config.inApp !== false) await notify(db, ownerId, "missions_review", `${titles.length} missão(ões) aguardando validação`, titles.join(" · "), `review:${days}`);
  return { status: "ok", summary: `Aguardando validação: ${titles.join("; ")}.` };
}
