/**
 * Capacity Planner — cálculos de capacidade/carga do dia. Regra de
 * negócio fora da UI (nunca em componente React). Nunca usa Gemini
 * para estes números — tudo determinístico e testável.
 */
import type { getDb } from "../db/client.js";
import { getSignalsDashboard } from "./signalsService.js";
import { getContextDashboard } from "./contextService.js";

type Db = ReturnType<typeof getDb>;

export type EffortType = "deep_work" | "normal" | "light";
export type WorkloadLevel = "leve" | "equilibrada" | "alta" | "sobrecarga";

export interface AvailableWindow {
  startMinutes: number;
  endMinutes: number;
}

export interface FreeWindow {
  start: string; // HH:MM
  end: string;
}

export interface PlanningConflict {
  blockId: string | null;
  reason: string;
}

export interface CapacityArea {
  label: string;
  minutes: number;
  pct: number;
}

export interface DayTask {
  id: string;
  title: string;
  priority: "Baixa" | "Média" | "Alta";
  estimateMinutes: number | null;
  projectName: string | null;
  projectColor: string | null;
  dueDate: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  done: boolean;
  effortType: EffortType;
}

export interface PlannedBlock {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  entityType: "task" | "free_block" | "event";
  entityId: string | null;
  title: string;
  blockType: EffortType;
  projectColor: string | null;
}

export interface CapacitySummary {
  date: string;
  windowLabel: string;
  totalMinutes: number;
  busyMinutes: number; // agenda ocupada (eventos fixos)
  freeMinutes: number;
  plannedMinutes: number; // carga planejada
  overloadMinutes: number; // 0 se não houver
  occupancyRate: number; // plannedMinutes / totalMinutes, pode passar de 1
  workloadLevel: WorkloadLevel;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
export function formatDuration(minutes: number): string {
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${sign}${m}min`;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h${String(m).padStart(2, "0")}`;
}

/** Classifica o esforço de uma tarefa a partir de duração/prioridade — mesma regra usada no motor de sugestão. */
export function classifyEffort(estimateMinutes: number | null, priority: "Baixa" | "Média" | "Alta"): EffortType {
  if ((estimateMinutes ?? 0) >= 60 && priority === "Alta") return "deep_work";
  if ((estimateMinutes ?? 0) <= 20) return "light";
  return "normal";
}

export function classifyOccupancy(rate: number): WorkloadLevel {
  if (rate > 1) return "sobrecarga";
  if (rate > 0.9) return "alta";
  if (rate > 0.7) return "equilibrada";
  return "leve";
}

/** Janela útil diária — regra 4 (config futura): usa user_settings.preferred_work_hours ("09:00-12:00,14:00-18:00") pegando início/fim extremos, ou 08:00–22:00 por padrão. */
export async function getWorkWindow(db: Db, ownerId: string): Promise<AvailableWindow> {
  const result = await db.execute({ sql: "SELECT preferred_work_hours FROM user_settings WHERE user_id = ?", args: [ownerId] });
  const raw = (result.rows[0] as unknown as { preferred_work_hours: string | null })?.preferred_work_hours;
  if (!raw) return { startMinutes: toMinutes("08:00"), endMinutes: toMinutes("22:00") };
  const times = raw.split(/[,\-]/).map((s) => s.trim()).filter((s) => /^\d{2}:\d{2}$/.test(s));
  if (times.length === 0) return { startMinutes: toMinutes("08:00"), endMinutes: toMinutes("22:00") };
  const minutesList = times.map(toMinutes);
  return { startMinutes: Math.min(...minutesList), endMinutes: Math.max(...minutesList) };
}

interface Interval {
  start: number;
  end: number;
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const cur of sorted) {
    const last = merged[merged.length - 1];
    if (last && cur.start <= last.end) last.end = Math.max(last.end, cur.end);
    else merged.push({ ...cur });
  }
  return merged;
}

async function getFixedEvents(db: Db, ownerId: string, date: string): Promise<Interval[]> {
  const result = await db.execute({
    sql: `SELECT starts_at, ends_at FROM events WHERE owner_id = ? AND date(starts_at) = date(?) AND all_day = 0`,
    args: [ownerId, date],
  });
  const rows = result.rows as unknown as Array<{ starts_at: string; ends_at: string | null }>;
  return rows
    .map((r) => {
      const start = r.starts_at.slice(11, 16);
      const end = r.ends_at ? r.ends_at.slice(11, 16) : toHHMM(toMinutes(start) + 60);
      return { start: toMinutes(start), end: toMinutes(end) };
    })
    .filter((i) => !Number.isNaN(i.start) && !Number.isNaN(i.end) && i.end > i.start);
}

export async function getPlannedBlocks(db: Db, ownerId: string, date: string): Promise<PlannedBlock[]> {
  const result = await db.execute({
    sql: `SELECT b.id, b.date, b.start_time, b.end_time, b.entity_type, b.entity_id, b.title, b.block_type,
                 t.title AS task_title, p.color AS project_color
          FROM planned_time_blocks b
          LEFT JOIN tasks t ON b.entity_type = 'task' AND t.id = b.entity_id
          LEFT JOIN projects p ON t.project_id = p.id
          WHERE b.owner_id = ? AND b.date = ?
          ORDER BY b.start_time ASC`,
    args: [ownerId, date],
  });
  return (result.rows as unknown as Array<{
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    entity_type: "task" | "free_block";
    entity_id: string | null;
    title: string | null;
    block_type: EffortType;
    task_title: string | null;
    project_color: string | null;
  }>).map((r) => ({
    id: r.id,
    date: r.date,
    startTime: r.start_time,
    endTime: r.end_time,
    entityType: r.entity_type,
    entityId: r.entity_id,
    title: r.entity_type === "task" ? r.task_title ?? "Tarefa" : r.title ?? "Bloco",
    blockType: r.block_type,
    projectColor: r.project_color,
  }));
}

export async function getDayTasks(db: Db, ownerId: string, date: string): Promise<DayTask[]> {
  const result = await db.execute({
    sql: `SELECT t.id, t.title, t.priority, t.estimate_minutes, t.due_date, t.status,
                 p.name AS project_name, p.color AS project_color,
                 b.start_time AS planned_start, b.end_time AS planned_end
          FROM tasks t
          LEFT JOIN projects p ON t.project_id = p.id
          LEFT JOIN planned_time_blocks b ON b.entity_type = 'task' AND b.entity_id = t.id AND b.date = ?
          WHERE t.owner_id = ? AND t.status != 'Concluído'
                AND (date(t.due_date) = date(?) OR b.id IS NOT NULL)
          ORDER BY (b.start_time IS NULL), b.start_time ASC, t.priority DESC`,
    args: [date, ownerId, date],
  });
  return (result.rows as unknown as Array<{
    id: string;
    title: string;
    priority: "Baixa" | "Média" | "Alta";
    estimate_minutes: number | null;
    due_date: string | null;
    status: string;
    project_name: string | null;
    project_color: string | null;
    planned_start: string | null;
    planned_end: string | null;
  }>).map((r) => ({
    id: r.id,
    title: r.title,
    priority: r.priority,
    estimateMinutes: r.estimate_minutes,
    projectName: r.project_name,
    projectColor: r.project_color,
    dueDate: r.due_date,
    plannedStart: r.planned_start,
    plannedEnd: r.planned_end,
    done: false,
    effortType: classifyEffort(r.estimate_minutes, r.priority),
  }));
}

export async function computeCapacitySummary(db: Db, ownerId: string, date: string): Promise<CapacitySummary> {
  const window = await getWorkWindow(db, ownerId);
  const totalMinutes = window.endMinutes - window.startMinutes;
  const fixed = mergeIntervals(await getFixedEvents(db, ownerId, date));
  const busyMinutes = fixed.reduce((sum, i) => sum + (i.end - i.start), 0);
  const freeMinutes = Math.max(0, totalMinutes - busyMinutes);

  const [tasks, blocks] = await Promise.all([getDayTasks(db, ownerId, date), getPlannedBlocks(db, ownerId, date)]);
  const taskLoad = tasks.reduce((sum, t) => sum + (t.estimateMinutes ?? 0), 0);
  const freeBlockLoad = blocks.filter((b) => b.entityType === "free_block").reduce((sum, b) => sum + (toMinutes(b.endTime) - toMinutes(b.startTime)), 0);
  const plannedMinutes = taskLoad + freeBlockLoad;

  const availableCapacity = freeMinutes;
  const overloadMinutes = Math.max(0, plannedMinutes - availableCapacity);
  const occupancyRate = availableCapacity > 0 ? plannedMinutes / availableCapacity : plannedMinutes > 0 ? 2 : 0;

  return {
    date,
    windowLabel: `${toHHMM(window.startMinutes)} – ${toHHMM(window.endMinutes)}`,
    totalMinutes,
    busyMinutes,
    freeMinutes,
    plannedMinutes,
    overloadMinutes,
    occupancyRate,
    workloadLevel: classifyOccupancy(occupancyRate),
  };
}

export async function getFreeWindows(db: Db, ownerId: string, date: string): Promise<FreeWindow[]> {
  const window = await getWorkWindow(db, ownerId);
  const fixed = await getFixedEvents(db, ownerId, date);
  const blocks = (await getPlannedBlocks(db, ownerId, date)).map((b) => ({ start: toMinutes(b.startTime), end: toMinutes(b.endTime) }));
  const occupied = mergeIntervals([...fixed, ...blocks]);
  const free: FreeWindow[] = [];
  let cursor = window.startMinutes;
  for (const busy of occupied) {
    if (busy.start > cursor) free.push({ start: toHHMM(cursor), end: toHHMM(Math.min(busy.start, window.endMinutes)) });
    cursor = Math.max(cursor, busy.end);
  }
  if (cursor < window.endMinutes) free.push({ start: toHHMM(cursor), end: toHHMM(window.endMinutes) });
  return free.filter((f) => toMinutes(f.end) > toMinutes(f.start));
}

export async function getScheduleConflicts(db: Db, ownerId: string, date: string): Promise<PlanningConflict[]> {
  const window = await getWorkWindow(db, ownerId);
  const fixed = await getFixedEvents(db, ownerId, date);
  const blocks = await getPlannedBlocks(db, ownerId, date);
  const conflicts: PlanningConflict[] = [];

  for (const b of blocks) {
    const s = toMinutes(b.startTime);
    const e = toMinutes(b.endTime);
    if (s < window.startMinutes || e > window.endMinutes) {
      conflicts.push({ blockId: b.id, reason: `"${b.title}" está fora da janela disponível (${toHHMM(window.startMinutes)}–${toHHMM(window.endMinutes)}).` });
    }
    for (const ev of fixed) {
      if (s < ev.end && e > ev.start) {
        conflicts.push({ blockId: b.id, reason: `"${b.title}" sobrepõe um evento fixo da agenda (${toHHMM(ev.start)}–${toHHMM(ev.end)}).` });
      }
    }
    for (const other of blocks) {
      if (other.id === b.id) continue;
      const os = toMinutes(other.startTime);
      const oe = toMinutes(other.endTime);
      if (s < oe && e > os) {
        conflicts.push({ blockId: b.id, reason: `"${b.title}" sobrepõe "${other.title}".` });
      }
    }
  }
  return conflicts;
}

export async function getAreaDistribution(db: Db, ownerId: string, date: string): Promise<CapacityArea[]> {
  const [tasks, fixed] = await Promise.all([getDayTasks(db, ownerId, date), getFixedEvents(db, ownerId, date)]);
  const buckets = new Map<string, number>();
  for (const t of tasks) {
    const label = t.projectName ?? "Sem projeto";
    buckets.set(label, (buckets.get(label) ?? 0) + (t.estimateMinutes ?? 0));
  }
  const meetingsMinutes = fixed.reduce((sum, i) => sum + (i.end - i.start), 0);
  if (meetingsMinutes > 0) buckets.set("Reuniões", (buckets.get("Reuniões") ?? 0) + meetingsMinutes);

  const total = [...buckets.values()].reduce((a, b) => a + b, 0);
  return [...buckets.entries()]
    .filter(([, minutes]) => minutes > 0)
    .map(([label, minutes]) => ({ label, minutes, pct: total > 0 ? Math.round((minutes / total) * 100) : 0 }))
    .sort((a, b) => b.minutes - a.minutes);
}

export interface EnergyForecast {
  level: "Baixa" | "Média" | "Alta" | null;
  bestPeriod: string | null;
  changePct: number | null;
}

/** Energia prevista — via Signals (nunca recalcula aqui, só interpreta o radar já pronto). */
export async function getEnergyForecast(db: Db, ownerId: string): Promise<EnergyForecast> {
  const signals = await getSignalsDashboard(db, ownerId, "7d");
  const energyDim = signals.radar.find((r) => r.key === "energy");
  if (!energyDim || energyDim.value == null) return { level: null, bestPeriod: null, changePct: null };

  const hourRows = await db.execute({
    sql: `SELECT CAST(strftime('%H', recorded_at) AS INTEGER) AS h, AVG(energy) AS avg_energy, COUNT(*) AS n
          FROM mood_entries WHERE owner_id = ? AND recorded_at >= datetime('now', '-30 days') GROUP BY h HAVING n >= 2`,
    args: [ownerId],
  });
  const rows = hourRows.rows as unknown as Array<{ h: number; avg_energy: number; n: number }>;
  let bestPeriod: string | null = null;
  if (rows.length > 0) {
    const best = rows.reduce((a, b) => (b.avg_energy > a.avg_energy ? b : a));
    bestPeriod = `${String(best.h).padStart(2, "0")}h–${String((best.h + 2) % 24).padStart(2, "0")}h`;
  }
  const level = energyDim.value >= 70 ? "Alta" : energyDim.value >= 40 ? "Média" : "Baixa";
  return { level, bestPeriod, changePct: null };
}

export interface FocusForecast {
  level: "Fraco" | "Regular" | "Bom" | null;
  bestPeriod: string | null;
}

/** Focus previsto — distribuição real de minutos de Focus por hora (últimos 60 dias). Nunca via Gemini. */
export async function getFocusForecast(db: Db, ownerId: string): Promise<FocusForecast> {
  const result = await db.execute({
    sql: `SELECT CAST(strftime('%H', started_at) AS INTEGER) AS h, SUM(actual_minutes) AS total, COUNT(*) AS n
          FROM focus_sessions WHERE owner_id = ? AND started_at >= datetime('now', '-60 days') AND actual_minutes IS NOT NULL
          GROUP BY h HAVING n >= 2`,
    args: [ownerId],
  });
  const rows = result.rows as unknown as Array<{ h: number; total: number; n: number }>;
  if (rows.length === 0) return { level: null, bestPeriod: null };

  const totalMinutes = rows.reduce((a, b) => a + b.total, 0);
  const totalSessions = rows.reduce((a, b) => a + b.n, 0);
  const avgPerSession = totalMinutes / totalSessions;
  const level = avgPerSession >= 40 ? "Bom" : avgPerSession >= 20 ? "Regular" : "Fraco";

  const best = rows.reduce((a, b) => (b.total > a.total ? b : a));
  const bestPeriod = `${String(best.h).padStart(2, "0")}h–${String((best.h + 3) % 24).padStart(2, "0")}h`;
  return { level, bestPeriod };
}

export interface ContextSummaryForPlanner {
  temperature: number | null;
  condition: string | null;
  rainChance: number | null;
  favorable: boolean | null;
}

/** Contexto do dia — reaproveita contextService (nunca chama Open-Meteo aqui). */
export async function getContextForPlanner(db: Db, ownerId: string): Promise<ContextSummaryForPlanner> {
  const dashboard = await getContextDashboard(db, ownerId, "today");
  if (!dashboard.configured) return { temperature: null, condition: null, rainChance: null, favorable: null };
  return {
    temperature: dashboard.kpis.temperature.value,
    condition: dashboard.resumoAmbiental.condition,
    rainChance: dashboard.kpis.rainChance.value,
    favorable: dashboard.kpis.rainChance.value < 40 && (dashboard.resumoAmbiental.thermalComfort === "Agradável" || dashboard.resumoAmbiental.thermalComfort === "Ameno"),
  };
}
