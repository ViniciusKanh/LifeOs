import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { localDayOfStored, shiftDayKey, userDayContext } from "./localDayService.js";
import { automationConfig, mondayKey, notifyFromAutomation } from "./automationService.js";
import { GAMIFICATION_RULES } from "../config/gamification.js";
import { weekCapacity } from "./warCouncilService.js";
import { getQuestBoard } from "./questsService.js";
import { templateByKey } from "./questRules.js";
import { extractJson, str } from "./aiJson.js";
import { generateText, getGeminiConfig } from "./geminiService.js";

/**
 * Camada RPG de Agenda, Conselho de Guerra, Missões e Quadro de Avisos.
 *
 * Fonte única de verdade: tudo é DERIVADO das tabelas de origem (events,
 * tasks, subtasks, weekly_plans, focus_sessions, quest_assignments...).
 * Nada aqui concede XP ou moedas — recompensas continuam saindo só de
 * gamificationService.award() pelas rotas de origem (idempotentes).
 *
 * Convenção de horário dos eventos: `starts_at`/`ends_at` com hora são
 * "hora de parede" local ("YYYY-MM-DDTHH:MM:00", como o Conselho grava);
 * eventos de dia inteiro guardam só a data.
 */

type Row = Record<string, unknown>;
type Outcome = { status: "ok" | "skipped" | "error"; summary: string };
const DONE = "Concluído";

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------

export const EVENT_CATEGORIES = ["evento", "foco", "estudo", "saude", "missao", "meta", "pessoal"] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

const HHMM = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/;

/** Minutos desde a meia-noite (hora de parede) ou null para eventos de dia inteiro. */
export function wallMinutes(v: string | null | undefined): number | null {
  const m = v ? HHMM.exec(v) : null;
  return m ? Number(m[2]) * 60 + Number(m[3]) : null;
}
const dayOf = (v: string) => v.slice(0, 10);
const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const idList = (n: number) => Array.from({ length: n }, () => "?").join(", ");

export interface TimedBlock {
  id: string;
  title: string;
  day: string;
  start: number;
  end: number;
}

/** Sobreposições entre blocos com horário (mesmo dia). Pares ordenados, sem repetição. */
export function findConflicts(blocks: TimedBlock[]): Array<{ a: TimedBlock; b: TimedBlock; overlapMinutes: number }> {
  const out: Array<{ a: TimedBlock; b: TimedBlock; overlapMinutes: number }> = [];
  const byDay = new Map<string, TimedBlock[]>();
  for (const b of blocks) byDay.set(b.day, [...(byDay.get(b.day) ?? []), b]);
  for (const list of byDay.values()) {
    list.sort((x, y) => x.start - y.start);
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length && list[j]!.start < list[i]!.end; j++) {
        out.push({ a: list[i]!, b: list[j]!, overlapMinutes: Math.min(list[i]!.end, list[j]!.end) - list[j]!.start });
      }
  }
  return out;
}

/** Próximo horário livre do dia (passos de 15 min) para um bloco de `duration`, dentro da janela. */
export function nextFreeSlot(busy: Array<{ start: number; end: number }>, duration: number, from: number, windowEnd = 22 * 60): number | null {
  const sorted = [...busy].sort((a, b) => a.start - b.start);
  for (let t = Math.ceil(from / 15) * 15; t + duration <= windowEnd; t += 15) {
    if (!sorted.some((b) => t < b.end && t + duration > b.start)) return t;
  }
  return null;
}

/** Dias seguidos (terminando hoje ou ontem) presentes no conjunto. Hoje sem registro não quebra a sequência. */
export function streakEndingToday(days: Set<string>, today: string): number {
  let d = days.has(today) ? today : shiftDayKey(today, -1);
  let n = 0;
  while (days.has(d)) {
    n++;
    d = shiftDayKey(d, -1);
  }
  return n;
}

export function bestStreak(days: Set<string>): number {
  const sorted = [...days].sort();
  let best = 0;
  let cur = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    cur = prev && shiftDayKey(prev, 1) === d ? cur + 1 : 1;
    best = Math.max(best, cur);
    prev = d;
  }
  return best;
}

export function tierRank<T extends { min: number; title: string }>(ranks: readonly T[], points: number) {
  let idx = 0;
  for (let i = 0; i < ranks.length; i++) if (points >= ranks[i]!.min) idx = i;
  const cur = ranks[idx]!;
  const next = ranks[idx + 1] ?? null;
  return {
    level: idx + 1,
    title: cur.title,
    points,
    currentMin: cur.min,
    next: next ? { title: next.title, min: next.min } : null,
    pct: next ? Math.round(((points - cur.min) / (next.min - cur.min)) * 100) : 100,
  };
}

// ------------------------------------------------------------
// AGENDA
// ------------------------------------------------------------

export const PLANNER_RANKS = [
  { min: 0, title: "Aprendiz do Tempo" },
  { min: 150, title: "Organizador" },
  { min: 400, title: "Planejador Estratégico" },
  { min: 900, title: "Mestre do Calendário" },
  { min: 1800, title: "Guardião do Tempo" },
] as const;

export interface TowerBlock {
  key: string;
  kind: "event" | "block" | "task";
  id: string;
  title: string;
  category: EventCategory;
  start: string | null;
  end: string | null;
  taskId: string | null;
  goalId: string | null;
  done: boolean;
  overdue: boolean;
  link: string | null;
}

async function weekEvents(db: Client, ownerId: string, from: string, toInclusive: string) {
  const r = await db.execute({
    sql: `SELECT id, title, starts_at, ends_at, all_day, source_type, source_id, category, goal_id FROM events
          WHERE owner_id = ? AND starts_at >= ? AND starts_at < date(?, '+1 day') ORDER BY starts_at`,
    args: [ownerId, from, toInclusive],
  });
  return r.rows as unknown as Row[];
}

function eventCategory(row: Row): EventCategory {
  const c = row.category ? String(row.category) : null;
  if (c && (EVENT_CATEGORIES as readonly string[]).includes(c)) return c as EventCategory;
  return row.source_type === "task" ? "missao" : "evento";
}

function timedBlocksOf(rows: Row[]): TimedBlock[] {
  const out: TimedBlock[] = [];
  for (const e of rows) {
    const s = wallMinutes(String(e.starts_at));
    if (s == null || Number(e.all_day) === 1) continue;
    const endRaw = e.ends_at ? wallMinutes(String(e.ends_at)) : null;
    const end = endRaw != null && endRaw > s ? endRaw : s + 60;
    out.push({ id: String(e.id), title: String(e.title), day: dayOf(String(e.starts_at)), start: s, end });
  }
  return out;
}

export async function getAgendaHub(db: Client, ownerId: string) {
  const { tz, today } = await userDayContext(db, ownerId);
  const weekStart = mondayKey(today);
  const weekEnd = shiftDayKey(weekStart, 6);
  const in14 = shiftDayKey(today, 14);

  const [events, upcoming, tasksWeek, sealed, focusR, completedR, todayTasks] = await Promise.all([
    weekEvents(db, ownerId, weekStart, weekEnd),
    weekEvents(db, ownerId, today, in14),
    db.execute({
      sql: `SELECT id, title, status, priority, due_date, planned_date, estimate_minutes, project_id, goal_id, completed_at FROM tasks
            WHERE owner_id = ? AND parent_task_id IS NULL AND ((planned_date BETWEEN ? AND ?) OR (due_date >= ? AND due_date < date(?, '+1 day')))`,
      args: [ownerId, weekStart, weekEnd, weekStart, weekEnd],
    }),
    db.execute({ sql: "SELECT week_start FROM weekly_plans WHERE owner_id = ? AND sealed_at IS NOT NULL ORDER BY week_start DESC LIMIT 60", args: [ownerId] }),
    db.execute({ sql: "SELECT started_at, actual_minutes FROM focus_sessions WHERE owner_id = ? AND started_at >= ? AND actual_minutes IS NOT NULL", args: [ownerId, shiftDayKey(weekStart, -1)] }),
    db.execute({
      sql: `SELECT completed_at, planned_date FROM tasks WHERE owner_id = ? AND status = ? AND completed_at IS NOT NULL AND planned_date IS NOT NULL`,
      args: [ownerId, DONE],
    }),
    db.execute({
      sql: `SELECT id, title, status, due_date, planned_date, goal_id, estimate_minutes FROM tasks WHERE owner_id = ? AND parent_task_id IS NULL
            AND status <> ? AND (planned_date = ? OR substr(due_date, 1, 10) = ? OR (planned_date < ? AND planned_date IS NOT NULL))`,
      args: [ownerId, DONE, today, today, today],
    }),
  ]);

  const tasks = tasksWeek.rows as unknown as Row[];
  const timed = timedBlocksOf(events);
  const blockTaskIds = new Set(events.filter((e) => e.source_type === "task" && e.source_id).map((e) => String(e.source_id)));

  // Horas planejadas: blocos com horário + estimativa das missões planejadas na semana sem bloco (não conta duas vezes).
  const timedMinutes = timed.reduce((a, b) => a + (b.end - b.start), 0);
  const plannedTaskMinutes = tasks.filter((t) => t.planned_date && String(t.planned_date) <= weekEnd && !blockTaskIds.has(String(t.id))).reduce((a, t) => a + Number(t.estimate_minutes ?? 0), 0);

  // Cumprimento: missões planejadas para dias já passados (incluindo hoje) que foram concluídas.
  const plannedSoFar = tasks.filter((t) => t.planned_date && String(t.planned_date) >= weekStart && String(t.planned_date) <= today);
  const doneSoFar = plannedSoFar.filter((t) => String(t.status) === DONE);

  const sealedWeeks = new Set((sealed.rows as unknown as Row[]).map((r) => String(r.week_start)));
  let planStreak = 0;
  for (let w = sealedWeeks.has(weekStart) ? weekStart : shiftDayKey(weekStart, -7); sealedWeeks.has(w); w = shiftDayKey(w, -7)) planStreak++;

  const focusRows = (focusR.rows as unknown as Row[]).filter((f) => localDayOfStored(String(f.started_at), tz) >= weekStart);
  const focusBlocksScheduled = events.filter((e) => eventCategory(e) === "foco" || e.source_type === "task").length;

  // Pontos do Planejador: planos selados, missões concluídas até o dia planejado e sessões de foco da semana.
  const onTime = (completedR.rows as unknown as Row[]).filter((r) => localDayOfStored(String(r.completed_at), tz) <= String(r.planned_date)).length;
  const points = sealedWeeks.size * 40 + onTime * 5 + focusRows.length * 3;

  // Consistência da semana: dias até hoje com pelo menos uma missão concluída ou sessão de foco.
  const elapsed = Array.from({ length: 7 }, (_, i) => shiftDayKey(weekStart, i)).filter((d) => d <= today);
  const activeDays = new Set<string>();
  for (const t of tasks) if (String(t.status) === DONE && t.completed_at) activeDays.add(localDayOfStored(String(t.completed_at), tz));
  for (const f of focusRows) activeDays.add(localDayOfStored(String(f.started_at), tz));
  const consistencyPct = elapsed.length ? Math.round((elapsed.filter((d) => activeDays.has(d)).length / elapsed.length) * 100) : 0;

  const conflicts = findConflicts(timedBlocksOf(upcoming)).map((c) => {
    const dayBusy = timedBlocksOf(upcoming).filter((x) => x.day === c.b.day && x.id !== c.b.id);
    const slot = nextFreeSlot(dayBusy, c.b.end - c.b.start, c.a.end);
    return {
      day: c.a.day,
      a: { id: c.a.id, title: c.a.title, start: hhmm(c.a.start), end: hhmm(c.a.end) },
      b: { id: c.b.id, title: c.b.title, start: hhmm(c.b.start), end: hhmm(c.b.end) },
      overlapMinutes: c.overlapMinutes,
      suggestion: slot == null ? null : { eventId: c.b.id, start: hhmm(slot), end: hhmm(slot + (c.b.end - c.b.start)) },
    };
  });

  // Torre do Tempo (hoje): blocos com horário + missões do dia sem horário.
  const tower: TowerBlock[] = [];
  for (const e of events.filter((x) => dayOf(String(x.starts_at)) === today)) {
    const s = wallMinutes(String(e.starts_at));
    tower.push({
      key: `e:${String(e.id)}`,
      kind: e.source_type === "task" ? "block" : "event",
      id: String(e.id),
      title: String(e.title),
      category: eventCategory(e),
      start: s == null || Number(e.all_day) === 1 ? null : hhmm(s),
      end: e.ends_at && wallMinutes(String(e.ends_at)) != null ? hhmm(wallMinutes(String(e.ends_at))!) : null,
      taskId: e.source_type === "task" && e.source_id ? String(e.source_id) : null,
      goalId: e.goal_id ? String(e.goal_id) : null,
      done: false,
      overdue: false,
      link: e.source_type === "task" ? "/tarefas" : null,
    });
  }
  const towerTaskIds = new Set(tower.map((b) => b.taskId).filter(Boolean));
  for (const t of todayTasks.rows as unknown as Row[]) {
    if (towerTaskIds.has(String(t.id))) continue;
    tower.push({
      key: `t:${String(t.id)}`,
      kind: "task",
      id: String(t.id),
      title: String(t.title),
      category: "missao",
      start: null,
      end: null,
      taskId: String(t.id),
      goalId: t.goal_id ? String(t.goal_id) : null,
      done: false,
      overdue: !!t.planned_date && String(t.planned_date) < today,
      link: "/tarefas",
    });
  }
  tower.sort((a, b) => (a.start ?? "99").localeCompare(b.start ?? "99"));

  // Distribuição do tempo planejado na semana por categoria (minutos).
  const distribution = new Map<string, number>();
  for (const e of events) {
    const s = wallMinutes(String(e.starts_at));
    if (s == null || Number(e.all_day) === 1) continue;
    const end = e.ends_at ? wallMinutes(String(e.ends_at)) ?? s + 60 : s + 60;
    distribution.set(eventCategory(e), (distribution.get(eventCategory(e)) ?? 0) + Math.max(0, end - s));
  }
  if (plannedTaskMinutes > 0) distribution.set("missao", (distribution.get("missao") ?? 0) + plannedTaskMinutes);

  return {
    today,
    weekStart,
    weekEnd,
    rank: tierRank(PLANNER_RANKS, points),
    rankBreakdown: { sealedPlans: sealedWeeks.size, plannedOnTime: onTime, focusSessionsWeek: focusRows.length },
    indicators: {
      eventsWeek: events.length + tasks.filter((t) => t.due_date && String(t.status) !== DONE).length,
      focusBlocks: focusBlocksScheduled,
      focusSessions: focusRows.length,
      planStreakWeeks: planStreak,
      plannedMinutes: timedMinutes + plannedTaskMinutes,
      completionPct: plannedSoFar.length ? Math.round((doneSoFar.length / plannedSoFar.length) * 100) : null,
      conflicts: conflicts.length,
      consistencyPct,
    },
    tower,
    conflicts,
    distribution: [...distribution.entries()].map(([category, minutes]) => ({ category, minutes })).sort((a, b) => b.minutes - a.minutes),
    pendingSuggestions: await listSuggestions(db, ownerId, "agenda"),
  };
}

/** Bloco de foco (ou outro evento com horário) criado pela Torre do Tempo / Agenda. */
export async function createAgendaBlock(
  db: Client,
  ownerId: string,
  input: { title: string; date: string; start: string; durationMinutes: number; category: EventCategory; taskId?: string | null; goalId?: string | null; reminderMinutes?: number | null },
) {
  const s = wallMinutes(`${input.date}T${input.start}`);
  if (s == null || s + input.durationMinutes > 24 * 60) throw new PlanningError("O bloco precisa começar e terminar no mesmo dia.");
  if (input.taskId) {
    const t = await db.execute({ sql: "SELECT 1 FROM tasks WHERE id = ? AND owner_id = ?", args: [input.taskId, ownerId] });
    if (!t.rows[0]) throw new PlanningError("Missão não encontrada.", 404);
  }
  if (input.goalId) {
    const g = await db.execute({ sql: "SELECT 1 FROM goals WHERE id = ? AND owner_id = ?", args: [input.goalId, ownerId] });
    if (!g.rows[0]) throw new PlanningError("Meta não encontrada.", 404);
  }
  const startsAt = `${input.date}T${input.start}:00`;
  // Idempotência: o mesmo bloco da mesma missão no mesmo horário não é duplicado.
  if (input.taskId) {
    const dup = await db.execute({ sql: "SELECT id FROM events WHERE owner_id = ? AND source_type = 'task' AND source_id = ? AND starts_at = ?", args: [ownerId, input.taskId, startsAt] });
    if (dup.rows[0]) return { id: String(dup.rows[0].id), duplicated: true };
  }
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO events (id, owner_id, title, description, starts_at, ends_at, all_day, source_type, source_id, category, reminder_minutes, goal_id)
          VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
    args: [
      id,
      ownerId,
      input.title,
      input.category === "foco" ? "Bloco de foco criado na Agenda." : null,
      startsAt,
      `${input.date}T${hhmm(s + input.durationMinutes)}:00`,
      input.taskId ? "task" : "manual",
      input.taskId ?? null,
      input.category,
      input.reminderMinutes ?? null,
      input.goalId ?? null,
    ],
  });
  return { id, duplicated: false };
}

/** Atualiza categoria/lembrete/meta de um evento do usuário (manual ou bloco de missão). */
export async function updateEventMeta(db: Client, ownerId: string, id: string, patch: { category?: EventCategory; reminderMinutes?: number | null; goalId?: string | null }) {
  const sets: string[] = [];
  const args: Array<string | number | null> = [];
  if (patch.category) (sets.push("category = ?"), args.push(patch.category));
  if (patch.reminderMinutes !== undefined) (sets.push("reminder_minutes = ?"), args.push(patch.reminderMinutes));
  if (patch.goalId !== undefined) {
    if (patch.goalId) {
      const g = await db.execute({ sql: "SELECT 1 FROM goals WHERE id = ? AND owner_id = ?", args: [patch.goalId, ownerId] });
      if (!g.rows[0]) throw new PlanningError("Meta não encontrada.", 404);
    }
    sets.push("goal_id = ?");
    args.push(patch.goalId);
  }
  if (sets.length === 0) return false;
  const r = await db.execute({ sql: `UPDATE events SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`, args: [...args, id, ownerId] });
  return r.rowsAffected > 0;
}

/** Reagendar: blocos de missão criados pelo Conselho/Agenda podem mudar de horário (eventos manuais já usam PATCH /events). */
export async function rescheduleBlock(db: Client, ownerId: string, id: string, input: { date: string; start: string | null; durationMinutes?: number }) {
  const cur = await db.execute({ sql: "SELECT starts_at, ends_at FROM events WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  const row = cur.rows[0] as unknown as Row | undefined;
  if (!row) throw new PlanningError("Evento não encontrado.", 404);
  if (!input.start) {
    await db.execute({ sql: "UPDATE events SET starts_at = ?, ends_at = NULL, all_day = 1 WHERE id = ? AND owner_id = ?", args: [input.date, id, ownerId] });
    return;
  }
  const oldS = wallMinutes(String(row.starts_at));
  const oldE = row.ends_at ? wallMinutes(String(row.ends_at)) : null;
  const duration = input.durationMinutes ?? (oldS != null && oldE != null && oldE > oldS ? oldE - oldS : 60);
  const s = wallMinutes(`${input.date}T${input.start}`)!;
  if (s + duration > 24 * 60) throw new PlanningError("O bloco precisa terminar no mesmo dia.");
  await db.execute({
    sql: "UPDATE events SET starts_at = ?, ends_at = ?, all_day = 0 WHERE id = ? AND owner_id = ?",
    args: [`${input.date}T${input.start}:00`, `${input.date}T${hhmm(s + duration)}:00`, id, ownerId],
  });
}

export class PlanningError extends Error {
  constructor(
    message: string,
    public status: 400 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

// ---------------- Sugestões com aprovação (auto-planejamento / replanejamento) ----------------

interface AutoPlanPayload {
  weekStart: string;
  blocks: Array<{ taskId: string; title: string; date: string; start: string; durationMinutes: number }>;
}
interface ReplanPayload {
  moves: Array<{ taskId: string; title: string; from: string | null; to: string; reason: string }>;
}

export async function listSuggestions(db: Client, ownerId: string, module: string) {
  const r = await db.execute({
    sql: "SELECT id, kind, period_key, payload_json, created_at FROM module_plan_suggestions WHERE owner_id = ? AND module = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 5",
    args: [ownerId, module],
  });
  return (r.rows as unknown as Row[]).map((x) => ({ id: String(x.id), kind: String(x.kind), periodKey: x.period_key ? String(x.period_key) : null, payload: JSON.parse(String(x.payload_json)) as unknown, createdAt: String(x.created_at) }));
}

async function saveSuggestion(db: Client, ownerId: string, module: string, kind: string, periodKey: string, payload: unknown) {
  await db.execute({
    sql: `INSERT INTO module_plan_suggestions (id, owner_id, module, kind, period_key, payload_json) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (owner_id, module, kind, period_key) DO UPDATE SET payload_json = excluded.payload_json, created_at = datetime('now')
          WHERE module_plan_suggestions.status = 'pending'`,
    args: [nanoid(), ownerId, module, kind, periodKey, JSON.stringify(payload)],
  });
}

/** A: planejamento automático — encaixa missões planejadas da semana sem bloco nos horários livres (sugestão). */
export async function runAutoPlan(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const { today } = await userDayContext(db, ownerId);
  const weekStart = mondayKey(today);
  const weekEnd = shiftDayKey(weekStart, 6);
  const dayStart = Number(config.dayStartHour ?? 9) * 60;
  const dayEnd = Number(config.dayEndHour ?? 18) * 60;
  const [events, tasks] = await Promise.all([
    weekEvents(db, ownerId, today, weekEnd),
    db.execute({
      sql: `SELECT id, title, planned_date, due_date, estimate_minutes, priority FROM tasks WHERE owner_id = ? AND parent_task_id IS NULL AND status <> ?
            AND planned_date BETWEEN ? AND ? ORDER BY CASE priority WHEN 'Alta' THEN 0 WHEN 'Média' THEN 1 ELSE 2 END, planned_date`,
      args: [ownerId, DONE, today, weekEnd],
    }),
  ]);
  const withBlock = new Set(events.filter((e) => e.source_type === "task" && e.source_id).map((e) => String(e.source_id)));
  const busy = timedBlocksOf(events);
  const blocks: AutoPlanPayload["blocks"] = [];
  for (const t of tasks.rows as unknown as Row[]) {
    if (withBlock.has(String(t.id))) continue;
    const date = String(t.planned_date);
    const duration = Math.max(25, Math.min(180, Number(t.estimate_minutes ?? 0) || 50));
    const dayBusy = [...busy.filter((b) => b.day === date), ...blocks.filter((b) => b.date === date).map((b) => ({ start: wallMinutes(`${b.date}T${b.start}`)!, end: wallMinutes(`${b.date}T${b.start}`)! + b.durationMinutes }))];
    const slot = nextFreeSlot(dayBusy, duration, dayStart, dayEnd);
    if (slot == null) continue;
    blocks.push({ taskId: String(t.id), title: String(t.title), date, start: hhmm(slot), durationMinutes: duration });
  }
  if (blocks.length === 0) return { status: "skipped", summary: "Nenhuma missão planejada da semana precisa de bloco (ou não há horário livre na janela configurada)." };
  await saveSuggestion(db, ownerId, "agenda", "auto_plan", weekStart, { weekStart, blocks } satisfies AutoPlanPayload);
  return { status: "ok", summary: `${blocks.length} bloco(s) sugerido(s) na Agenda. Revise e aprove — nada foi agendado ainda.` };
}

/** F: replanejamento — missões atrasadas ganham sugestão de novo dia (respeitando um limite por dia). */
export async function runReplan(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const { today } = await userDayContext(db, ownerId);
  const perDay = Number(config.maxPerDay ?? 3);
  const r = await db.execute({
    sql: `SELECT id, title, planned_date, due_date FROM tasks WHERE owner_id = ? AND parent_task_id IS NULL AND status <> ?
          AND ((planned_date IS NOT NULL AND planned_date < ?) OR (due_date IS NOT NULL AND substr(due_date, 1, 10) < ?))
          ORDER BY COALESCE(planned_date, due_date) LIMIT 30`,
    args: [ownerId, DONE, today, today],
  });
  const rows = r.rows as unknown as Row[];
  if (rows.length === 0) return { status: "skipped", summary: "Nenhuma missão atrasada." };
  const load = new Map<string, number>();
  const moves: ReplanPayload["moves"] = [];
  let day = today;
  for (const t of rows) {
    while ((load.get(day) ?? 0) >= perDay) day = shiftDayKey(day, 1);
    load.set(day, (load.get(day) ?? 0) + 1);
    moves.push({
      taskId: String(t.id),
      title: String(t.title),
      from: t.planned_date ? String(t.planned_date) : null,
      to: day,
      reason: t.planned_date && String(t.planned_date) < today ? `planejada para ${String(t.planned_date)}` : `prazo ${String(t.due_date).slice(0, 10)} passou`,
    });
  }
  await saveSuggestion(db, ownerId, "agenda", "replan", today, { moves } satisfies ReplanPayload);
  return { status: "ok", summary: `${moves.length} missão(ões) atrasada(s) com novo dia sugerido. Aprove na Agenda.` };
}

const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isHm = (v: unknown): v is string => typeof v === "string" && /^\d{2}:\d{2}$/.test(v);

/** Aplica (com edições) ou descarta uma sugestão da Agenda. Marca como decidida antes de gravar: clique duplo não duplica. */
export async function decideAgendaSuggestion(db: Client, ownerId: string, id: string, decision: "apply" | "reject", edited?: unknown): Promise<{ applied: number }> {
  const r = await db.execute({ sql: "SELECT kind, payload_json, status FROM module_plan_suggestions WHERE id = ? AND owner_id = ? AND module = 'agenda'", args: [id, ownerId] });
  const row = r.rows[0] as unknown as Row | undefined;
  if (!row) throw new PlanningError("Sugestão não encontrada.", 404);
  const claim = await db.execute({
    sql: "UPDATE module_plan_suggestions SET status = ?, decided_at = datetime('now') WHERE id = ? AND owner_id = ? AND status = 'pending'",
    args: [decision === "apply" ? "applied" : "rejected", id, ownerId],
  });
  if (claim.rowsAffected === 0) throw new PlanningError("Esta sugestão já foi decidida.", 409);
  if (decision === "reject") return { applied: 0 };
  const payload = (edited ?? JSON.parse(String(row.payload_json))) as Record<string, unknown>;
  let applied = 0;
  if (String(row.kind) === "auto_plan") {
    for (const b of (Array.isArray(payload.blocks) ? payload.blocks : []).slice(0, 40) as Array<Record<string, unknown>>) {
      if (typeof b.taskId !== "string" || !isDay(b.date) || !isHm(b.start)) continue;
      const out = await createAgendaBlock(db, ownerId, {
        title: str(b.title, 200) ?? "Missão",
        date: b.date,
        start: b.start,
        durationMinutes: Math.max(15, Math.min(240, Number(b.durationMinutes) || 50)),
        category: "missao",
        taskId: b.taskId,
      }).catch(() => null);
      if (out && !out.duplicated) applied++;
    }
  } else if (String(row.kind) === "replan") {
    for (const m of (Array.isArray(payload.moves) ? payload.moves : []).slice(0, 40) as Array<Record<string, unknown>>) {
      if (typeof m.taskId !== "string" || !isDay(m.to)) continue;
      // Só muda o dia planejado — o prazo (due_date) é do usuário e não é alterado.
      const u = await db.execute({ sql: "UPDATE tasks SET planned_date = ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ? AND status <> ?", args: [m.to, m.taskId, ownerId, DONE] });
      applied += u.rowsAffected;
    }
  }
  return { applied };
}

export async function runConflictAlerts(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const { today } = await userDayContext(db, ownerId);
  const c = findConflicts(timedBlocksOf(await weekEvents(db, ownerId, today, shiftDayKey(today, 7))));
  if (c.length === 0) return { status: "skipped", summary: "Nenhum conflito de horário nos próximos 7 dias." };
  const first = c[0]!;
  const body = `${c.length} conflito(s) de horário. Ex.: “${first.a.title}” e “${first.b.title}” em ${first.a.day.slice(8, 10)}/${first.a.day.slice(5, 7)}.`;
  await notifyFromAutomation(db, ownerId, { eventType: "agenda_conflict", title: "Conflitos na Agenda", body, url: "/calendario", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: body };
}

/** Lembretes: o cron é diário, então o aviso é um resumo da manhã com os horários e o lembrete escolhido de cada evento. */
export async function runAgendaDigest(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const { today } = await userDayContext(db, ownerId);
  const ev = (await weekEvents(db, ownerId, today, today)).filter((e) => wallMinutes(String(e.starts_at)) != null && Number(e.all_day) !== 1);
  if (ev.length === 0) return { status: "skipped", summary: "Nenhum compromisso com horário hoje." };
  const body = ev
    .slice(0, 5)
    .map((e) => `${hhmm(wallMinutes(String(e.starts_at))!)} ${String(e.title)}${e.reminder_minutes ? ` (lembrete ${Number(e.reminder_minutes)} min antes)` : ""}`)
    .join(" · ");
  await notifyFromAutomation(db, ownerId, { eventType: "agenda_digest", title: `Hoje: ${ev.length} compromisso(s)`, body, url: "/calendario", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: body };
}

// ------------------------------------------------------------
// CONSELHO DE GUERRA
// ------------------------------------------------------------

export async function getCouncilHub(db: Client, ownerId: string) {
  const { today } = await userDayContext(db, ownerId);
  const weekStart = mondayKey(today);
  const [campaigns, capacity, planned, versions, sealedCount] = await Promise.all([
    db.execute({
      sql: `SELECT c.id, c.title, c.status, c.life_area,
              (SELECT COUNT(*) FROM campaign_tasks ct JOIN tasks t ON t.id = ct.task_id WHERE ct.campaign_id = c.id AND ct.owner_id = c.owner_id) AS total,
              (SELECT COUNT(*) FROM campaign_tasks ct JOIN tasks t ON t.id = ct.task_id WHERE ct.campaign_id = c.id AND ct.owner_id = c.owner_id AND t.status = '${DONE}') AS done
            FROM campaigns c WHERE c.owner_id = ? AND c.status IN ('active', 'planned') ORDER BY CASE c.status WHEN 'active' THEN 0 ELSE 1 END, c.created_at DESC LIMIT 8`,
      args: [ownerId],
    }),
    weekCapacity(db, ownerId, weekStart, new Set()),
    db.execute({
      sql: `SELECT t.planned_date AS d, t.estimate_minutes AS m, t.project_id, t.goal_id,
              (SELECT 1 FROM campaign_tasks ct WHERE ct.task_id = t.id AND ct.owner_id = t.owner_id LIMIT 1) AS in_campaign
            FROM tasks t WHERE t.owner_id = ? AND t.planned_date BETWEEN ? AND ? AND t.status <> ?`,
      args: [ownerId, weekStart, shiftDayKey(weekStart, 6), DONE],
    }),
    db.execute({ sql: "SELECT week_start, version, created_at, snapshot_json FROM weekly_plan_versions WHERE owner_id = ? ORDER BY created_at DESC LIMIT 8", args: [ownerId] }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM weekly_plans WHERE owner_id = ? AND sealed_at IS NOT NULL", args: [ownerId] }),
  ]);
  const rows = planned.rows as unknown as Row[];
  const plannedMinutes = rows.reduce((a, r) => a + Number(r.m ?? 0), 0);
  const unestimated = rows.filter((r) => !r.m).length;
  // Capacidade declarada (Capacity Planner): livre já desconta compromissos; ausência de dado não vira "disponível".
  const freeMinutes = capacity.reduce((a, c) => a + c.capacityMinutes, 0);
  const byArea = new Map<string, number>();
  for (const r of rows) {
    const area = r.in_campaign ? "Campanhas" : r.goal_id ? "Metas" : r.project_id ? "Projetos" : "Avulsas";
    byArea.set(area, (byArea.get(area) ?? 0) + Number(r.m ?? 0));
  }
  return {
    weekStart,
    campaigns: (campaigns.rows as unknown as Row[]).map((c) => ({
      id: String(c.id),
      title: String(c.title),
      status: String(c.status),
      lifeArea: c.life_area ? String(c.life_area) : null,
      total: Number(c.total ?? 0),
      done: Number(c.done ?? 0),
      pct: Number(c.total ?? 0) > 0 ? Math.round((Number(c.done ?? 0) / Number(c.total)) * 100) : 0,
    })),
    load: {
      freeMinutes,
      plannedMinutes,
      unestimatedTasks: unestimated,
      occupancyPct: freeMinutes > 0 ? Math.round((plannedMinutes / freeMinutes) * 100) : null,
      overloaded: freeMinutes > 0 && plannedMinutes > freeMinutes,
      byDay: capacity.map((c) => ({ date: c.date, freeMinutes: c.capacityMinutes, plannedMinutes: rows.filter((r) => String(r.d) === c.date).reduce((a, r) => a + Number(r.m ?? 0), 0) })),
      byArea: [...byArea.entries()].map(([area, minutes]) => ({ area, minutes })),
    },
    sealedTotal: Number(sealedCount.rows[0]?.n ?? 0),
    versions: (versions.rows as unknown as Row[]).map((v) => {
      let snap: { planned?: number; events?: number; focus?: number } = {};
      try {
        snap = JSON.parse(String(v.snapshot_json)) as typeof snap;
      } catch {
        /* snapshot ilegível: mostra só a data */
      }
      return { weekStart: String(v.week_start), version: Number(v.version), createdAt: String(v.created_at), planned: snap.planned ?? 0, events: snap.events ?? 0, focus: snap.focus ?? 0 };
    }),
  };
}

/** Grava uma versão do plano selado (chamado logo após sealPlan). */
export async function recordPlanVersion(db: Client, ownerId: string, weekStart: string, snapshot: { planned: number; events: number; focus: number; assignments: unknown }) {
  const r = await db.execute({ sql: "SELECT COALESCE(MAX(version), 0) + 1 AS v FROM weekly_plan_versions WHERE owner_id = ? AND week_start = ?", args: [ownerId, weekStart] });
  await db.execute({
    sql: "INSERT OR IGNORE INTO weekly_plan_versions (id, owner_id, week_start, version, snapshot_json) VALUES (?, ?, ?, ?, ?)",
    args: [nanoid(), ownerId, weekStart, Number(r.rows[0]?.v ?? 1), JSON.stringify(snapshot).slice(0, 20000)],
  });
}

// ------------------------------------------------------------
// MISSÕES
// ------------------------------------------------------------

export const EXECUTOR_RANKS = [
  { min: 0, title: "Recruta" },
  { min: 10, title: "Aventureiro" },
  { min: 50, title: "Explorador Avançado" },
  { min: 150, title: "Conquistador" },
  { min: 400, title: "Lenda da Execução" },
] as const;

export type MissionTier = "comum" | "prioritaria" | "epica" | "campanha" | "concluida";

/** Regra única de categoria (precedência: concluída > épica > campanha > prioritária > comum). */
export function missionTier(t: { status: string; priority: string; difficulty: string | null; estimateMinutes: number | null; inCampaign: boolean; goalId: string | null }): MissionTier {
  if (t.status === DONE) return "concluida";
  if (t.difficulty === "epico" || (t.estimateMinutes ?? 0) >= 240) return "epica";
  if (t.inCampaign || t.goalId) return "campanha";
  if (t.priority === "Alta") return "prioritaria";
  return "comum";
}

const PRIORITY_ORDER: Record<string, number> = { Alta: 0, Média: 1, Baixa: 2 };

export async function getMissionsHub(db: Client, ownerId: string) {
  const { tz, today } = await userDayContext(db, ownerId);
  const weekStart = mondayKey(today);
  const [tasksR, doneR, subR, focusR, capacity] = await Promise.all([
    db.execute({
      sql: `SELECT t.id, t.title, t.description, t.status, t.priority, t.difficulty, t.due_date, t.planned_date, t.estimate_minutes, t.time_spent_minutes,
              t.project_id, t.goal_id, p.name AS project_name, g.title AS goal_title,
              (SELECT c.title FROM campaign_tasks ct JOIN campaigns c ON c.id = ct.campaign_id WHERE ct.task_id = t.id AND ct.owner_id = t.owner_id LIMIT 1) AS campaign_title
            FROM tasks t LEFT JOIN projects p ON p.id = t.project_id AND p.owner_id = t.owner_id LEFT JOIN goals g ON g.id = t.goal_id AND g.owner_id = t.owner_id
            WHERE t.owner_id = ? AND t.parent_task_id IS NULL AND t.status <> ?`,
      args: [ownerId, DONE],
    }),
    db.execute({ sql: "SELECT completed_at FROM tasks WHERE owner_id = ? AND status = ? AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 2000", args: [ownerId, DONE] }),
    db.execute({ sql: "SELECT task_id, COUNT(*) AS n, SUM(done) AS d FROM subtasks WHERE owner_id = ? GROUP BY task_id", args: [ownerId] }),
    db.execute({ sql: "SELECT COALESCE(SUM(actual_minutes), 0) AS m FROM focus_sessions WHERE owner_id = ? AND started_at >= ?", args: [ownerId, shiftDayKey(weekStart, -1)] }),
    weekCapacity(db, ownerId, weekStart, new Set()),
  ]);
  const subBy = new Map((subR.rows as unknown as Row[]).map((r) => [String(r.task_id), { total: Number(r.n), done: Number(r.d ?? 0) }]));
  const tasks = (tasksR.rows as unknown as Row[]).map((t) => {
    const sub = subBy.get(String(t.id)) ?? { total: 0, done: 0 };
    const view = {
      id: String(t.id),
      title: String(t.title),
      description: t.description ? String(t.description) : null,
      status: String(t.status),
      priority: String(t.priority),
      difficulty: t.difficulty ? String(t.difficulty) : null,
      dueDate: t.due_date ? String(t.due_date).slice(0, 10) : null,
      plannedDate: t.planned_date ? String(t.planned_date) : null,
      estimateMinutes: t.estimate_minutes == null ? null : Number(t.estimate_minutes),
      timeSpentMinutes: Number(t.time_spent_minutes ?? 0),
      projectId: t.project_id ? String(t.project_id) : null,
      projectName: t.project_name ? String(t.project_name) : null,
      goalId: t.goal_id ? String(t.goal_id) : null,
      goalTitle: t.goal_title ? String(t.goal_title) : null,
      campaignTitle: t.campaign_title ? String(t.campaign_title) : null,
      subtasks: sub,
      // Base de XP da regra central por prioridade (os bônus do dia dependem do momento da conclusão).
      baseXp: GAMIFICATION_RULES.task.xpByPriority[String(t.priority)] ?? 0,
      overdue: false,
      tier: "comum" as MissionTier,
    };
    view.overdue = (!!view.dueDate && view.dueDate < today) || (!!view.plannedDate && view.plannedDate < today);
    view.tier = missionTier({ status: view.status, priority: view.priority, difficulty: view.difficulty, estimateMinutes: view.estimateMinutes, inCampaign: !!view.campaignTitle, goalId: view.goalId });
    return view;
  });

  // Missão em destaque: em andamento > atrasada > prioridade > prazo mais próximo.
  const featured =
    [...tasks].sort(
      (a, b) =>
        Number(b.status === "Em Andamento") - Number(a.status === "Em Andamento") ||
        Number(b.overdue) - Number(a.overdue) ||
        (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3) ||
        (a.dueDate ?? a.plannedDate ?? "9999").localeCompare(b.dueDate ?? b.plannedDate ?? "9999"),
    )[0] ?? null;
  let featuredSubtasks: Array<{ id: string; title: string; done: boolean; position: number }> = [];
  if (featured) featuredSubtasks = await listSubtasks(db, ownerId, featured.id);

  const doneDays = new Set((doneR.rows as unknown as Row[]).map((r) => localDayOfStored(String(r.completed_at), tz)));
  const combo = streakEndingToday(doneDays, today);
  const history = Array.from({ length: 14 }, (_, i) => shiftDayKey(today, i - 13)).map((d) => ({
    day: d,
    completed: (doneR.rows as unknown as Row[]).filter((r) => localDayOfStored(String(r.completed_at), tz) === d).length,
  }));
  const totalDone = doneR.rows.length;
  const last14 = history.filter((h) => h.completed > 0).length;

  const counts: Record<MissionTier, number> = { comum: 0, prioritaria: 0, epica: 0, campanha: 0, concluida: totalDone };
  for (const t of tasks) counts[t.tier]++;

  const pendingEstimate = tasks.reduce((a, t) => a + (t.estimateMinutes ?? 0), 0);
  const freeWeek = capacity.filter((c) => c.date >= today).reduce((a, c) => a + c.capacityMinutes, 0);

  return {
    today,
    rank: tierRank(EXECUTOR_RANKS, totalDone),
    consistency: { activeDaysLast14: last14, pct: Math.round((last14 / 14) * 100) },
    combo: { current: combo, best: bestStreak(doneDays), todayDone: history[13]!.completed, history, milestones: [3, 7, 14, 30].map((m) => ({ days: m, reached: bestStreak(doneDays) >= m })) },
    featured: featured ? { ...featured, subtaskList: featuredSubtasks } : null,
    tiers: tasks.map((t) => ({ id: t.id, tier: t.tier })),
    counts,
    load: {
      pendingEstimateMinutes: pendingEstimate,
      unestimated: tasks.filter((t) => t.estimateMinutes == null).length,
      executedWeekMinutes: Number(focusR.rows[0]?.m ?? 0),
      pending: tasks.length,
      overdue: tasks.filter((t) => t.overdue).length,
      byPriority: ["Alta", "Média", "Baixa"].map((p) => ({ priority: p, count: tasks.filter((t) => t.priority === p).length })),
      freeMinutesRestOfWeek: freeWeek,
      occupancyPct: freeWeek > 0 ? Math.round((pendingEstimate / freeWeek) * 100) : null,
    },
  };
}

// ---------------- Subtarefas (tabela subtasks, já existente desde a 0003) ----------------

async function ownedTask(db: Client, ownerId: string, taskId: string) {
  const r = await db.execute({ sql: "SELECT id, status FROM tasks WHERE id = ? AND owner_id = ?", args: [taskId, ownerId] });
  if (!r.rows[0]) throw new PlanningError("Missão não encontrada.", 404);
  return { status: String(r.rows[0].status) };
}

export async function listSubtasks(db: Client, ownerId: string, taskId: string) {
  const r = await db.execute({ sql: "SELECT id, title, done, position FROM subtasks WHERE owner_id = ? AND task_id = ? ORDER BY position, created_at", args: [ownerId, taskId] });
  return (r.rows as unknown as Row[]).map((s) => ({ id: String(s.id), title: String(s.title), done: Number(s.done) === 1, position: Number(s.position) }));
}

export async function addSubtasks(db: Client, ownerId: string, taskId: string, titles: string[]) {
  await ownedTask(db, ownerId, taskId);
  const pos = await db.execute({ sql: "SELECT COALESCE(MAX(position), -1) + 1 AS p FROM subtasks WHERE owner_id = ? AND task_id = ?", args: [ownerId, taskId] });
  let p = Number(pos.rows[0]?.p ?? 0);
  const clean = titles.map((t) => t.trim().slice(0, 200)).filter(Boolean).slice(0, 30);
  if (clean.length === 0) return listSubtasks(db, ownerId, taskId);
  await db.batch(
    clean.map((title) => ({ sql: "INSERT INTO subtasks (id, task_id, owner_id, title, position) VALUES (?, ?, ?, ?, ?)", args: [nanoid(), taskId, ownerId, title, p++] })),
    "write",
  );
  return listSubtasks(db, ownerId, taskId);
}

/**
 * Marca/desmarca subtarefa. Automação "Progresso por subtarefas": a primeira
 * subtarefa concluída move a missão de Backlog/A Fazer para Em Andamento.
 * Concluir a MISSÃO continua sendo ação do usuário (é ela que dá XP).
 */
export async function toggleSubtask(db: Client, ownerId: string, id: string, done: boolean) {
  const r = await db.execute({ sql: "SELECT task_id FROM subtasks WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  const row = r.rows[0];
  if (!row) throw new PlanningError("Subtarefa não encontrada.", 404);
  const taskId = String(row.task_id);
  await db.execute({ sql: "UPDATE subtasks SET done = ? WHERE id = ? AND owner_id = ?", args: [done ? 1 : 0, id, ownerId] });
  let moved = false;
  if (done) {
    const auto = await automationConfig(db, ownerId, "missions", "subtask_progress");
    if (auto.enabled) {
      const u = await db.execute({ sql: "UPDATE tasks SET status = 'Em Andamento', updated_at = datetime('now') WHERE id = ? AND owner_id = ? AND status IN ('Backlog', 'A Fazer')", args: [taskId, ownerId] });
      moved = u.rowsAffected > 0;
    }
  }
  const list = await listSubtasks(db, ownerId, taskId);
  return { taskId, subtasks: list, movedToInProgress: moved, allDone: list.length > 0 && list.every((s) => s.done) };
}

export async function deleteSubtask(db: Client, ownerId: string, id: string) {
  const r = await db.execute({ sql: "DELETE FROM subtasks WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  return r.rowsAffected > 0;
}

const BREAKDOWN_SCHEMA = {
  type: "object",
  properties: { subtasks: { type: "array", items: { type: "string" } }, estimateMinutes: { type: "number" }, note: { type: "string" } },
  required: ["subtasks"],
};

/** Mestre de Missões: proposta de subtarefas (NÃO grava — o usuário edita e aprova). */
export async function proposeBreakdown(db: Client, ownerId: string, taskId: string) {
  await ownedTask(db, ownerId, taskId);
  const r = await db.execute({ sql: "SELECT title, description, estimate_minutes FROM tasks WHERE id = ? AND owner_id = ?", args: [taskId, ownerId] });
  const t = r.rows[0] as unknown as Row;
  const existing = await listSubtasks(db, ownerId, taskId);
  const fallback = {
    ai: false,
    subtasks: ["Definir o resultado esperado", "Separar o material necessário", "Executar a parte principal", "Revisar e ajustar", "Registrar a conclusão"],
    estimateMinutes: t.estimate_minutes == null ? null : Number(t.estimate_minutes),
    note: "Roteiro genérico (IA indisponível). Edite os passos antes de salvar.",
  };
  const config = await getGeminiConfig();
  if (!config) return fallback;
  const prompt = `Divida a missão abaixo em 3 a 8 subtarefas curtas, concretas e acionáveis (verbo no infinitivo), em português do Brasil.
Não invente informações que não estejam no texto. Se a descrição for vaga, use passos genéricos de execução.
Estime o esforço total em minutos apenas se houver base; caso contrário omita.
MISSÃO: ${str(t.title, 200)}
DESCRIÇÃO: ${str(t.description, 1500) ?? "(sem descrição)"}
SUBTAREFAS JÁ EXISTENTES (não repetir): ${existing.map((s) => s.title).join("; ") || "nenhuma"}`;
  const out = await generateText(prompt, config, { responseSchema: BREAKDOWN_SCHEMA, timeoutMs: 20_000, retries: 1, maxOutputTokens: 800 });
  if (!out.ok) return fallback;
  const parsed = extractJson(out.text) as { subtasks?: unknown[]; estimateMinutes?: number; note?: string } | null;
  const list = (parsed?.subtasks ?? []).map((s) => str(s, 200)).filter((s): s is string => !!s).slice(0, 8);
  if (list.length === 0) return fallback;
  return {
    ai: true,
    subtasks: list,
    estimateMinutes: typeof parsed?.estimateMinutes === "number" && parsed.estimateMinutes > 0 ? Math.round(Math.min(2400, parsed.estimateMinutes)) : null,
    note: str(parsed?.note, 300) ?? "Sugestão da IA — revise antes de salvar.",
  };
}

/** Define (ou limpa) o dia planejado de uma missão — usado pela Torre do Tempo e pelo Mestre de Missões. */
export async function setTaskPlannedDate(db: Client, ownerId: string, taskId: string, plannedDate: string | null) {
  const r = await db.execute({ sql: "UPDATE tasks SET planned_date = ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [plannedDate, taskId, ownerId] });
  if (r.rowsAffected === 0) throw new PlanningError("Missão não encontrada.", 404);
}

export async function runDueAlerts(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const { today } = await userDayContext(db, ownerId);
  const until = shiftDayKey(today, Number(config.daysBefore ?? 2));
  const r = await db.execute({
    sql: `SELECT title, substr(due_date, 1, 10) AS d FROM tasks WHERE owner_id = ? AND parent_task_id IS NULL AND status <> ? AND due_date IS NOT NULL AND substr(due_date, 1, 10) <= ? ORDER BY due_date LIMIT 50`,
    args: [ownerId, DONE, until],
  });
  const rows = r.rows as unknown as Row[];
  if (rows.length === 0) return { status: "skipped", summary: "Nenhuma missão vencendo nos próximos dias." };
  const overdue = rows.filter((x) => String(x.d) < today).length;
  const body = `${rows.length - overdue} missão(ões) vencendo em breve${overdue ? ` e ${overdue} atrasada(s)` : ""}. Próxima: ${String(rows.find((x) => String(x.d) >= today)?.title ?? rows[0]!.title)}.`;
  await notifyFromAutomation(db, ownerId, { eventType: "missions_due", title: "Prazos de missões", body, url: "/tarefas", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: body };
}

// ------------------------------------------------------------
// QUADRO DE AVISOS
// ------------------------------------------------------------

export async function getGuildHub(db: Client, ownerId: string) {
  const { tz, today } = await userDayContext(db, ownerId);
  const weekStart = mondayKey(today);
  const [board, claimedR, notifR, deadlinesR, eventsR, achR, reviewsR, studyR, habitR, projDoneR] = await Promise.all([
    getQuestBoard(db, ownerId),
    db.execute({ sql: "SELECT template_key, period, period_key, target, xp_reward, claimed_at FROM quest_assignments WHERE owner_id = ? AND claimed_at IS NOT NULL ORDER BY claimed_at DESC LIMIT 400", args: [ownerId] }),
    db.execute({ sql: "SELECT id, event_type, title, body, url, created_at FROM in_app_notifications WHERE owner_id = ? ORDER BY created_at DESC LIMIT 8", args: [ownerId] }),
    db.execute({
      sql: `SELECT 'task' AS kind, title, substr(due_date, 1, 10) AS d FROM tasks WHERE owner_id = ? AND status <> ? AND due_date IS NOT NULL AND substr(due_date, 1, 10) BETWEEN ? AND ?
            UNION ALL SELECT 'goal', title, substr(due_date, 1, 10) FROM goals WHERE owner_id = ? AND status = 'active' AND due_date IS NOT NULL AND substr(due_date, 1, 10) BETWEEN ? AND ?
            UNION ALL SELECT 'academic', title, due_date FROM academic_deadlines WHERE owner_id = ? AND done = 0 AND due_date BETWEEN ? AND ?
            ORDER BY d LIMIT 8`,
      args: [ownerId, DONE, today, shiftDayKey(today, 7), ownerId, today, shiftDayKey(today, 7), ownerId, today, shiftDayKey(today, 7)],
    }),
    db.execute({ sql: "SELECT id, title, starts_at, all_day FROM events WHERE owner_id = ? AND starts_at >= ? AND starts_at < date(?, '+8 day') ORDER BY starts_at LIMIT 6", args: [ownerId, today, today] }),
    db.execute({
      sql: "SELECT a.title, ua.unlocked_at FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id WHERE ua.owner_id = ? ORDER BY ua.unlocked_at DESC LIMIT 4",
      args: [ownerId],
    }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM flashcards WHERE owner_id = ? AND due_date <= ?", args: [ownerId, today] }).catch(() => ({ rows: [{ n: 0 }] })),
    db.execute({ sql: "SELECT COALESCE(SUM(duration_minutes), 0) AS m FROM study_sessions WHERE owner_id = ? AND occurred_at >= ?", args: [ownerId, weekStart] }),
    db.execute({ sql: "SELECT COUNT(DISTINCT entry_date) AS n FROM habit_entries WHERE owner_id = ? AND entry_date >= ?", args: [ownerId, weekStart] }),
    db.execute({ sql: "SELECT completed_at FROM tasks WHERE owner_id = ? AND status = ? AND project_id IS NOT NULL AND completed_at >= ?", args: [ownerId, DONE, shiftDayKey(weekStart, -1)] }),
  ]);

  const claimed = claimedR.rows as unknown as Row[];
  // Combo: dias seguidos com pelo menos uma quest diária resgatada (no fuso do usuário).
  const comboDays = new Set(claimed.filter((c) => String(c.period) === "daily").map((c) => String(c.period_key)));
  const quests = [...board.daily.quests, ...board.weekly.quests];
  const claimable = quests.filter((q) => q.completed && !q.claimed);
  const studyGoal = await db.execute({ sql: "SELECT COALESCE(SUM(weekly_study_goal_minutes), 0) AS m FROM educations WHERE owner_id = ? AND progress_pct < 100", args: [ownerId] });
  const elapsedDays = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${weekStart}T00:00:00Z`)) / 86_400_000) + 1;

  // Eventos da guilda: desafios da semana ligados a dados reais (sem participantes nem ranking social).
  const studyTarget = Number(studyGoal.rows[0]?.m ?? 0);
  const projDone = (projDoneR.rows as unknown as Row[]).filter((r) => localDayOfStored(String(r.completed_at), tz) >= weekStart).length;
  const events = [
    studyTarget > 0 ? { key: "study_week", title: "Semana de Estudos", description: "Alcance sua meta semanal de estudo.", current: Math.min(Number(studyR.rows[0]?.m ?? 0), studyTarget), target: studyTarget, unit: "min" } : null,
    { key: "consistency", title: "Desafio de Consistência", description: "Registre hábitos em todos os dias da semana.", current: Math.min(Number(habitR.rows[0]?.n ?? 0), 7), target: 7, unit: "dias" },
    { key: "projects", title: "Jornada de Conclusão de Projetos", description: "Conclua 5 missões de projetos nesta semana.", current: Math.min(projDone, 5), target: 5, unit: "missões" },
  ].filter((e): e is NonNullable<typeof e> => !!e);

  const DEADLINE_LABEL: Record<string, string> = { task: "Missão", goal: "Meta", academic: "Acadêmico" };
  return {
    today,
    board,
    combo: { current: streakEndingToday(comboDays, today), best: bestStreak(comboDays) },
    progress: {
      dailyDone: board.daily.quests.filter((q) => q.completed).length,
      dailyTotal: board.daily.quests.length,
      weeklyDone: board.weekly.quests.filter((q) => q.completed).length,
      weeklyTotal: board.weekly.quests.length,
      weekElapsedDays: elapsedDays,
    },
    chest: { claimable: claimable.map((q) => ({ id: q.id, title: q.title, xp: q.xpReward })), xp: claimable.reduce((a, q) => a + q.xpReward, 0), bonusReady: !board.daily.bonus.claimed && board.daily.bonus.completed >= board.daily.bonus.total && board.daily.bonus.total > 0 },
    history: claimed.slice(0, 20).map((c) => {
      const tpl = templateByKey(String(c.template_key));
      return { title: tpl ? tpl.title(Number(c.target)) : String(c.template_key), templateKey: String(c.template_key), period: String(c.period), xp: Number(c.xp_reward), claimedAt: String(c.claimed_at) };
    }),
    claimedTotal: claimed.length,
    notices: {
      notifications: (notifR.rows as unknown as Row[]).map((n) => ({ id: String(n.id), title: String(n.title), body: n.body ? String(n.body) : null, url: n.url ? String(n.url) : null, createdAt: String(n.created_at) })),
      deadlines: (deadlinesR.rows as unknown as Row[]).map((d) => ({ kind: DEADLINE_LABEL[String(d.kind)] ?? String(d.kind), title: String(d.title), date: String(d.d) })),
      events: (eventsR.rows as unknown as Row[]).map((e) => ({ id: String(e.id), title: String(e.title), startsAt: String(e.starts_at), allDay: Number(e.all_day) === 1 })),
      achievements: (achR.rows as unknown as Row[]).map((a) => ({ title: String(a.title), unlockedAt: String(a.unlocked_at) })),
      reviewsDue: Number((reviewsR.rows[0] as Row | undefined)?.n ?? 0),
    },
    events,
  };
}

export async function runQuestReminder(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const board = await getQuestBoard(db, ownerId);
  const open = board.daily.quests.filter((q) => !q.completed);
  const claimable = [...board.daily.quests, ...board.weekly.quests].filter((q) => q.completed && !q.claimed);
  if (open.length === 0 && claimable.length === 0) return { status: "skipped", summary: "Quests do dia concluídas e resgatadas." };
  const body = `${claimable.length ? `${claimable.length} recompensa(s) esperando no baú. ` : ""}${open.length ? `Quests de hoje: ${open.map((q) => q.title).slice(0, 3).join(", ")}.` : ""}`.trim();
  await notifyFromAutomation(db, ownerId, { eventType: "quests_reminder", title: "Quadro de Avisos", body, url: "/quests", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: body };
}

export { idList };
