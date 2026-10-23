import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { award, todayKeyFor } from "./gamificationService.js";
import { computeCapacitySummary, getDayTasks } from "./capacityPlannerService.js";
import { weekStartOf } from "./recordsService.js";

/**
 * Conselho de Guerra — planejamento da semana (o par "para frente" da
 * Revisão Semanal). Regras:
 *  - nada é gravado até o usuário "selar o plano" (proposta → confirmação);
 *  - a distribuição vai para tasks.planned_date (o dia em que pretendo fazer);
 *  - a aderência (planejadas × concluídas) é sempre derivada das tarefas,
 *    nunca copiada para weekly_plans.
 */

export const FOCUS_TYPES = ["campaign", "project", "goal"] as const;
export type FocusType = (typeof FOCUS_TYPES)[number];
export interface FocusRef {
  type: FocusType;
  id: string;
}
export const MAX_FOCUS = 3;
const MAX_CANDIDATES = 80;
/** Recompensa modesta por selar o plano (uma vez por semana, idempotente pelo ledger). */
export const WAR_COUNCIL_REWARD = { xp: 15, coins: 3 } as const;
const DONE = "Concluído";
type Priority = "Baixa" | "Média" | "Alta";

export class WarCouncilError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/* ----------------------------- datas ----------------------------- */

export function addDaysKey(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysKey(weekStart, i));
}

export function isMonday(key: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && weekStartOf(key) === key;
}

/** Semana sugerida: no fim de semana, a próxima; nos demais dias, a atual. */
export function defaultPlanningWeek(today: string): string {
  const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7; // segunda = 0
  return dow >= 5 ? addDaysKey(weekStartOf(today), 7) : weekStartOf(today);
}

/* --------------------------- distribuição --------------------------- */

export interface PlanTaskInput {
  id: string;
  estimateMinutes: number | null;
  dueDate: string | null; // YYYY-MM-DD (ou com hora — só a data importa)
  priority: Priority;
  plannedDate: string | null;
}

export interface PlanDayCapacity {
  date: string;
  capacityMinutes: number;
}

export interface PlanAssignment {
  taskId: string;
  plannedDate: string | null;
  /** Motivo quando a missão ficou sem dia (o usuário decide). */
  unplacedReason: string | null;
}

export interface DistributionResult {
  assignments: PlanAssignment[];
  dayLoads: Array<{ date: string; capacityMinutes: number; plannedMinutes: number; tasks: number }>;
}

const PRIORITY_RANK: Record<Priority, number> = { Alta: 0, Média: 1, Baixa: 2 };

/**
 * Distribui missões pelos dias da semana respeitando a capacidade livre
 * real de cada dia (mesma conta do Capacity Planner). Puro e testável.
 *  - dias anteriores a `firstDay` (hoje, se a semana já começou) ficam fora;
 *  - missão com prazo na semana nunca vai para depois do prazo;
 *  - atrasadas vão para o primeiro dia que comporta;
 *  - as demais equilibram (dia com mais folga);
 *  - sem estimativa não consome capacidade (nunca inventamos duração):
 *    vai para o dia com menos missões;
 *  - um dia planejado anteriormente e ainda válido é mantido.
 */
export function distributeTasks(tasks: PlanTaskInput[], days: PlanDayCapacity[], firstDay: string): DistributionResult {
  const usable = days.filter((d) => d.date >= firstDay);
  const remaining = new Map(usable.map((d) => [d.date, Math.max(0, d.capacityMinutes)]));
  const count = new Map(usable.map((d) => [d.date, 0]));
  const planned = new Map(usable.map((d) => [d.date, 0]));
  const lastDay = days[days.length - 1]?.date ?? firstDay;
  const assignments = new Map<string, PlanAssignment>();

  const place = (t: PlanTaskInput, date: string) => {
    const est = t.estimateMinutes ?? 0;
    remaining.set(date, (remaining.get(date) ?? 0) - est);
    planned.set(date, (planned.get(date) ?? 0) + est);
    count.set(date, (count.get(date) ?? 0) + 1);
    assignments.set(t.id, { taskId: t.id, plannedDate: date, unplacedReason: null });
  };

  // 1) Mantém o que o usuário já tinha planejado dentro da janela válida.
  const rest: PlanTaskInput[] = [];
  for (const t of tasks) {
    if (t.plannedDate && remaining.has(t.plannedDate)) place(t, t.plannedDate);
    else rest.push(t);
  }

  const due = (t: PlanTaskInput) => (t.dueDate ? t.dueDate.slice(0, 10) : null);
  rest.sort((a, b) => {
    const da = due(a) ?? "9999-12-31";
    const dbb = due(b) ?? "9999-12-31";
    if (da !== dbb) return da < dbb ? -1 : 1;
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  });

  for (const t of rest) {
    const d = due(t);
    const overdue = d != null && d < firstDay;
    const deadline = d != null && d >= firstDay && d <= lastDay ? d : null;
    const allowed = usable.map((u) => u.date).filter((date) => !deadline || date <= deadline);
    if (allowed.length === 0) {
      assignments.set(t.id, { taskId: t.id, plannedDate: null, unplacedReason: "Nenhum dia disponível na semana." });
      continue;
    }
    const est = t.estimateMinutes ?? 0;
    let chosen: string | undefined;
    if (est <= 0) {
      chosen = [...allowed].sort((a, b) => (count.get(a) ?? 0) - (count.get(b) ?? 0) || (a < b ? -1 : 1))[0];
    } else {
      const fitting = allowed.filter((date) => (remaining.get(date) ?? 0) >= est);
      if (overdue) chosen = fitting[0];
      else chosen = [...fitting].sort((a, b) => (remaining.get(b) ?? 0) - (remaining.get(a) ?? 0) || (a < b ? -1 : 1))[0];
    }
    if (chosen) place(t, chosen);
    else
      assignments.set(t.id, {
        taskId: t.id,
        plannedDate: null,
        unplacedReason: deadline ? "Sem capacidade livre até o prazo." : "Sem capacidade livre na semana.",
      });
  }

  return {
    assignments: tasks.map((t) => assignments.get(t.id)!),
    dayLoads: days.map((d) => ({
      date: d.date,
      capacityMinutes: d.date >= firstDay ? Math.max(0, d.capacityMinutes) : 0,
      plannedMinutes: planned.get(d.date) ?? 0,
      tasks: count.get(d.date) ?? 0,
    })),
  };
}

/* ----------------------------- focos ----------------------------- */

export interface FocusOption {
  type: FocusType;
  id: string;
  title: string;
  openTasks: number;
}

export async function listFocusOptions(db: Client, ownerId: string): Promise<FocusOption[]> {
  const [campaigns, projects, goals] = await Promise.all([
    db.execute({
      sql: `SELECT c.id, c.title, (SELECT COUNT(*) FROM campaign_tasks ct JOIN tasks t ON t.id = ct.task_id
              WHERE ct.campaign_id = c.id AND t.owner_id = c.owner_id AND t.status != ?) AS open_tasks
            FROM campaigns c WHERE c.owner_id = ? AND c.status IN ('planned', 'active') ORDER BY c.status = 'active' DESC, c.updated_at DESC`,
      args: [DONE, ownerId],
    }),
    db.execute({
      sql: `SELECT p.id, p.name AS title, (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.owner_id = p.owner_id AND t.status != ?) AS open_tasks
            FROM projects p WHERE p.owner_id = ? AND p.archived_at IS NULL AND COALESCE(p.status, 'active') NOT IN ('completed', 'cancelled', 'archived')
            ORDER BY p.created_at DESC`,
      args: [DONE, ownerId],
    }),
    db.execute({
      sql: `SELECT g.id, g.title, (SELECT COUNT(*) FROM tasks t WHERE t.goal_id = g.id AND t.owner_id = g.owner_id AND t.status != ?) AS open_tasks
            FROM goals g WHERE g.owner_id = ? AND g.status = 'active' ORDER BY g.created_at DESC`,
      args: [DONE, ownerId],
    }),
  ]);
  const map = (type: FocusType, rows: typeof campaigns.rows): FocusOption[] =>
    rows.map((r) => ({ type, id: String(r.id), title: String(r.title), openTasks: Number(r.open_tasks ?? 0) }));
  return [...map("campaign", campaigns.rows), ...map("project", projects.rows), ...map("goal", goals.rows)];
}

/** Valida tipos, limite e posse de cada foco (nunca aceita id de outro usuário). */
export async function validateFocus(db: Client, ownerId: string, focus: FocusRef[]): Promise<FocusRef[]> {
  if (focus.length > MAX_FOCUS) throw new WarCouncilError(`Escolha no máximo ${MAX_FOCUS} focos.`);
  const unique = [...new Map(focus.map((f) => [`${f.type}:${f.id}`, f])).values()];
  const table: Record<FocusType, string> = { campaign: "campaigns", project: "projects", goal: "goals" };
  for (const f of unique) {
    const r = await db.execute({ sql: `SELECT 1 FROM ${table[f.type]} WHERE id = ? AND owner_id = ?`, args: [f.id, ownerId] });
    if (r.rows.length === 0) throw new WarCouncilError("Foco não encontrado.", 404);
  }
  return unique;
}

/* --------------------------- candidatas --------------------------- */

export type CandidateReason = "focus" | "overdue" | "due_this_week" | "planned";

export interface CandidateTask {
  id: string;
  title: string;
  priority: Priority;
  status: string;
  estimateMinutes: number | null;
  dueDate: string | null;
  plannedDate: string | null;
  projectName: string | null;
  projectColor: string | null;
  reasons: CandidateReason[];
}

const idList = (n: number) => Array.from({ length: n }, () => "?").join(", ");

/** Missões candidatas: abertas dos focos + atrasadas + com prazo na semana + já planejadas na semana. */
export async function listCandidates(db: Client, ownerId: string, weekStart: string, focus: FocusRef[], today: string): Promise<CandidateTask[]> {
  const weekEnd = addDaysKey(weekStart, 6);
  const projectIds = focus.filter((f) => f.type === "project").map((f) => f.id);
  const goalIds = focus.filter((f) => f.type === "goal").map((f) => f.id);
  const campaignIds = focus.filter((f) => f.type === "campaign").map((f) => f.id);

  // Campanha conta como foco nas suas missões, nos projetos e na meta vinculados.
  if (campaignIds.length > 0) {
    const [cp, cg] = await Promise.all([
      db.execute({ sql: `SELECT project_id FROM campaign_projects WHERE owner_id = ? AND campaign_id IN (${idList(campaignIds.length)})`, args: [ownerId, ...campaignIds] }),
      db.execute({ sql: `SELECT goal_id FROM campaigns WHERE owner_id = ? AND goal_id IS NOT NULL AND id IN (${idList(campaignIds.length)})`, args: [ownerId, ...campaignIds] }),
    ]);
    projectIds.push(...cp.rows.map((r) => String(r.project_id)));
    goalIds.push(...cg.rows.map((r) => String(r.goal_id)));
  }

  const focusConds: string[] = [];
  const focusArgs: string[] = [];
  if (projectIds.length) {
    focusConds.push(`t.project_id IN (${idList(projectIds.length)})`);
    focusArgs.push(...projectIds);
  }
  if (goalIds.length) {
    focusConds.push(`t.goal_id IN (${idList(goalIds.length)})`);
    focusArgs.push(...goalIds);
  }
  if (campaignIds.length) {
    focusConds.push(`t.id IN (SELECT task_id FROM campaign_tasks WHERE owner_id = ? AND campaign_id IN (${idList(campaignIds.length)}))`);
    focusArgs.push(ownerId, ...campaignIds);
  }
  const focusExpr = focusConds.length ? `(${focusConds.join(" OR ")})` : "0";

  const r = await db.execute({
    sql: `SELECT t.id, t.title, t.priority, t.status, t.estimate_minutes, t.due_date, t.planned_date,
                 p.name AS project_name, p.color AS project_color,
                 ${focusExpr} AS is_focus
          FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
          WHERE t.owner_id = ? AND t.status != ?
            AND (${focusExpr}
                 OR (t.due_date IS NOT NULL AND date(t.due_date) < ?)
                 OR (t.due_date IS NOT NULL AND date(t.due_date) BETWEEN ? AND ?)
                 OR (t.planned_date BETWEEN ? AND ?))
          ORDER BY t.due_date IS NULL, t.due_date ASC, t.created_at ASC
          LIMIT ${MAX_CANDIDATES}`,
    args: [...focusArgs, ownerId, DONE, ...focusArgs, today, weekStart, weekEnd, weekStart, weekEnd],
  });

  return r.rows.map((row) => {
    const due = row.due_date ? String(row.due_date).slice(0, 10) : null;
    const plannedDate = row.planned_date ? String(row.planned_date) : null;
    const reasons: CandidateReason[] = [];
    if (Number(row.is_focus) === 1) reasons.push("focus");
    if (due && due < today) reasons.push("overdue");
    else if (due && due >= weekStart && due <= weekEnd) reasons.push("due_this_week");
    if (plannedDate && plannedDate >= weekStart && plannedDate <= weekEnd) reasons.push("planned");
    return {
      id: String(row.id),
      title: String(row.title),
      priority: (String(row.priority) as Priority) ?? "Média",
      status: String(row.status),
      estimateMinutes: row.estimate_minutes == null ? null : Number(row.estimate_minutes),
      dueDate: due,
      plannedDate,
      projectName: row.project_name == null ? null : String(row.project_name),
      projectColor: row.project_color == null ? null : String(row.project_color),
      reasons,
    };
  });
}

/** Capacidade livre real de cada dia: janela útil − agenda fixa − carga que não está no plano. */
export async function weekCapacity(db: Client, ownerId: string, weekStart: string, candidateIds: Set<string>): Promise<PlanDayCapacity[]> {
  return Promise.all(
    weekDays(weekStart).map(async (date) => {
      const [summary, dayTasks] = await Promise.all([computeCapacitySummary(db, ownerId, date), getDayTasks(db, ownerId, date)]);
      const candidateLoad = dayTasks.filter((t) => candidateIds.has(t.id)).reduce((s, t) => s + (t.estimateMinutes ?? 0), 0);
      const otherLoad = Math.max(0, summary.plannedMinutes - candidateLoad);
      return { date, capacityMinutes: Math.max(0, summary.freeMinutes - otherLoad) };
    }),
  );
}

/* ----------------------------- aderência ----------------------------- */

export interface Adherence {
  weekStart: string;
  planned: number;
  completed: number;
  pct: number | null;
  byDay: Array<{ date: string; planned: number; completed: number }>;
}

/** Planejadas × concluídas na semana — derivado de tasks.planned_date (nada copiado). */
export async function computeAdherence(db: Client, ownerId: string, weekStart: string): Promise<Adherence> {
  const days = weekDays(weekStart);
  const r = await db.execute({
    sql: `SELECT planned_date AS d, COUNT(*) AS planned, SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) AS completed
          FROM tasks WHERE owner_id = ? AND planned_date BETWEEN ? AND ? GROUP BY planned_date`,
    args: [DONE, ownerId, days[0], days[6]],
  });
  const byDate = new Map(r.rows.map((row) => [String(row.d), { planned: Number(row.planned), completed: Number(row.completed ?? 0) }]));
  const byDay = days.map((date) => ({ date, planned: byDate.get(date)?.planned ?? 0, completed: byDate.get(date)?.completed ?? 0 }));
  const planned = byDay.reduce((s, d) => s + d.planned, 0);
  const completed = byDay.reduce((s, d) => s + d.completed, 0);
  return { weekStart, planned, completed, pct: planned > 0 ? Math.round((completed / planned) * 100) : null, byDay };
}

/* ----------------------------- plano ----------------------------- */

export interface WeeklyPlan {
  id: string;
  weekStart: string;
  focus: FocusRef[];
  notes: string | null;
  sealedAt: string | null;
}

function parseFocus(raw: unknown): FocusRef[] {
  if (typeof raw !== "string") return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter(
      (f): f is FocusRef =>
        !!f && typeof f === "object" && (FOCUS_TYPES as readonly string[]).includes((f as FocusRef).type) && typeof (f as FocusRef).id === "string",
    );
  } catch {
    return [];
  }
}

export async function getPlan(db: Client, ownerId: string, weekStart: string): Promise<WeeklyPlan | null> {
  const r = await db.execute({ sql: "SELECT * FROM weekly_plans WHERE owner_id = ? AND week_start = ?", args: [ownerId, weekStart] });
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    weekStart: String(row.week_start),
    focus: parseFocus(row.focus),
    notes: row.notes == null ? null : String(row.notes),
    sealedAt: row.sealed_at == null ? null : String(row.sealed_at),
  };
}

/** Semanas que podem ser planejadas: a atual e até 4 à frente (o passado não se planeja). */
export function assertPlannableWeek(weekStart: string, today: string): void {
  if (!isMonday(weekStart)) throw new WarCouncilError("A semana precisa começar numa segunda-feira (YYYY-MM-DD).");
  const current = weekStartOf(today);
  if (weekStart < current) throw new WarCouncilError("Não é possível planejar uma semana que já passou.");
  if (weekStart > addDaysKey(current, 28)) throw new WarCouncilError("Planeje no máximo 4 semanas à frente.");
}

export async function getCouncilOverview(db: Client, ownerId: string, weekStartRaw?: string) {
  const today = await todayKeyFor(db, ownerId);
  const weekStart = weekStartRaw ?? defaultPlanningWeek(today);
  assertPlannableWeek(weekStart, today);
  const previousWeekStart = addDaysKey(weekStart, -7);
  const [plan, focusOptions, adherence, previousAdherence, previousPlan, reward] = await Promise.all([
    getPlan(db, ownerId, weekStart),
    listFocusOptions(db, ownerId),
    computeAdherence(db, ownerId, weekStart),
    computeAdherence(db, ownerId, previousWeekStart),
    getPlan(db, ownerId, previousWeekStart),
    db.execute({
      sql: "SELECT 1 FROM xp_events WHERE owner_id = ? AND source_type = 'review' AND source_id = ? AND event_type = 'sealed'",
      args: [ownerId, `war_council:${weekStart}`],
    }),
  ]);
  return {
    today,
    weekStart,
    weekEnd: addDaysKey(weekStart, 6),
    previousWeekStart,
    plan,
    previousPlanSealed: !!previousPlan?.sealedAt,
    focusOptions,
    adherence,
    previousAdherence,
    reward: { ...WAR_COUNCIL_REWARD, awarded: reward.rows.length > 0 },
  };
}

/** Proposta (não grava nada): candidatas + capacidade + distribuição sugerida. */
export async function buildProposal(db: Client, ownerId: string, weekStart: string, focusRaw: FocusRef[]) {
  const today = await todayKeyFor(db, ownerId);
  assertPlannableWeek(weekStart, today);
  const focus = await validateFocus(db, ownerId, focusRaw);
  const candidates = await listCandidates(db, ownerId, weekStart, focus, today);
  const capacity = await weekCapacity(db, ownerId, weekStart, new Set(candidates.map((c) => c.id)));
  const firstDay = today > weekStart ? today : weekStart;
  const distribution = distributeTasks(candidates, capacity, firstDay);
  return { weekStart, firstDay, candidates, ...distribution };
}

export interface SealInput {
  weekStart: string;
  focus: FocusRef[];
  notes?: string | null;
  assignments: Array<{ taskId: string; plannedDate: string | null }>;
  events?: Array<{ taskId: string; date: string; startTime: string; durationMinutes: number }>;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function toHHMM(minutes: number): string {
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * Selar o plano — o único ponto que grava: datas planejadas das missões,
 * blocos opcionais na Agenda e o registro do plano. Reselar a mesma semana
 * atualiza o plano (sem duplicar blocos nem XP).
 */
export async function sealPlan(db: Client, ownerId: string, input: SealInput) {
  const today = await todayKeyFor(db, ownerId);
  assertPlannableWeek(input.weekStart, today);
  const focus = await validateFocus(db, ownerId, input.focus);
  const days = new Set(weekDays(input.weekStart));
  const weekEnd = addDaysKey(input.weekStart, 6);

  for (const a of input.assignments) {
    if (a.plannedDate && !days.has(a.plannedDate)) throw new WarCouncilError("Todas as datas planejadas precisam estar dentro da semana.");
  }
  for (const e of input.events ?? []) {
    if (!days.has(e.date)) throw new WarCouncilError("Os blocos da Agenda precisam estar dentro da semana.");
    if (toMinutes(e.startTime) + e.durationMinutes > 24 * 60) throw new WarCouncilError("O bloco precisa terminar no mesmo dia.");
  }

  // Posse: todas as missões citadas precisam ser do usuário.
  const ids = [...new Set([...input.assignments.map((a) => a.taskId), ...(input.events ?? []).map((e) => e.taskId)])];
  const titles = new Map<string, string>();
  if (ids.length > 0) {
    const owned = await db.execute({ sql: `SELECT id, title FROM tasks WHERE owner_id = ? AND id IN (${idList(ids.length)})`, args: [ownerId, ...ids] });
    for (const r of owned.rows) titles.set(String(r.id), String(r.title));
    if (titles.size !== ids.length) throw new WarCouncilError("Missão não encontrada.", 404);
  }

  const statements: Array<{ sql: string; args: Array<string | number | null> }> = [];
  for (const a of input.assignments) {
    // Tirar do plano só limpa datas desta semana (não apaga planejamento de outra semana).
    statements.push(
      a.plannedDate
        ? { sql: "UPDATE tasks SET planned_date = ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [a.plannedDate, a.taskId, ownerId] }
        : {
            sql: "UPDATE tasks SET planned_date = NULL, updated_at = datetime('now') WHERE id = ? AND owner_id = ? AND planned_date BETWEEN ? AND ?",
            args: [a.taskId, ownerId, input.weekStart, weekEnd],
          },
    );
  }

  let eventsCreated = 0;
  for (const e of input.events ?? []) {
    const startsAt = `${e.date}T${e.startTime}:00`;
    const dup = await db.execute({
      sql: "SELECT 1 FROM events WHERE owner_id = ? AND source_type = 'task' AND source_id = ? AND starts_at = ?",
      args: [ownerId, e.taskId, startsAt],
    });
    if (dup.rows.length > 0) continue;
    statements.push({
      sql: `INSERT INTO events (id, owner_id, title, description, starts_at, ends_at, all_day, source_type, source_id)
            VALUES (?, ?, ?, ?, ?, ?, 0, 'task', ?)`,
      args: [nanoid(), ownerId, titles.get(e.taskId) ?? "Missão", "Bloco planejado no Conselho de Guerra.", startsAt, `${e.date}T${toHHMM(toMinutes(e.startTime) + e.durationMinutes)}:00`, e.taskId],
    });
    eventsCreated += 1;
  }

  statements.push({
    sql: `INSERT INTO weekly_plans (id, owner_id, week_start, focus, notes, sealed_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT (owner_id, week_start) DO UPDATE SET focus = excluded.focus, notes = excluded.notes,
            sealed_at = excluded.sealed_at, updated_at = datetime('now')`,
    args: [nanoid(), ownerId, input.weekStart, JSON.stringify(focus), input.notes?.trim() || null],
  });
  await db.batch(statements, "write");

  // XP só quando há ao menos uma missão com dia — selar um plano vazio não é planejar.
  const plannedCount = input.assignments.filter((a) => a.plannedDate).length;
  let xpAwarded = false;
  if (plannedCount > 0) {
    try {
      xpAwarded = await award(
        db,
        ownerId,
        {
          sourceType: "review",
          sourceId: `war_council:${input.weekStart}`,
          eventType: "sealed",
          xp: WAR_COUNCIL_REWARD.xp,
          coins: WAR_COUNCIL_REWARD.coins,
          label: `Conselho de Guerra: plano da semana ${input.weekStart}`,
        },
        today,
      );
    } catch (err) {
      console.warn("[conselho] falha ao conceder XP:", err instanceof Error ? err.message : "erro desconhecido");
    }
  }

  return {
    plan: await getPlan(db, ownerId, input.weekStart),
    adherence: await computeAdherence(db, ownerId, input.weekStart),
    plannedCount,
    eventsCreated,
    xpAwarded,
  };
}

/** Eventos de Timeline: um por plano selado (com o XP real do ledger). */
export async function warCouncilTimelineEvents(db: Client, ownerId: string, from: string, to: string) {
  const r = await db.execute({
    sql: `SELECT wp.id, wp.week_start, wp.sealed_at AS at, x.xp, (SELECT amount FROM coin_ledger c WHERE c.owner_id = wp.owner_id AND c.source_type = 'review'
              AND c.source_id = 'war_council:' || wp.week_start AND c.event_type = 'sealed') AS coins
          FROM weekly_plans wp
          LEFT JOIN xp_events x ON x.owner_id = wp.owner_id AND x.source_type = 'review' AND x.source_id = 'war_council:' || wp.week_start AND x.event_type = 'sealed'
          WHERE wp.owner_id = ? AND wp.sealed_at IS NOT NULL AND wp.sealed_at >= date(?) AND wp.sealed_at < date(?, '+1 day')`,
    args: [ownerId, from, to],
  });
  return r.rows.map((row) => {
    const [y, m, d] = String(row.week_start).split("-");
    return {
      type: "war_council",
      icon: "🗺️",
      id: `war-council-${String(row.id)}`,
      label: `Plano da semana selado (${d}/${m}/${y})`,
      at: String(row.at),
      ...(Number(row.xp ?? 0) > 0 ? { xp: Number(row.xp), coins: Number(row.coins ?? 0) } : {}),
    };
  });
}
