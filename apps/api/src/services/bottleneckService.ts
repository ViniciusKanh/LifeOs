import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { bottleneckConfig as C } from "../config/bottlenecks.js";
import { habitAdherence } from "./campaignEngine.js";
import { loadCampaigns } from "./campaignsService.js";
import { computeCapacitySummary, getEnergyForecast, getFreeWindows, getPlannedBlocks } from "./capacityPlannerService.js";
import { todayKeyFor, userTimezone } from "./gamificationService.js";
import { getSignalsDashboard } from "./signalsService.js";
import {
  analyzeBottlenecksPure,
  expandedGraph,
  type BottleneckAnalysis,
  type CapacityDay,
  type DependencyGraph,
  type EngineInput,
  type EngineTask,
  type FreeSlot,
} from "./bottleneckEngine.js";

/**
 * Detector de Gargalos — camada de dados. Carrega em lote (sem N+1) os
 * registros reais do usuário, monta a entrada da engine determinística e
 * guarda o resultado em cache por usuário. O cache é invalidado sozinho por
 * uma "impressão digital" barata dos dados (contagens + últimas edições).
 * Nenhuma função daqui altera dados, exceto agendar o Focus confirmado.
 */

export class BottleneckError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export type AnalysisPeriod = "today" | "7d" | "30d";
const PERIOD_DAYS: Record<AnalysisPeriod, number> = { today: 1, "7d": 7, "30d": 14 };

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? null : String(v));
const n = (v: unknown) => Number(v ?? 0);
const day = (v: unknown) => (v == null ? null : String(v).slice(0, 10));
const addDays = (d: string, k: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + k);
  return x.toISOString().slice(0, 10);
};
const DONE = "Concluído";

function nowTimeIn(tz: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}

/* ------------------------------- Impressão digital ------------------------------- */

/**
 * Uma única query barata: só MAX() em colunas indexadas (owner_id, coluna),
 * que o banco resolve lendo 1 linha — nada de COUNT(*) varrendo o histórico.
 * Edições de tarefas mudam updated_at; exclusões e ajustes finos que não
 * mexem nessas colunas são cobertos pelo TTL curto do cache.
 */
async function fingerprint(db: Client, ownerId: string, today: string): Promise<string> {
  const r = await db.execute({
    sql: `SELECT
      (SELECT MAX(updated_at) FROM tasks WHERE owner_id = ?1) AS t,
      (SELECT MAX(completed_at) FROM tasks WHERE owner_id = ?1 AND status = 'Concluído') AS tc,
      (SELECT COUNT(*) FROM task_dependencies d JOIN tasks x ON x.id = d.task_id WHERE x.owner_id = ?1) AS d,
      (SELECT MAX(updated_at) FROM projects WHERE owner_id = ?1) AS p,
      (SELECT MAX(updated_at) FROM campaigns WHERE owner_id = ?1) AS c,
      (SELECT MAX(completed_at) FROM campaign_milestones WHERE owner_id = ?1) AS m,
      (SELECT MAX(updated_at) FROM goals WHERE owner_id = ?1) AS g,
      (SELECT MAX(entry_date) FROM habit_entries WHERE owner_id = ?1) AS h,
      (SELECT MAX(date) FROM planned_time_blocks WHERE owner_id = ?1) AS b,
      (SELECT MAX(starts_at) FROM events WHERE owner_id = ?1) AS e,
      (SELECT MAX(started_at) FROM focus_sessions WHERE owner_id = ?1) AS f,
      (SELECT MAX(recorded_at) FROM mood_entries WHERE owner_id = ?1) AS mo,
      (SELECT MAX(went_to_bed_at) FROM sleep_entries WHERE owner_id = ?1) AS sl`,
    args: [ownerId],
  });
  const row = r.rows[0] as unknown as Row;
  return `${today}|${Object.values(row ?? {}).join("|")}`;
}

/* ------------------------------- Carga dos dados ------------------------------- */

export async function loadEngineInput(db: Client, ownerId: string, period: AnalysisPeriod = "7d"): Promise<EngineInput> {
  const tz = await userTimezone(db, ownerId);
  const today = await todayKeyFor(db, ownerId);
  const horizon = PERIOD_DAYS[period];
  const habitFrom = addDays(today, -(C.habit.windowDays - 1));
  const [tasks, deps, focusAct, timeAct, projects, campaigns, goals, habits, habitEntries, campaignHabits, campaignTaskLinks, campaignProjectLinks, focusHours, signals, energy] = await Promise.all([
    db.execute({
      sql: `SELECT id, title, status, priority, due_date, estimate_minutes, time_spent_minutes, project_id, goal_id, updated_at, completed_at
            FROM tasks WHERE owner_id = ? AND parent_task_id IS NULL`,
      args: [ownerId],
    }),
    // Só arestas cujas DUAS pontas pertencem ao usuário (isolamento).
    db.execute({
      sql: `SELECT d.task_id, d.depends_on_id FROM task_dependencies d
            JOIN tasks a ON a.id = d.task_id AND a.owner_id = ?
            JOIN tasks b ON b.id = d.depends_on_id AND b.owner_id = ?`,
      args: [ownerId, ownerId],
    }),
    db.execute({ sql: "SELECT task_id, MAX(started_at) AS last FROM focus_sessions WHERE owner_id = ? AND task_id IS NOT NULL GROUP BY task_id", args: [ownerId] }),
    db.execute({ sql: "SELECT task_id, MAX(started_at) AS last FROM time_entries WHERE owner_id = ? AND task_id IS NOT NULL GROUP BY task_id", args: [ownerId] }),
    db.execute({ sql: "SELECT id, name, status, due_date, priority FROM projects WHERE owner_id = ? AND archived_at IS NULL", args: [ownerId] }),
    loadCampaigns(db, ownerId),
    db.execute({ sql: "SELECT id, title, due_date, status FROM goals WHERE owner_id = ?", args: [ownerId] }),
    db.execute({ sql: "SELECT id, name, frequency, target_count, substr(created_at, 1, 10) AS created_day FROM habits WHERE owner_id = ? AND archived_at IS NULL", args: [ownerId] }),
    db.execute({ sql: "SELECT habit_id, entry_date, count FROM habit_entries WHERE owner_id = ? AND entry_date >= ?", args: [ownerId, habitFrom] }),
    db.execute({ sql: "SELECT campaign_id, habit_id FROM campaign_habits WHERE owner_id = ?", args: [ownerId] }),
    db.execute({ sql: "SELECT campaign_id, task_id FROM campaign_tasks WHERE owner_id = ?", args: [ownerId] }),
    db.execute({ sql: "SELECT campaign_id, project_id FROM campaign_projects WHERE owner_id = ?", args: [ownerId] }),
    // Horário histórico de foco do próprio usuário (minutos concluídos por hora de início).
    db.execute({
      sql: `SELECT CAST(strftime('%H', started_at) AS INTEGER) AS h, COUNT(*) AS n, SUM(COALESCE(actual_minutes, planned_minutes, 0)) AS mins
            FROM focus_sessions WHERE owner_id = ? AND ended_at IS NOT NULL AND started_at >= datetime('now', '-60 days') GROUP BY h ORDER BY mins DESC, h ASC LIMIT 1`,
      args: [ownerId],
    }),
    getSignalsDashboard(db, ownerId, period === "today" ? "today" : period === "7d" ? "7d" : "30d").catch(() => null),
    getEnergyForecast(db, ownerId).catch(() => null),
  ]);

  const lastBy = new Map<string, string>();
  const bump = (id: string, d: string | null) => {
    if (d && (!lastBy.has(id) || d > lastBy.get(id)!)) lastBy.set(id, d);
  };
  for (const r of tasks.rows) bump(String(r.id), day(r.updated_at));
  for (const r of [...focusAct.rows, ...timeAct.rows]) bump(String(r.task_id), day(r.last));
  const depsBy = new Map<string, string[]>();
  for (const r of deps.rows) depsBy.set(String(r.task_id), [...(depsBy.get(String(r.task_id)) ?? []), String(r.depends_on_id)]);

  const engineTasks: EngineTask[] = tasks.rows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    status: String(r.status),
    done: String(r.status) === DONE || r.completed_at != null,
    priority: String(r.priority ?? "Média"),
    dueDate: day(r.due_date),
    estimateMinutes: r.estimate_minutes == null ? null : n(r.estimate_minutes),
    timeSpentMinutes: n(r.time_spent_minutes),
    projectId: s(r.project_id),
    goalId: s(r.goal_id),
    lastActivity: lastBy.get(String(r.id)) ?? null,
    dependsOn: (depsBy.get(String(r.id)) ?? []).sort(),
  }));

  const habitCampaigns = new Map<string, string[]>();
  for (const r of campaignHabits.rows) habitCampaigns.set(String(r.habit_id), [...(habitCampaigns.get(String(r.habit_id)) ?? []), String(r.campaign_id)]);
  const entriesBy = new Map<string, Array<{ date: string; count: number }>>();
  for (const r of habitEntries.rows) entriesBy.set(String(r.habit_id), [...(entriesBy.get(String(r.habit_id)) ?? []), { date: String(r.entry_date), count: n(r.count) }]);

  // Capacidade real do período (Capacity Planner), um dia por vez em paralelo.
  const days = Array.from({ length: Math.max(horizon, C.focus.searchDays + 1) }, (_, i) => addDays(today, i));
  const [summaries, windows] = await Promise.all([
    Promise.all(days.slice(0, horizon).map((d) => computeCapacitySummary(db, ownerId, d))),
    Promise.all(days.slice(0, C.focus.searchDays + 1).map((d) => getFreeWindows(db, ownerId, d).then((w) => w.map((x) => ({ date: d, ...x }))))),
  ]);
  const capacity: CapacityDay[] = summaries.map((c) => ({ date: c.date, totalMinutes: c.totalMinutes, freeMinutes: c.freeMinutes, plannedMinutes: c.plannedMinutes, occupancy: c.occupancyRate }));
  const freeSlots: FreeSlot[] = windows.flat();
  const radar = (k: string) => signals?.radar.find((x) => x.key === k)?.value ?? null;
  const fh = focusHours.rows[0] as unknown as Row | undefined;

  const campaignTaskIds = new Map<string, string[]>();
  for (const r of campaignTaskLinks.rows) campaignTaskIds.set(String(r.campaign_id), [...(campaignTaskIds.get(String(r.campaign_id)) ?? []), String(r.task_id)]);
  const campaignProjectIds = new Map<string, string[]>();
  for (const r of campaignProjectLinks.rows) campaignProjectIds.set(String(r.campaign_id), [...(campaignProjectIds.get(String(r.campaign_id)) ?? []), String(r.project_id)]);

  return {
    today,
    nowTime: nowTimeIn(tz),
    tasks: engineTasks,
    projects: projects.rows.map((r) => ({ id: String(r.id), name: String(r.name), status: String(r.status ?? "active"), dueDate: day(r.due_date), priority: s(r.priority) })),
    campaigns: campaigns.map((c) => ({
      id: c.id,
      title: c.title,
      status: c.status,
      priority: c.priority,
      goalId: c.goalId,
      startDate: c.startDate,
      endDate: c.endDate,
      progressPct: c.progress.pct,
      missionsTotal: c.counts.missions,
      milestonesTotal: c.counts.milestones,
      weights: c.progress.weights,
      taskIds: campaignTaskIds.get(c.id) ?? [],
      projectIds: campaignProjectIds.get(c.id) ?? [],
    })),
    milestones: campaigns.flatMap((c) => c.milestones.map((m) => ({ id: m.id, campaignId: c.id, title: m.title, dueDate: m.dueDate, done: m.status === "completed", dependencyId: m.dependencyId }))),
    goals: goals.rows.map((r) => ({ id: String(r.id), title: String(r.title), dueDate: day(r.due_date), active: String(r.status) === "active" })),
    habits: habits.rows.map((r) => {
      const from = String(r.created_day) > habitFrom ? String(r.created_day) : habitFrom;
      const entries = entriesBy.get(String(r.id)) ?? [];
      const a = habitAdherence({ frequency: String(r.frequency), targetCount: n(r.target_count), from, today, entries });
      return { id: String(r.id), name: String(r.name), expected: a.expected, met: a.met, lastEntry: entries.map((e) => e.date).sort().pop() ?? null, campaignIds: habitCampaigns.get(String(r.id)) ?? [] };
    }),
    capacity,
    freeSlots,
    signals: { sleep: radar("sleep"), energy: radar("energy") },
    focusPattern: fh && n(fh.n) > 0 ? { hour: n(fh.h), sessions: n(fh.n) } : null,
    energyBestPeriod: energy?.bestPeriod ?? null,
  };
}

/* ------------------------------------ Cache ------------------------------------ */

const cache = new Map<string, { fp: string; at: number; result: BottleneckAnalysis; input: EngineInput }>();

/** Para testes. */
export function clearBottleneckCache() {
  cache.clear();
}

/**
 * Análise completa do usuário (determinística). Usa cache quando os dados
 * não mudaram; `refresh` força o recálculo (botão "Reanalisar").
 */
export async function analyzeBottlenecks(db: Client, ownerId: string, opts: { period?: AnalysisPeriod; refresh?: boolean } = {}): Promise<BottleneckAnalysis & { generatedAt: string; cached: boolean; period: AnalysisPeriod }> {
  const period = opts.period ?? "7d";
  const key = `${ownerId}:${period}`;
  const today = await todayKeyFor(db, ownerId);
  const fp = await fingerprint(db, ownerId, today);
  const hit = cache.get(key);
  if (!opts.refresh && hit && hit.fp === fp && Date.now() - hit.at < C.cache.ttlMs) return { ...hit.result, generatedAt: new Date(hit.at).toISOString(), cached: true, period };
  const input = await loadEngineInput(db, ownerId, period);
  const result = analyzeBottlenecksPure(input);
  cache.set(key, { fp, at: Date.now(), result, input });
  return { ...result, generatedAt: new Date().toISOString(), cached: false, period };
}

async function cachedInput(db: Client, ownerId: string, period: AnalysisPeriod): Promise<EngineInput> {
  await analyzeBottlenecks(db, ownerId, { period });
  return cache.get(`${ownerId}:${period}`)!.input;
}

export async function getBottleneckDetail(db: Client, ownerId: string, key: string, period: AnalysisPeriod = "7d") {
  const input = await cachedInput(db, ownerId, period);
  const a = analyzeBottlenecksPure(input, { detailKey: key });
  const detail = a.details[key];
  if (!detail) throw new BottleneckError("Item não encontrado na análise atual.", 404);
  // Atividade recente real do item (só tarefas têm histórico granular).
  const recent: Array<{ at: string; label: string }> = [];
  if (detail.candidate.type === "TASK") {
    const r = await db.execute({
      sql: `SELECT started_at AS at, COALESCE(actual_minutes, planned_minutes) AS mins FROM focus_sessions WHERE owner_id = ? AND task_id = ? ORDER BY started_at DESC LIMIT 5`,
      args: [ownerId, detail.candidate.entityId],
    });
    for (const x of r.rows) recent.push({ at: String(x.at), label: `Sessão de foco${x.mins ? ` (${n(x.mins)} min)` : ""}` });
    const t = input.tasks.find((x) => x.id === detail.candidate.entityId);
    if (t?.lastActivity) recent.push({ at: t.lastActivity, label: "Última atualização da tarefa" });
    recent.sort((a, b) => b.at.localeCompare(a.at));
  }
  return { ...detail, recent: recent.slice(0, 6) };
}

export async function getExpandedGraph(db: Client, ownerId: string, key: string, period: AnalysisPeriod = "7d"): Promise<DependencyGraph> {
  const g = expandedGraph(await cachedInput(db, ownerId, period), key, 4);
  if (!g) throw new BottleneckError("Item não encontrado na análise atual.", 404);
  return g;
}

/* ------------------------------ Sessão Focus (agenda) ------------------------------ */

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export interface FocusPreviewInput { taskId: string; date: string; start: string; minutes: number }

/**
 * Prévia do bloco de Focus: valida a tarefa (do usuário), calcula o fim,
 * conflitos reais com eventos e blocos e a carga do dia antes/depois.
 */
export async function previewFocusSession(db: Client, ownerId: string, input: FocusPreviewInput) {
  const task = await db.execute({ sql: "SELECT id, title, status FROM tasks WHERE id = ? AND owner_id = ?", args: [input.taskId, ownerId] });
  const t = task.rows[0];
  if (!t) throw new BottleneckError("Tarefa não encontrada.", 404);
  if (String(t.status) === DONE) throw new BottleneckError("Esta tarefa já foi concluída.", 409);
  const startM = toMin(input.start);
  const endM = startM + input.minutes;
  if (endM > 24 * 60) throw new BottleneckError("A sessão precisa terminar no mesmo dia.");
  const [blocks, events, summary] = await Promise.all([
    getPlannedBlocks(db, ownerId, input.date),
    db.execute({
      sql: "SELECT title, starts_at, ends_at, all_day FROM events WHERE owner_id = ? AND starts_at >= date(?) AND starts_at < date(?, '+1 day') ORDER BY starts_at",
      args: [ownerId, input.date, input.date],
    }),
    computeCapacitySummary(db, ownerId, input.date),
  ]);
  const conflicts: Array<{ title: string; start: string; end: string; kind: "event" | "block" }> = [];
  for (const b of blocks) if (toMin(b.startTime) < endM && toMin(b.endTime) > startM) conflicts.push({ title: b.title, start: b.startTime, end: b.endTime, kind: "block" });
  for (const e of events.rows) {
    if (n(e.all_day) === 1) continue;
    const st = String(e.starts_at).slice(11, 16);
    const en = e.ends_at ? String(e.ends_at).slice(11, 16) : toHHMM(Math.min(24 * 60 - 1, toMin(st) + 60));
    if (st && toMin(st) < endM && toMin(en) > startM) conflicts.push({ title: String(e.title), start: st, end: en, kind: "event" });
  }
  const after = summary.totalMinutes > 0 ? (summary.plannedMinutes + input.minutes) / summary.totalMinutes : null;
  return {
    task: { id: String(t.id), title: String(t.title) },
    date: input.date,
    start: input.start,
    end: toHHMM(endM),
    minutes: input.minutes,
    conflicts,
    capacity: { before: Math.round(summary.occupancyRate * 100), after: after === null ? null : Math.round(after * 100) },
    agenda: blocks.map((b) => ({ title: b.title, start: b.startTime, end: b.endTime })),
  };
}

/** Confirma a sessão: cria UM bloco de trabalho profundo no Capacity Planner (idempotente). */
export async function scheduleFocusSession(db: Client, ownerId: string, input: FocusPreviewInput) {
  const preview = await previewFocusSession(db, ownerId, input);
  const existing = await db.execute({
    sql: "SELECT id FROM planned_time_blocks WHERE owner_id = ? AND date = ? AND start_time = ? AND entity_type = 'task' AND entity_id = ?",
    args: [ownerId, input.date, input.start, input.taskId],
  });
  if (existing.rows[0]) return { id: String(existing.rows[0].id), created: false, ...preview };
  if (preview.conflicts.length) throw new BottleneckError("O horário escolhido conflita com a agenda. Escolha outro horário.", 409);
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO planned_time_blocks (id, owner_id, date, start_time, end_time, entity_type, entity_id, title, block_type) VALUES (?, ?, ?, ?, ?, 'task', ?, ?, 'deep_work')`,
    args: [id, ownerId, input.date, input.start, preview.end, input.taskId, `Focus: ${preview.task.title}`.slice(0, 120)],
  });
  return { id, created: true, ...preview };
}
