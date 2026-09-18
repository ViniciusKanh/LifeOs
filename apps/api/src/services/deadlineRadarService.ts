/**
 * Deadline Radar — camada agregadora de prazos. Nunca copia registros:
 * lê de Tasks, Goals, Educação (prazos acadêmicos + TCC/dissertação) e
 * Experimentos Pessoais e normaliza em DeadlineItem. Regra de negócio
 * fora da UI, tudo determinístico (sem Gemini).
 */
import type { getDb } from "../db/client.js";
import { computeRiskScore, classifyRisk, type DeadlineRisk } from "./deadlineRiskService.js";

type Db = ReturnType<typeof getDb>;

export type DeadlineStatus = "atrasado" | "vence_hoje" | "vence_7d" | "vence_30d" | "no_prazo" | "concluido";
export type DeadlineArea = "Educação" | "Projetos" | "Profissional" | "Pessoal" | "Outros";
export type DeadlineEntityType = "task" | "goal" | "academic_deadline" | "academic_project" | "experiment";

export interface DeadlineItem {
  id: string;
  entityType: DeadlineEntityType;
  entityId: string;
  title: string;
  dueDate: string; // YYYY-MM-DD
  status: DeadlineStatus;
  priority: "Baixa" | "Média" | "Alta" | null;
  progress: number | null; // 0-100, null quando não há progresso mensurável
  area: DeadlineArea;
  projectId: string | null;
  projectName: string | null;
  sourceModule: string; // rota do módulo de origem, para "Abrir"
  daysRemaining: number;
  done: boolean;
}

/** "Hoje" — usa a data local enviada pelo frontend (evita erro de UTC virar "amanhã"); cai para UTC se ausente. */
function resolveToday(todayParam?: string): string {
  if (todayParam && /^\d{4}-\d{2}-\d{2}$/.test(todayParam)) return todayParam;
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

export function classifyStatus(dueDate: string, today: string, done: boolean): DeadlineStatus {
  if (done) return "concluido";
  const days = daysBetween(today, dueDate);
  if (days < 0) return "atrasado";
  if (days === 0) return "vence_hoje";
  if (days <= 7) return "vence_7d";
  if (days <= 30) return "vence_30d";
  return "no_prazo";
}

function areaFromProjectKind(kind: string | null): DeadlineArea {
  if (kind === "professional") return "Profissional";
  if (kind === "academic") return "Educação";
  if (kind === "workspace") return "Projetos";
  return "Pessoal";
}

async function getTaskDeadlines(db: Db, ownerId: string, today: string): Promise<DeadlineItem[]> {
  const result = await db.execute({
    sql: `SELECT t.id, t.title, t.due_date, t.status, t.priority, t.completed_at, t.project_id,
                 p.name AS project_name, p.kind AS project_kind
          FROM tasks t
          LEFT JOIN projects p ON t.project_id = p.id
          WHERE t.owner_id = ? AND t.due_date IS NOT NULL`,
    args: [ownerId],
  });
  const rows = result.rows as unknown as Array<{
    id: string;
    title: string;
    due_date: string;
    status: string;
    priority: "Baixa" | "Média" | "Alta";
    completed_at: string | null;
    project_id: string | null;
    project_name: string | null;
    project_kind: string | null;
  }>;
  return rows.map((r) => {
    const dueDate = r.due_date.slice(0, 10);
    const done = r.status === "Concluído";
    return {
      id: `task:${r.id}`,
      entityType: "task",
      entityId: r.id,
      title: r.title,
      dueDate,
      status: classifyStatus(dueDate, today, done),
      priority: r.priority,
      progress: done ? 100 : null,
      area: areaFromProjectKind(r.project_kind),
      projectId: r.project_id,
      projectName: r.project_name,
      sourceModule: "/tarefas",
      daysRemaining: daysBetween(today, dueDate),
      done,
    };
  });
}

async function getGoalDeadlines(db: Db, ownerId: string, today: string): Promise<DeadlineItem[]> {
  const result = await db.execute({
    sql: `SELECT id, title, due_date, status, target_value, current_value, kind
          FROM goals WHERE owner_id = ? AND due_date IS NOT NULL`,
    args: [ownerId],
  });
  const rows = result.rows as unknown as Array<{
    id: string;
    title: string;
    due_date: string;
    status: string;
    target_value: number | null;
    current_value: number;
    kind: string;
  }>;
  return rows.map((r) => {
    const dueDate = r.due_date.slice(0, 10);
    const done = r.status === "done";
    const progress = r.target_value && r.target_value > 0 ? Math.min(100, Math.round((r.current_value / r.target_value) * 100)) : null;
    return {
      id: `goal:${r.id}`,
      entityType: "goal",
      entityId: r.id,
      title: r.title,
      dueDate,
      status: classifyStatus(dueDate, today, done),
      priority: null,
      progress: done ? 100 : progress,
      area: "Pessoal",
      projectId: null,
      projectName: null,
      sourceModule: "/metas",
      daysRemaining: daysBetween(today, dueDate),
      done,
    };
  });
}

async function getAcademicDeadlines(db: Db, ownerId: string, today: string): Promise<DeadlineItem[]> {
  const result = await db.execute({
    sql: `SELECT ad.id, ad.title, ad.due_date, ad.done, e.course_name
          FROM academic_deadlines ad
          JOIN educations e ON ad.education_id = e.id
          WHERE ad.owner_id = ?`,
    args: [ownerId],
  });
  const rows = result.rows as unknown as Array<{ id: string; title: string; due_date: string; done: number; course_name: string }>;
  return rows.map((r) => {
    const dueDate = r.due_date.slice(0, 10);
    const done = r.done === 1;
    return {
      id: `academic_deadline:${r.id}`,
      entityType: "academic_deadline",
      entityId: r.id,
      title: r.title,
      dueDate,
      status: classifyStatus(dueDate, today, done),
      priority: null,
      progress: done ? 100 : null,
      area: "Educação",
      projectId: null,
      projectName: r.course_name,
      sourceModule: "/educacao",
      daysRemaining: daysBetween(today, dueDate),
      done,
    };
  });
}

async function getAcademicProjectDeadlines(db: Db, ownerId: string, today: string): Promise<DeadlineItem[]> {
  const result = await db.execute({
    sql: `SELECT id, title, defense_date, progress_pct FROM academic_projects WHERE owner_id = ? AND defense_date IS NOT NULL`,
    args: [ownerId],
  });
  const rows = result.rows as unknown as Array<{ id: string; title: string; defense_date: string; progress_pct: number }>;
  return rows.map((r) => {
    const dueDate = r.defense_date.slice(0, 10);
    const done = r.progress_pct >= 100;
    return {
      id: `academic_project:${r.id}`,
      entityType: "academic_project",
      entityId: r.id,
      title: r.title,
      dueDate,
      status: classifyStatus(dueDate, today, done),
      priority: "Alta",
      progress: r.progress_pct,
      area: "Educação",
      projectId: null,
      projectName: null,
      sourceModule: "/educacao",
      daysRemaining: daysBetween(today, dueDate),
      done,
    };
  });
}

/** Experimentos aparecem como marco (fim do experimento), nunca como entrega crítica atrasada. */
async function getExperimentMilestones(db: Db, ownerId: string, today: string): Promise<DeadlineItem[]> {
  const result = await db.execute({
    sql: `SELECT id, title, end_date, status FROM personal_experiments WHERE owner_id = ? AND status IN ('active', 'paused')`,
    args: [ownerId],
  });
  const rows = result.rows as unknown as Array<{ id: string; title: string; end_date: string; status: string }>;
  return rows.map((r) => {
    const dueDate = r.end_date.slice(0, 10);
    return {
      id: `experiment:${r.id}`,
      entityType: "experiment",
      entityId: r.id,
      title: r.title,
      dueDate,
      status: classifyStatus(dueDate, today, false),
      priority: null,
      progress: null,
      area: "Outros",
      projectId: null,
      projectName: null,
      sourceModule: "/experimentos",
      daysRemaining: daysBetween(today, dueDate),
      done: false,
    };
  });
}

export async function getAllDeadlineItems(db: Db, ownerId: string, todayParam?: string): Promise<DeadlineItem[]> {
  const today = resolveToday(todayParam);
  const [tasks, goals, academicDeadlines, academicProjects, experiments] = await Promise.all([
    getTaskDeadlines(db, ownerId, today),
    getGoalDeadlines(db, ownerId, today),
    getAcademicDeadlines(db, ownerId, today),
    getAcademicProjectDeadlines(db, ownerId, today),
    getExperimentMilestones(db, ownerId, today),
  ]);
  return [...tasks, ...goals, ...academicDeadlines, ...academicProjects, ...experiments];
}

export type DeadlinePeriodFilter = "today" | "7d" | "30d" | "all";

export function filterByPeriod(items: DeadlineItem[], period: DeadlinePeriodFilter): DeadlineItem[] {
  if (period === "all") return items;
  return items.filter((i) => {
    if (i.done) return false;
    if (period === "today") return i.status === "atrasado" || i.status === "vence_hoje";
    if (period === "7d") return i.status === "atrasado" || i.status === "vence_hoje" || i.status === "vence_7d";
    return i.status !== "no_prazo" && i.status !== "concluido";
  });
}

export interface DeadlineSummary {
  overdue: number;
  dueToday: number;
  due7d: number;
  due8to30: number;
  onTrack: number;
  onTimeRate: { pct: number; completedOnTime: number; completedWithDeadline: number } | null;
}

/** completed_at vs due_date — nunca usa status atual isolado (regra explícita do briefing). */
export async function computeOnTimeRate(db: Db, ownerId: string): Promise<DeadlineSummary["onTimeRate"]> {
  const result = await db.execute({
    sql: `SELECT due_date, completed_at FROM tasks WHERE owner_id = ? AND due_date IS NOT NULL AND status = 'Concluído' AND completed_at IS NOT NULL`,
    args: [ownerId],
  });
  const rows = result.rows as unknown as Array<{ due_date: string; completed_at: string }>;
  if (rows.length === 0) return null;
  const onTime = rows.filter((r) => r.completed_at.slice(0, 10) <= r.due_date.slice(0, 10)).length;
  return { pct: Math.round((onTime / rows.length) * 100), completedOnTime: onTime, completedWithDeadline: rows.length };
}

export function computeSummary(items: DeadlineItem[], onTimeRate: DeadlineSummary["onTimeRate"]): DeadlineSummary {
  const active = items.filter((i) => !i.done);
  return {
    overdue: active.filter((i) => i.status === "atrasado").length,
    dueToday: active.filter((i) => i.status === "vence_hoje").length,
    due7d: active.filter((i) => i.status === "vence_7d").length,
    due8to30: active.filter((i) => i.status === "vence_30d").length,
    onTrack: active.filter((i) => i.status === "no_prazo").length,
    onTimeRate,
  };
}

export interface DeadlineAreaBucket {
  area: DeadlineArea;
  count: number;
  pct: number;
}

export function computeAreaDistribution(items: DeadlineItem[]): DeadlineAreaBucket[] {
  const active = items.filter((i) => !i.done);
  const buckets = new Map<DeadlineArea, number>();
  for (const i of active) buckets.set(i.area, (buckets.get(i.area) ?? 0) + 1);
  const total = active.length;
  return [...buckets.entries()]
    .map(([area, count]) => ({ area, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 }))
    .sort((a, b) => b.count - a.count);
}

export interface DeadlineTrendPoint {
  month: string; // "2026-09"
  label: string; // "Set"
  count: number;
}

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function computeTrend(items: DeadlineItem[], todayParam?: string): DeadlineTrendPoint[] {
  const today = resolveToday(todayParam);
  const start = new Date(`${today}T00:00:00Z`);
  const points: DeadlineTrendPoint[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(start);
    d.setUTCMonth(d.getUTCMonth() + i);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    points.push({ month: key, label: MONTH_LABELS[d.getUTCMonth()], count: 0 });
  }
  const byMonth = new Map(points.map((p) => [p.month, p]));
  for (const item of items) {
    if (item.done) continue;
    const key = item.dueDate.slice(0, 7);
    const bucket = byMonth.get(key);
    if (bucket) bucket.count += 1;
  }
  return points;
}

export interface ProjectRiskItem {
  projectId: string;
  projectName: string;
  progressPct: number;
  daysRemaining: number | null;
  dueDate: string | null;
  riskScore: number;
  risk: DeadlineRisk;
  kind: "project" | "academic";
  sourceModule: string;
}

/** Risco de não concluir — projetos com tarefas datadas, progresso = tarefas concluídas / total. */
export async function getProjectRisks(db: Db, ownerId: string, todayParam?: string): Promise<ProjectRiskItem[]> {
  const today = resolveToday(todayParam);
  const result = await db.execute({
    sql: `SELECT p.id, p.name, p.created_at,
                 COUNT(t.id) AS total_tasks,
                 SUM(CASE WHEN t.status = 'Concluído' THEN 1 ELSE 0 END) AS done_tasks,
                 MIN(CASE WHEN t.status != 'Concluído' THEN t.due_date END) AS next_due
          FROM projects p
          JOIN tasks t ON t.project_id = p.id
          WHERE p.owner_id = ? AND p.archived_at IS NULL AND t.due_date IS NOT NULL
          GROUP BY p.id
          HAVING total_tasks > 0 AND next_due IS NOT NULL`,
    args: [ownerId],
  });
  const rows = result.rows as unknown as Array<{
    id: string;
    name: string;
    created_at: string;
    total_tasks: number;
    done_tasks: number;
    next_due: string | null;
  }>;
  return rows
    .map((r) => {
      const progressPct = r.total_tasks > 0 ? Math.round((r.done_tasks / r.total_tasks) * 100) : 0;
      const dueDate = r.next_due ? r.next_due.slice(0, 10) : null;
      const daysRemaining = dueDate ? daysBetween(today, dueDate) : null;
      const totalSpanDays = dueDate ? daysBetween(r.created_at.slice(0, 10), dueDate) : null;
      const openItemsRatio = r.total_tasks > 0 ? (r.total_tasks - r.done_tasks) / r.total_tasks : null;
      const riskScore = computeRiskScore({
        daysRemaining: daysRemaining ?? 999,
        totalSpanDays,
        progressPct,
        openItemsRatio,
        priority: null,
      });
      return {
        projectId: r.id,
        projectName: r.name,
        progressPct,
        daysRemaining,
        dueDate,
        riskScore,
        risk: classifyRisk(riskScore),
        kind: "project" as const,
        sourceModule: "/projetos",
      };
    })
    .sort((a, b) => b.riskScore - a.riskScore);
}

/**
 * Risco de TCC/dissertação/tese — mesma fórmula de risco dos projetos
 * (regra de negócio compartilhada, nunca duplicada), aplicada aos
 * projetos acadêmicos que já têm progresso e data de defesa reais.
 * Antes ficavam de fora da análise de risco (ilha de informação).
 */
export async function getAcademicProjectRisks(db: Db, ownerId: string, todayParam?: string): Promise<ProjectRiskItem[]> {
  const today = resolveToday(todayParam);
  const result = await db.execute({
    sql: `SELECT id, title, created_at, progress_pct, defense_date
          FROM academic_projects WHERE owner_id = ? AND defense_date IS NOT NULL AND progress_pct < 100`,
    args: [ownerId],
  });
  const rows = result.rows as unknown as Array<{ id: string; title: string; created_at: string; progress_pct: number; defense_date: string }>;
  return rows.map((r) => {
    const dueDate = r.defense_date.slice(0, 10);
    const daysRemaining = daysBetween(today, dueDate);
    const totalSpanDays = daysBetween(r.created_at.slice(0, 10), dueDate);
    const riskScore = computeRiskScore({
      daysRemaining,
      totalSpanDays: totalSpanDays > 0 ? totalSpanDays : null,
      progressPct: r.progress_pct,
      openItemsRatio: null,
      priority: "Alta",
    });
    return {
      projectId: r.id,
      projectName: r.title,
      progressPct: r.progress_pct,
      daysRemaining,
      dueDate,
      riskScore,
      risk: classifyRisk(riskScore),
      kind: "academic" as const,
      sourceModule: "/educacao",
    };
  });
}

/** Une risco de projetos e de projetos acadêmicos (TCC/dissertação) em uma única lista ordenada por risco. */
export async function getAllRisks(db: Db, ownerId: string, todayParam?: string): Promise<ProjectRiskItem[]> {
  const [projects, academic] = await Promise.all([getProjectRisks(db, ownerId, todayParam), getAcademicProjectRisks(db, ownerId, todayParam)]);
  return [...projects, ...academic].sort((a, b) => b.riskScore - a.riskScore);
}
