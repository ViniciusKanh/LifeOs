import { bottleneckConfig as C, classifyScore, depthWeight, type BottleneckLevel } from "../config/bottlenecks.js";

/**
 * Motor determinístico do Detector de Gargalos (sem I/O, testável).
 * Recebe um retrato já carregado dos dados reais do usuário e devolve
 * candidatos com scores 0–100, ranking estável, causas com evidência,
 * grafo de dependências reais, ação recomendada e simulação read-only.
 * Nada aqui é aleatório e nada altera dados.
 */

/* --------------------------------- Entrada --------------------------------- */

export interface EngineTask {
  id: string;
  title: string;
  status: string;
  done: boolean;
  priority: string;
  dueDate: string | null;
  estimateMinutes: number | null;
  timeSpentMinutes: number;
  projectId: string | null;
  goalId: string | null;
  /** Data (YYYY-MM-DD) da última atividade real: edição, foco ou apontamento. */
  lastActivity: string | null;
  dependsOn: string[];
}
export interface EngineProject { id: string; name: string; status: string; dueDate: string | null; priority: string | null }
export interface EngineCampaign {
  id: string;
  title: string;
  status: string;
  priority: string;
  goalId: string | null;
  startDate: string | null;
  endDate: string | null;
  progressPct: number;
  missionsTotal: number;
  milestonesTotal: number;
  /** Pesos efetivos do progresso (mesma regra da Forja de Campanhas). */
  weights: { missions: number; milestones: number; contracts: number };
  taskIds: string[];
  projectIds: string[];
}
export interface EngineMilestone { id: string; campaignId: string; title: string; dueDate: string | null; done: boolean; dependencyId: string | null }
export interface EngineGoal { id: string; title: string; dueDate: string | null; active: boolean }
export interface EngineHabit { id: string; name: string; expected: number; met: number; lastEntry: string | null; campaignIds: string[] }
export interface CapacityDay { date: string; totalMinutes: number; freeMinutes: number; plannedMinutes: number; occupancy: number }
export interface FreeSlot { date: string; start: string; end: string }

export interface EngineInput {
  today: string;
  /** Hora local atual (HH:MM) — janelas de hoje anteriores a ela são descartadas. */
  nowTime: string;
  tasks: EngineTask[];
  projects: EngineProject[];
  campaigns: EngineCampaign[];
  milestones: EngineMilestone[];
  goals: EngineGoal[];
  habits: EngineHabit[];
  capacity: CapacityDay[];
  freeSlots: FreeSlot[];
  signals: { sleep: number | null; energy: number | null };
  /** Horário com mais foco concluído (histórico do próprio usuário). */
  focusPattern: { hour: number; sessions: number } | null;
  energyBestPeriod: string | null;
}

/* ---------------------------------- Saída ---------------------------------- */

export type CandidateType = "TASK" | "PROJECT" | "CAMPAIGN" | "MILESTONE" | "HABIT" | "CAPACITY" | "HEALTH_SIGNAL";
export type ScoreDim = "dependency" | "urgency" | "inactivity" | "strategic" | "capacity" | "downstream";
export type Scores = Record<ScoreDim, number>;

export interface Candidate {
  key: string;
  type: CandidateType;
  entityId: string | null;
  title: string;
  context: string | null;
  link: string;
  score: number;
  level: BottleneckLevel;
  /** Breakdown do score; null para sinais de saúde (não usam a fórmula operacional). */
  scores: Scores | null;
  urgency: number;
  description: string;
  kpis: { dependentTasks: number; affectedCampaigns: number; inactiveDays: number | null; deadlinesAtRisk: number };
  flags: { noEstimate: boolean; noDueDate: boolean; circular: boolean };
  dueDate: string | null;
  priority: string | null;
}

export interface Cause {
  type: "COMPLEXITY" | "NO_CONTINUOUS_TIME" | "COMPETING_PRIORITIES" | "OVERLOAD" | "INACTIVITY" | "BLOCKED_BY_DEPENDENCY" | "CIRCULAR_DEPENDENCY" | "LOW_ENERGY_PATTERN" | "NO_ESTIMATE" | "LOW_ADHERENCE";
  label: string;
  description: string;
  evidence: string;
  confidence: "low" | "medium" | "high";
}

export interface GraphNode {
  key: string;
  type: "TASK" | "PROJECT" | "CAMPAIGN" | "GOAL" | "MILESTONE" | "HABIT";
  label: string;
  status: string;
  depth: number;
  relation: "center" | "blocked" | "blocker" | "belongs" | "affected";
  impact: number | null;
  link: string;
}
export interface GraphEdge { from: string; to: string; kind: "depends" | "member" }
export interface DependencyGraph { nodes: GraphNode[]; edges: GraphEdge[]; cycles: string[][]; truncated: boolean }

export type ActionType =
  | "OPEN_TASK"
  | "SCHEDULE_FOCUS"
  | "RESCHEDULE_TASKS"
  | "OPEN_PROJECT"
  | "OPEN_CAMPAIGN"
  | "RUN_PROTOCOL"
  | "OPEN_CAPACITY_PLANNER"
  | "OPEN_DEADLINE_RADAR"
  | "OPEN_HABITS"
  | "OPEN_HEALTH";
export interface RecommendedAction {
  type: ActionType;
  label: string;
  reason: string;
  estimatedMinutes: number | null;
  targetId: string | null;
  link: string | null;
  confidence: "low" | "medium" | "high";
  preview: { date: string; start: string; end: string; durationSource: "estimate" | "default"; timeSource: "focus_history" | "energy" | "free_window" } | null;
  expected: string | null;
}

export interface ImpactItem { key: "campaigns" | "load" | "deadlines" | "missions" | "projects"; value: number | null; unit: "pp" | "%" | "count"; label: string; note: string }
export interface ImpactProjection { targetTitle: string | null; items: ImpactItem[]; basis: string }

/* --------------------------------- Helpers --------------------------------- */

const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));
const round = (v: number) => Math.round(v);
const TYPE_ORDER: Record<CandidateType, number> = { TASK: 0, MILESTONE: 1, PROJECT: 2, CAMPAIGN: 3, CAPACITY: 4, HABIT: 5, HEALTH_SIGNAL: 6 };
const ACTIVE_CAMPAIGN = (s: string) => s === "active" || s === "planned" || s === "paused";
const ACTIVE_PROJECT = (s: string) => s !== "completed" && s !== "archived" && s !== "cancelled";

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
}
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const toHHMM = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

/* ------------------------------ Grafo de tarefas ------------------------------ */

export interface TaskGraph {
  byId: Map<string, EngineTask>;
  /** blocker → tarefas que dependem dele (apenas tarefas do próprio usuário). */
  dependents: Map<string, string[]>;
  cycles: string[][];
  inCycle: Set<string>;
}

export function buildTaskGraph(tasks: EngineTask[]): TaskGraph {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const dependents = new Map<string, string[]>();
  for (const t of tasks)
    for (const d of t.dependsOn) {
      // Aresta só existe se as duas pontas são tarefas conhecidas (do mesmo usuário).
      if (!byId.has(d) || d === t.id) continue;
      dependents.set(d, [...(dependents.get(d) ?? []), t.id]);
    }
  for (const list of dependents.values()) list.sort();
  const cycles = detectCycles(tasks, byId);
  return { byId, dependents, cycles, inCycle: new Set(cycles.flat()) };
}

/** Ciclos de dependência (SCC de Tarjan com mais de um nó). Ordem estável. */
export function detectCycles(tasks: EngineTask[], byId = new Map(tasks.map((t) => [t.id, t]))): string[][] {
  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const on = new Set<string>();
  const out: string[][] = [];
  const ids = [...byId.keys()].sort();
  const visit = (v: string) => {
    idx.set(v, index);
    low.set(v, index++);
    stack.push(v);
    on.add(v);
    for (const w of [...(byId.get(v)?.dependsOn ?? [])].sort()) {
      if (!byId.has(w)) continue;
      if (!idx.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (on.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!));
    }
    if (low.get(v) === idx.get(v)) {
      const comp: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        on.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length > 1) out.push(comp.sort());
    }
  };
  for (const id of ids) if (!idx.has(id)) visit(id);
  return out.sort((a, b) => a[0].localeCompare(b[0]));
}

/** Tarefas abertas que dependem (direta ou indiretamente) de `id`, com a menor profundidade. */
export function downstreamTasks(id: string, g: TaskGraph, maxDepth: number = C.maxDepth): Map<string, number> {
  const seen = new Map<string, number>();
  let frontier = [id];
  for (let depth = 1; depth <= maxDepth && frontier.length; depth++) {
    const next: string[] = [];
    for (const f of frontier)
      for (const d of g.dependents.get(f) ?? []) {
        if (d === id || seen.has(d)) continue;
        const t = g.byId.get(d);
        if (!t || t.done) continue;
        seen.set(d, depth);
        next.push(d);
      }
    frontier = next;
  }
  return seen;
}

/** Bloqueadores abertos de uma tarefa (o que ela espera). */
export const openBlockers = (t: EngineTask, g: TaskGraph) => t.dependsOn.filter((d) => g.byId.has(d) && !g.byId.get(d)!.done);

/* --------------------------------- Scores --------------------------------- */

export function urgencyFromDays(days: number | null): number {
  if (days === null) return 0;
  const U = C.urgency;
  if (days < 0) return clamp(U.overdueBase + -days * U.overduePerDay);
  return clamp(100 - days * U.perDay);
}

export function calculateUrgencyScore(input: { today: string; dueDate: string | null; priority: string | null; dependentDueDates: string[] }): number {
  const U = C.urgency;
  const own = input.dueDate ? urgencyFromDays(daysBetween(input.today, input.dueDate)) : 0;
  const nearestDependent = input.dependentDueDates.length ? input.dependentDueDates.slice().sort()[0] : null;
  const dep = nearestDependent ? urgencyFromDays(daysBetween(input.today, nearestDependent)) * U.dependentFactor : 0;
  return round(clamp(Math.max(own, dep) + (U.priorityBonus[input.priority ?? ""] ?? 0)));
}

export function calculateDependencyScore(counts: { tasksByDepth: number[]; projects: number; campaigns: number; goals: number; milestonesByDepth?: number[] }): number {
  const U = C.dependencyUnit;
  const weighted = (list: number[] | undefined, unit: number) => (list ?? []).reduce((s, d) => s + depthWeight(d) * unit, 0);
  const raw = weighted(counts.tasksByDepth, U.task) + weighted(counts.milestonesByDepth, U.milestone) + counts.projects * U.project + counts.campaigns * U.campaign + counts.goals * U.goal;
  return round(clamp((raw / C.dependencyFullAt) * 100));
}

export function calculateInactivityScore(inactiveDays: number | null): number {
  if (inactiveDays === null || inactiveDays < C.inactivity.minDays) return 0;
  return round(clamp((inactiveDays / C.inactivity.fullAtDays) * 100));
}

export function calculateStrategicScore(input: { priority: string | null; hasGoal: boolean; campaigns: Array<{ priority: string }>; hasProject: boolean }): number {
  const S = C.strategic;
  let v = S.priority[input.priority ?? ""] ?? S.priority["Média"];
  if (input.hasGoal) v += S.goal;
  if (input.campaigns.length) v += S.campaign + (input.campaigns.some((c) => c.priority === "Alta") ? S.campaignHighPriority : 0);
  if (input.hasProject) v += S.project;
  return round(clamp(v));
}

/**
 * Pressão de capacidade: trabalho restante (o item + o que ele bloqueia)
 * contra o tempo livre real do Capacity Planner até o prazo efetivo.
 * Sem estimativa não há pressão calculável (nunca inventamos duração).
 */
export function calculateCapacityPressure(input: { needMinutes: number | null; deadline: string | null; today: string; capacity: CapacityDay[] }): number {
  if (!input.needMinutes || input.needMinutes <= 0) return 0;
  const horizon = input.deadline ? Math.max(0, daysBetween(input.today, input.deadline)) : C.capacity.horizonDays - 1;
  const days = input.capacity.filter((d) => daysBetween(input.today, d.date) <= horizon);
  const available = days.reduce((s, d) => s + Math.max(0, d.freeMinutes - d.plannedMinutes), 0);
  if (available <= 0) return 100;
  return round(clamp((input.needMinutes / available) * 100));
}

export function calculateDownstreamRisk(atRisk: number): number {
  return round(clamp(atRisk * C.downstream.perItem));
}

export function combineScore(s: Scores): number {
  const W = C.weights;
  return round(clamp(s.dependency * W.dependency + s.urgency * W.urgency + s.inactivity * W.inactivity + s.strategic * W.strategic + s.capacity * W.capacity + s.downstream * W.downstream));
}

const isAtRisk = (today: string, due: string | null) => !!due && daysBetween(today, due) <= C.downstream.riskSlackDays;

/* --------------------------------- Contexto --------------------------------- */

export interface Ctx {
  input: EngineInput;
  g: TaskGraph;
  campaignsOfTask: (t: EngineTask) => EngineCampaign[];
}

export function makeCtx(input: EngineInput): Ctx {
  const g = buildTaskGraph(input.tasks);
  const active = input.campaigns.filter((c) => ACTIVE_CAMPAIGN(c.status));
  return {
    input,
    g,
    campaignsOfTask: (t) => active.filter((c) => c.taskIds.includes(t.id) || (!!t.projectId && c.projectIds.includes(t.projectId))),
  };
}

/** Projetos, campanhas e metas afetados por um conjunto de tarefas. */
function affectedBy(ctx: Ctx, tasks: EngineTask[]) {
  const projects = new Set<string>();
  const campaigns = new Map<string, EngineCampaign>();
  const goals = new Set<string>();
  const goalActive = new Set(ctx.input.goals.filter((g) => g.active).map((g) => g.id));
  for (const t of tasks) {
    if (t.projectId) projects.add(t.projectId);
    if (t.goalId && goalActive.has(t.goalId)) goals.add(t.goalId);
    for (const c of ctx.campaignsOfTask(t)) {
      campaigns.set(c.id, c);
      if (c.goalId && goalActive.has(c.goalId)) goals.add(c.goalId);
    }
  }
  return { projects, campaigns: [...campaigns.values()], goals };
}

const inactiveDaysOf = (today: string, last: string | null) => (last ? Math.max(0, daysBetween(last, today)) : null);
const remainingMinutes = (t: EngineTask) => (t.estimateMinutes ? Math.max(0, t.estimateMinutes - t.timeSpentMinutes) : null);

/* -------------------------------- Candidatos -------------------------------- */

export function taskCandidate(ctx: Ctx, t: EngineTask): Candidate {
  const { today } = ctx.input;
  const down = downstreamTasks(t.id, ctx.g);
  const downTasks = [...down.keys()].map((id) => ctx.g.byId.get(id)!);
  const self = affectedBy(ctx, [t]);
  const all = affectedBy(ctx, [t, ...downTasks]);
  const atRisk = downTasks.filter((d) => isAtRisk(today, d.dueDate)).length + (isAtRisk(today, t.dueDate) ? 1 : 0);
  const need = remainingMinutes(t);
  const needAll = need === null ? null : need + downTasks.reduce((s, d) => s + (remainingMinutes(d) ?? 0), 0);
  const deadlines = [t.dueDate, ...downTasks.map((d) => d.dueDate)].filter((d): d is string => !!d).sort();
  const inactive = inactiveDaysOf(today, t.lastActivity);
  // Projeto/campanha/meta da própria tarefa não contam como "dependência" (são pertencimento);
  // só os que entram por meio das tarefas bloqueadas.
  const scores: Scores = {
    dependency: calculateDependencyScore({
      tasksByDepth: [...down.values()],
      projects: [...all.projects].filter((p) => p !== t.projectId).length,
      campaigns: all.campaigns.filter((c) => !self.campaigns.includes(c)).length + (down.size ? self.campaigns.length : 0),
      goals: [...all.goals].filter((g) => !self.goals.has(g)).length + (down.size ? self.goals.size : 0),
    }),
    urgency: calculateUrgencyScore({ today, dueDate: t.dueDate, priority: t.priority, dependentDueDates: downTasks.map((d) => d.dueDate).filter((d): d is string => !!d) }),
    inactivity: calculateInactivityScore(inactive),
    strategic: calculateStrategicScore({ priority: t.priority, hasGoal: self.goals.size > 0, campaigns: self.campaigns, hasProject: !!t.projectId }),
    capacity: calculateCapacityPressure({ needMinutes: needAll, deadline: deadlines[0] ?? null, today, capacity: ctx.input.capacity }),
    downstream: calculateDownstreamRisk(downTasks.filter((d) => isAtRisk(today, d.dueDate)).length),
  };
  if (ctx.g.inCycle.has(t.id)) scores.dependency = Math.max(scores.dependency, 50);
  const score = combineScore(scores);
  const project = ctx.input.projects.find((p) => p.id === t.projectId);
  const overdue = t.dueDate ? -daysBetween(today, t.dueDate) : null;
  const parts: string[] = [];
  if (down.size) parts.push(`Esta entrega está bloqueando ${plural(down.size, "tarefa", "tarefas")}`);
  if (all.campaigns.length) parts.push(`${down.size ? "e" : "Faz parte de"} ${plural(all.campaigns.length, "campanha", "campanhas")}${all.goals.size ? ` e ${plural(all.goals.size, "meta", "metas")}` : ""}`);
  let description = parts.length ? `${parts.join(" ")}.` : "";
  if (overdue !== null && overdue > 0) description += ` Atrasada há ${plural(overdue, "dia", "dias")}.`;
  else if (overdue !== null && overdue > -8) description += ` Vence ${overdue === 0 ? "hoje" : `em ${plural(-overdue, "dia", "dias")}`}.`;
  if (!description.trim()) description = inactive !== null && inactive >= 7 ? `Sem atividade registrada há ${inactive} dias.` : "Missão aberta com sinais de atenção.";
  return {
    key: `task:${t.id}`,
    type: "TASK",
    entityId: t.id,
    title: t.title,
    context: project ? project.name : null,
    link: `/tarefas?task=${encodeURIComponent(t.id)}`,
    score,
    level: classifyScore(score),
    scores,
    urgency: scores.urgency,
    description: description.trim(),
    kpis: { dependentTasks: down.size, affectedCampaigns: all.campaigns.length, inactiveDays: inactive, deadlinesAtRisk: atRisk },
    flags: { noEstimate: t.estimateMinutes === null, noDueDate: !t.dueDate, circular: ctx.g.inCycle.has(t.id) },
    dueDate: t.dueDate,
    priority: t.priority,
  };
}

function projectCandidate(ctx: Ctx, p: EngineProject): Candidate | null {
  const { today } = ctx.input;
  const open = ctx.input.tasks.filter((t) => t.projectId === p.id && !t.done);
  if (open.length === 0) return null;
  const tasksByDepth: number[] = [];
  const external: EngineTask[] = [];
  for (const t of open)
    for (const [id, depth] of downstreamTasks(t.id, ctx.g)) {
      const d = ctx.g.byId.get(id)!;
      if (d.projectId !== p.id && !external.includes(d)) {
        external.push(d);
        tasksByDepth.push(depth);
      }
    }
  const self = affectedBy(ctx, open);
  const lastAct = open.map((t) => t.lastActivity).filter((d): d is string => !!d).sort().pop() ?? null;
  const inactive = inactiveDaysOf(today, lastAct);
  const due = p.dueDate ?? open.map((t) => t.dueDate).filter((d): d is string => !!d).sort()[0] ?? null;
  const atRisk = open.filter((t) => isAtRisk(today, t.dueDate)).length;
  const need = open.filter((t) => isAtRisk(today, t.dueDate)).reduce((s, t) => s + (remainingMinutes(t) ?? 0), 0);
  const scores: Scores = {
    dependency: calculateDependencyScore({ tasksByDepth, projects: new Set(external.map((e) => e.projectId).filter(Boolean)).size, campaigns: self.campaigns.length, goals: self.goals.size }),
    urgency: calculateUrgencyScore({ today, dueDate: due, priority: p.priority, dependentDueDates: [] }),
    inactivity: calculateInactivityScore(inactive),
    strategic: calculateStrategicScore({ priority: p.priority, hasGoal: self.goals.size > 0, campaigns: self.campaigns, hasProject: false }),
    capacity: calculateCapacityPressure({ needMinutes: need || null, deadline: null, today, capacity: ctx.input.capacity }),
    downstream: calculateDownstreamRisk(atRisk),
  };
  const score = combineScore(scores);
  return {
    key: `project:${p.id}`,
    type: "PROJECT",
    entityId: p.id,
    title: p.name,
    context: plural(open.length, "tarefa aberta", "tarefas abertas"),
    link: `/projetos/${encodeURIComponent(p.id)}`,
    score,
    level: classifyScore(score),
    scores,
    urgency: scores.urgency,
    description: `${plural(open.length, "tarefa aberta", "tarefas abertas")}${atRisk ? `, ${plural(atRisk, "prazo", "prazos")} em risco` : ""}${inactive !== null && inactive >= 7 ? `, sem avanço há ${inactive} dias` : ""}.`,
    kpis: { dependentTasks: external.length, affectedCampaigns: self.campaigns.length, inactiveDays: inactive, deadlinesAtRisk: atRisk },
    flags: { noEstimate: open.every((t) => t.estimateMinutes === null), noDueDate: !due, circular: open.some((t) => ctx.g.inCycle.has(t.id)) },
    dueDate: due,
    priority: p.priority,
  };
}

function campaignCandidate(ctx: Ctx, c: EngineCampaign): Candidate {
  const { today } = ctx.input;
  const tasks = ctx.input.tasks.filter((t) => c.taskIds.includes(t.id) || (!!t.projectId && c.projectIds.includes(t.projectId)));
  const open = tasks.filter((t) => !t.done);
  const pending = ctx.input.milestones.filter((m) => m.campaignId === c.id && !m.done);
  const lastAct = tasks.map((t) => t.lastActivity).filter((d): d is string => !!d).sort().pop() ?? null;
  const inactive = inactiveDaysOf(today, lastAct);
  const atRisk = pending.filter((m) => isAtRisk(today, m.dueDate)).length + open.filter((t) => isAtRisk(today, t.dueDate)).length;
  const goal = ctx.input.goals.find((g) => g.id === c.goalId && g.active);
  const scores: Scores = {
    dependency: calculateDependencyScore({ tasksByDepth: [], projects: 0, campaigns: 0, goals: goal ? 1 : 0, milestonesByDepth: pending.map(() => 1) }),
    urgency: calculateUrgencyScore({ today, dueDate: c.endDate, priority: c.priority, dependentDueDates: pending.map((m) => m.dueDate).filter((d): d is string => !!d) }),
    inactivity: calculateInactivityScore(inactive),
    strategic: calculateStrategicScore({ priority: c.priority, hasGoal: !!goal, campaigns: [], hasProject: c.projectIds.length > 0 }),
    capacity: calculateCapacityPressure({ needMinutes: open.reduce((s, t) => s + (remainingMinutes(t) ?? 0), 0) || null, deadline: c.endDate, today, capacity: ctx.input.capacity }),
    downstream: calculateDownstreamRisk(atRisk),
  };
  const score = combineScore(scores);
  return {
    key: `campaign:${c.id}`,
    type: "CAMPAIGN",
    entityId: c.id,
    title: c.title,
    context: `${c.progressPct}% concluída`,
    link: `/forja-campanhas/${encodeURIComponent(c.id)}`,
    score,
    level: classifyScore(score),
    scores,
    urgency: scores.urgency,
    description: `Campanha em ${c.progressPct}% com ${plural(open.length, "missão aberta", "missões abertas")} e ${plural(pending.length, "marco pendente", "marcos pendentes")}.`,
    kpis: { dependentTasks: open.length, affectedCampaigns: 1, inactiveDays: inactive, deadlinesAtRisk: atRisk },
    flags: { noEstimate: open.every((t) => t.estimateMinutes === null), noDueDate: !c.endDate, circular: false },
    dueDate: c.endDate,
    priority: c.priority,
  };
}

function milestoneCandidate(ctx: Ctx, m: EngineMilestone): Candidate | null {
  const { today } = ctx.input;
  const camp = ctx.input.campaigns.find((c) => c.id === m.campaignId && ACTIVE_CAMPAIGN(c.status));
  if (!camp) return null;
  // Cadeia real de marcos (dependency_milestone_id).
  const byDepth: number[] = [];
  const chain: EngineMilestone[] = [];
  let frontier = [m.id];
  for (let depth = 1; depth <= C.maxDepth && frontier.length; depth++) {
    const next = ctx.input.milestones.filter((x) => !x.done && x.dependencyId && frontier.includes(x.dependencyId) && !chain.includes(x) && x.id !== m.id);
    chain.push(...next);
    byDepth.push(...next.map(() => depth));
    frontier = next.map((x) => x.id);
  }
  if (chain.length === 0 && !m.dueDate) return null;
  const goal = ctx.input.goals.find((g) => g.id === camp.goalId && g.active);
  const atRisk = chain.filter((x) => isAtRisk(today, x.dueDate)).length + (isAtRisk(today, m.dueDate) ? 1 : 0);
  const scores: Scores = {
    dependency: calculateDependencyScore({ tasksByDepth: [], projects: 0, campaigns: 1, goals: goal ? 1 : 0, milestonesByDepth: byDepth }),
    urgency: calculateUrgencyScore({ today, dueDate: m.dueDate, priority: camp.priority, dependentDueDates: chain.map((x) => x.dueDate).filter((d): d is string => !!d) }),
    inactivity: 0,
    strategic: calculateStrategicScore({ priority: camp.priority, hasGoal: !!goal, campaigns: [camp], hasProject: false }),
    capacity: 0,
    downstream: calculateDownstreamRisk(chain.filter((x) => isAtRisk(today, x.dueDate)).length),
  };
  const score = combineScore(scores);
  return {
    key: `milestone:${m.id}`,
    type: "MILESTONE",
    entityId: m.id,
    title: m.title,
    context: camp.title,
    link: `/forja-campanhas/${encodeURIComponent(camp.id)}`,
    score,
    level: classifyScore(score),
    scores,
    urgency: scores.urgency,
    description: chain.length ? `Marco que antecede ${plural(chain.length, "outro marco", "outros marcos")} da campanha ${camp.title}.` : `Marco da campanha ${camp.title}.`,
    kpis: { dependentTasks: 0, affectedCampaigns: 1, inactiveDays: null, deadlinesAtRisk: atRisk },
    flags: { noEstimate: true, noDueDate: !m.dueDate, circular: false },
    dueDate: m.dueDate,
    priority: camp.priority,
  };
}

function habitCandidate(ctx: Ctx, h: EngineHabit): Candidate | null {
  const H = C.habit;
  if (h.expected < H.minExpected) return null;
  const adherence = h.met / h.expected;
  if (adherence >= H.poorAdherence) return null;
  const inactive = inactiveDaysOf(ctx.input.today, h.lastEntry);
  const camps = ctx.input.campaigns.filter((c) => h.campaignIds.includes(c.id) && ACTIVE_CAMPAIGN(c.status));
  const scores: Scores = {
    dependency: round(clamp(camps.length * H.campaignLink)),
    urgency: 0,
    inactivity: calculateInactivityScore(inactive),
    strategic: calculateStrategicScore({ priority: "Média", hasGoal: false, campaigns: camps, hasProject: false }),
    capacity: 0,
    downstream: round(clamp((1 - adherence) * 100)),
  };
  const score = combineScore(scores);
  return {
    key: `habit:${h.id}`,
    type: "HABIT",
    entityId: h.id,
    title: `${h.name} — Consistência`,
    context: `${round(adherence * 100)}% de adesão`,
    link: "/habitos",
    score,
    level: classifyScore(score),
    scores,
    urgency: 0,
    description: `Cumprido em ${h.met} de ${h.expected} ciclos nos últimos ${H.windowDays} dias${camps.length ? `; ligado a ${plural(camps.length, "campanha", "campanhas")}` : ""}.`,
    kpis: { dependentTasks: 0, affectedCampaigns: camps.length, inactiveDays: inactive, deadlinesAtRisk: 0 },
    flags: { noEstimate: true, noDueDate: true, circular: false },
    dueDate: null,
    priority: null,
  };
}

function capacityCandidate(ctx: Ctx): Candidate | null {
  const days = ctx.input.capacity.filter((d) => d.totalMinutes > 0);
  if (days.length === 0) return null;
  const overloaded = days.filter((d) => d.occupancy >= C.overload.occupancy);
  if (overloaded.length === 0) return null;
  const avg = days.reduce((s, d) => s + d.occupancy, 0) / days.length;
  const first = overloaded[0];
  const dueInOverload = ctx.input.tasks.filter((t) => !t.done && t.dueDate && overloaded.some((d) => d.date === t.dueDate)).length;
  const scores: Scores = {
    dependency: 0,
    urgency: urgencyFromDays(daysBetween(ctx.input.today, first.date)),
    inactivity: 0,
    strategic: 30,
    capacity: round(clamp(avg * 100)),
    downstream: calculateDownstreamRisk(dueInOverload),
  };
  const score = combineScore(scores);
  return {
    key: "capacity:agenda",
    type: "CAPACITY",
    entityId: null,
    title: "Sobrecarga na agenda",
    context: `${round(avg * 100)}% de ocupação média`,
    link: "/capacity-planner",
    score,
    level: classifyScore(score),
    scores,
    urgency: scores.urgency,
    description: `${plural(overloaded.length, "dia", "dias")} com carga planejada acima de ${round(C.overload.occupancy * 100)}% da capacidade nos próximos ${days.length} dias.`,
    kpis: { dependentTasks: 0, affectedCampaigns: 0, inactiveDays: null, deadlinesAtRisk: dueInOverload },
    flags: { noEstimate: false, noDueDate: true, circular: false },
    dueDate: first.date,
    priority: null,
  };
}

/** Sinais de saúde: só "padrão observado" (nunca causa nem diagnóstico) e nunca críticos. */
function healthCandidates(ctx: Ctx): Candidate[] {
  const H = C.health;
  const out: Candidate[] = [];
  const add = (key: "sleep" | "energy", label: string, value: number | null) => {
    if (value === null || value >= H.attentionBelow) return;
    const score = round(Math.min(H.maxScore, (H.attentionBelow - value + 20) * H.scoreFactor));
    out.push({
      key: `health:${key}`,
      type: "HEALTH_SIGNAL",
      entityId: null,
      title: label,
      context: `Índice ${value}/100 (Signals)`,
      link: "/saude",
      score,
      level: classifyScore(score),
      scores: null,
      urgency: 0,
      description: `Padrão observado nos registros recentes (índice ${value}/100). É um sinal de atenção, não um diagnóstico.`,
      kpis: { dependentTasks: 0, affectedCampaigns: 0, inactiveDays: null, deadlinesAtRisk: 0 },
      flags: { noEstimate: true, noDueDate: true, circular: false },
      dueDate: null,
      priority: null,
    });
  };
  add("sleep", "Sono abaixo do habitual", ctx.input.signals.sleep);
  add("energy", "Energia baixa", ctx.input.signals.energy);
  return out;
}

/** Ordenação determinística: score, urgência, tipo e chave. */
export function rankCandidates(list: Candidate[]): Candidate[] {
  return [...list].sort((a, b) => b.score - a.score || b.urgency - a.urgency || TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.key.localeCompare(b.key));
}

/* ---------------------------------- Causas ---------------------------------- */

export function getBottleneckCauses(ctx: Ctx, cand: Candidate): Cause[] {
  const { today } = ctx.input;
  const out: Cause[] = [];
  const t = cand.type === "TASK" ? ctx.g.byId.get(cand.entityId!) : undefined;
  if (cand.flags.circular)
    out.push({ type: "CIRCULAR_DEPENDENCY", label: "Dependência circular", description: "Tarefas que dependem umas das outras.", evidence: "Há um ciclo de dependências envolvendo este item: nenhuma das tarefas do ciclo pode começar.", confidence: "high" });
  if (t) {
    const blockers = openBlockers(t, ctx.g);
    if (blockers.length)
      out.push({
        type: "BLOCKED_BY_DEPENDENCY",
        label: "Aguardando outra entrega",
        description: "Depende de tarefas ainda abertas.",
        evidence: `Depende de ${blockers.map((b) => `“${ctx.g.byId.get(b)!.title}”`).join(", ")}.`,
        confidence: "high",
      });
    const rem = remainingMinutes(t);
    if (rem !== null && rem >= C.causes.complexityMinutes)
      out.push({ type: "COMPLEXITY", label: "Complexidade da tarefa", description: "Uso de alta concentração e tempo.", evidence: `Ainda faltam cerca de ${Math.round(rem / 6) / 10} h estimadas.`, confidence: "high" });
    const need = Math.min(rem ?? C.focus.defaultMinutes, C.focus.maxMinutes);
    const windowsAhead = ctx.input.freeSlots.filter((s) => daysBetween(today, s.date) <= C.focus.searchDays);
    if (windowsAhead.length) {
      const longest = Math.max(...windowsAhead.map((s) => toMin(s.end) - toMin(s.start)));
      if (longest < Math.max(C.causes.continuousMinutes, Math.min(need, 90)))
        out.push({ type: "NO_CONTINUOUS_TIME", label: "Falta de tempo contínuo", description: "Fragmentação da agenda.", evidence: `Nos próximos ${C.focus.searchDays} dias, a maior janela livre é de ${longest} min.`, confidence: "medium" });
    }
    const limit = t.dueDate ?? null;
    const competing = ctx.input.tasks.filter(
      (o) => o.id !== t.id && !o.done && o.dueDate && daysBetween(today, o.dueDate) <= C.causes.competingDays && (!limit || o.dueDate <= limit) && o.priority !== "Baixa",
    );
    if (competing.length >= 2)
      out.push({ type: "COMPETING_PRIORITIES", label: "Outras prioridades", description: "Tarefas concorrentes com prazos próximos.", evidence: `${plural(competing.length, "outra tarefa", "outras tarefas")} de prioridade média/alta vencem antes ou nos próximos ${C.causes.competingDays} dias.`, confidence: "medium" });
    if (t.estimateMinutes === null)
      out.push({ type: "NO_ESTIMATE", label: "Tempo não estimado", description: "Sem estimativa, o planejamento fica no escuro.", evidence: "Esta tarefa não tem duração estimada.", confidence: "low" });
  }
  const days = ctx.input.capacity.filter((d) => d.totalMinutes > 0);
  if (days.length) {
    const avg = days.reduce((s, d) => s + d.occupancy, 0) / days.length;
    if (avg >= C.overload.causeOccupancy)
      out.push({ type: "OVERLOAD", label: "Carga elevada", description: "Sinais de sobrecarga no planejamento.", evidence: `Ocupação média de ${round(avg * 100)}% nos próximos ${days.length} dias (Capacity Planner).`, confidence: "high" });
  }
  if (cand.kpis.inactiveDays !== null && cand.kpis.inactiveDays >= 7)
    out.push({ type: "INACTIVITY", label: "Sem avanço recente", description: "Nenhum progresso registrado.", evidence: `Última atividade há ${cand.kpis.inactiveDays} dias.`, confidence: "high" });
  if (cand.type === "HABIT")
    out.push({ type: "LOW_ADHERENCE", label: "Baixa adesão", description: "Ciclos do hábito não cumpridos.", evidence: cand.description, confidence: "high" });
  const energy = ctx.input.signals.energy;
  if (energy !== null && energy < 40)
    out.push({
      type: "LOW_ENERGY_PATTERN",
      label: "Energia baixa (associação)",
      description: "Padrão observado, não causa comprovada.",
      evidence: `Índice de energia ${energy}/100 nos registros recentes. Pode estar associado ao ritmo atual — não é diagnóstico.`,
      confidence: "low",
    });
  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.confidence] - rank[b.confidence]).slice(0, 5);
}

/* ------------------------------ Grafo afetado ------------------------------ */

export function getAffectedDependencies(ctx: Ctx, cand: Candidate, scoreOf: (key: string) => number | null, maxDepth = 2): DependencyGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const add = (n: GraphNode) => {
    if (!nodes.some((x) => x.key === n.key)) nodes.push(n);
  };
  const taskNode = (t: EngineTask, depth: number, relation: GraphNode["relation"]): GraphNode => ({
    key: `task:${t.id}`,
    type: "TASK",
    label: t.title,
    status: t.status,
    depth,
    relation,
    impact: scoreOf(`task:${t.id}`),
    link: `/tarefas?task=${encodeURIComponent(t.id)}`,
  });
  const campNode = (c: EngineCampaign, depth: number): GraphNode => ({ key: `campaign:${c.id}`, type: "CAMPAIGN", label: c.title, status: `${c.progressPct}%`, depth, relation: "affected", impact: scoreOf(`campaign:${c.id}`), link: `/forja-campanhas/${c.id}` });
  let truncated = false;
  if (cand.type === "TASK") {
    const t = ctx.g.byId.get(cand.entityId!)!;
    add(taskNode(t, 0, "center"));
    for (const b of openBlockers(t, ctx.g)) {
      add(taskNode(ctx.g.byId.get(b)!, 1, "blocker"));
      edges.push({ from: `task:${b}`, to: cand.key, kind: "depends" });
    }
    const down = downstreamTasks(t.id, ctx.g, maxDepth + 1);
    for (const [id, depth] of [...down].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))) {
      if (depth > maxDepth) {
        truncated = true;
        continue;
      }
      const d = ctx.g.byId.get(id)!;
      add(taskNode(d, depth, "blocked"));
      for (const dep of d.dependsOn) if (nodes.some((n) => n.key === `task:${dep}`)) edges.push({ from: `task:${dep}`, to: `task:${id}`, kind: "depends" });
    }
    const p = ctx.input.projects.find((x) => x.id === t.projectId);
    if (p) {
      add({ key: `project:${p.id}`, type: "PROJECT", label: p.name, status: p.status, depth: 1, relation: "belongs", impact: scoreOf(`project:${p.id}`), link: `/projetos/${p.id}` });
      edges.push({ from: cand.key, to: `project:${p.id}`, kind: "member" });
    }
    for (const c of ctx.campaignsOfTask(t)) {
      add(campNode(c, 1));
      edges.push({ from: cand.key, to: `campaign:${c.id}`, kind: "member" });
    }
    const goal = ctx.input.goals.find((g) => g.id === t.goalId && g.active);
    if (goal) {
      add({ key: `goal:${goal.id}`, type: "GOAL", label: goal.title, status: "ativa", depth: 1, relation: "affected", impact: null, link: "/metas" });
      edges.push({ from: cand.key, to: `goal:${goal.id}`, kind: "member" });
    }
  } else if (cand.type === "PROJECT") {
    add({ key: cand.key, type: "PROJECT", label: cand.title, status: "ativo", depth: 0, relation: "center", impact: cand.score, link: cand.link });
    const open = ctx.input.tasks.filter((t) => t.projectId === cand.entityId && !t.done);
    for (const c of affectedBy(ctx, open).campaigns) {
      add(campNode(c, 1));
      edges.push({ from: cand.key, to: `campaign:${c.id}`, kind: "member" });
    }
    for (const t of open)
      for (const [id, depth] of downstreamTasks(t.id, ctx.g, 1)) {
        const d = ctx.g.byId.get(id)!;
        if (d.projectId === cand.entityId) continue;
        add(taskNode(d, depth, "blocked"));
        edges.push({ from: cand.key, to: `task:${id}`, kind: "depends" });
      }
  } else if (cand.type === "CAMPAIGN" || cand.type === "MILESTONE") {
    const campId = cand.type === "CAMPAIGN" ? cand.entityId! : ctx.input.milestones.find((m) => m.id === cand.entityId)!.campaignId;
    const c = ctx.input.campaigns.find((x) => x.id === campId)!;
    if (cand.type === "MILESTONE") {
      add({ key: cand.key, type: "MILESTONE", label: cand.title, status: "pendente", depth: 0, relation: "center", impact: cand.score, link: cand.link });
      add(campNode(c, 1));
      edges.push({ from: cand.key, to: `campaign:${c.id}`, kind: "member" });
      for (const m of ctx.input.milestones.filter((x) => x.dependencyId === cand.entityId && !x.done)) {
        add({ key: `milestone:${m.id}`, type: "MILESTONE", label: m.title, status: "pendente", depth: 1, relation: "blocked", impact: scoreOf(`milestone:${m.id}`), link: cand.link });
        edges.push({ from: cand.key, to: `milestone:${m.id}`, kind: "depends" });
      }
    } else {
      add({ ...campNode(c, 0), relation: "center" });
      for (const m of ctx.input.milestones.filter((x) => x.campaignId === c.id && !x.done).slice(0, 4)) {
        add({ key: `milestone:${m.id}`, type: "MILESTONE", label: m.title, status: "pendente", depth: 1, relation: "belongs", impact: scoreOf(`milestone:${m.id}`), link: cand.link });
        edges.push({ from: `milestone:${m.id}`, to: cand.key, kind: "member" });
      }
    }
    const goal = ctx.input.goals.find((g) => g.id === c.goalId && g.active);
    if (goal) {
      add({ key: `goal:${goal.id}`, type: "GOAL", label: goal.title, status: "ativa", depth: 1, relation: "affected", impact: null, link: "/metas" });
      edges.push({ from: `campaign:${c.id}`, to: `goal:${goal.id}`, kind: "member" });
    }
  } else if (cand.type === "HABIT") {
    const h = ctx.input.habits.find((x) => x.id === cand.entityId)!;
    add({ key: cand.key, type: "HABIT", label: cand.title, status: cand.context ?? "", depth: 0, relation: "center", impact: cand.score, link: cand.link });
    for (const c of ctx.input.campaigns.filter((x) => h.campaignIds.includes(x.id) && ACTIVE_CAMPAIGN(x.status))) {
      add(campNode(c, 1));
      edges.push({ from: cand.key, to: `campaign:${c.id}`, kind: "member" });
    }
  }
  // Ciclos que tocam o grafo exibido.
  const shown = new Set(nodes.map((n) => n.key.replace(/^task:/, "")));
  const cycles = ctx.g.cycles.filter((cy) => cy.some((id) => shown.has(id))).map((cy) => cy.map((id) => ctx.g.byId.get(id)?.title ?? id));
  return { nodes, edges, cycles, truncated };
}

/* ------------------------------ Recomendação ------------------------------ */

/** Primeira janela livre que comporta a duração, preferindo o horário histórico de foco. */
export function pickFocusSlot(input: EngineInput, minutes: number): { date: string; start: string; end: string; timeSource: "focus_history" | "energy" | "free_window" } | null {
  const F = C.focus;
  const preferHour = input.focusPattern && input.focusPattern.sessions >= F.minSessionsForPattern ? input.focusPattern.hour : null;
  const energyHour = !preferHour && input.energyBestPeriod ? Number(input.energyBestPeriod.slice(0, 2)) : null;
  const target = preferHour ?? energyHour;
  const nowMin = toMin(input.nowTime);
  const slots = input.freeSlots
    .filter((s) => daysBetween(input.today, s.date) >= 0 && daysBetween(input.today, s.date) <= F.searchDays)
    .map((s) => {
      const from = s.date === input.today ? Math.max(toMin(s.start), Math.ceil(nowMin / 15) * 15) : toMin(s.start);
      return { date: s.date, from, to: toMin(s.end) };
    })
    .filter((s) => s.to - s.from >= minutes)
    .sort((a, b) => a.date.localeCompare(b.date) || a.from - b.from);
  if (slots.length === 0) return null;
  if (target !== null) {
    for (const s of slots) {
      const start = Math.max(s.from, target * 60);
      if (start + minutes <= s.to) return { date: s.date, start: toHHMM(start), end: toHHMM(start + minutes), timeSource: preferHour !== null ? "focus_history" : "energy" };
    }
  }
  const s = slots[0];
  return { date: s.date, start: toHHMM(s.from), end: toHHMM(s.from + minutes), timeSource: "free_window" };
}

/** Tarefas que ficariam prontas (sem bloqueador aberto) se `ids` fossem concluídas. */
function wouldUnblock(ctx: Ctx, ids: Set<string>): EngineTask[] {
  const out: EngineTask[] = [];
  for (const id of ids)
    for (const d of ctx.g.dependents.get(id) ?? []) {
      const t = ctx.g.byId.get(d)!;
      if (t.done || ids.has(t.id) || out.includes(t)) continue;
      if (openBlockers(t, ctx.g).every((b) => ids.has(b))) out.push(t);
    }
  return out;
}

export function getRecommendedAction(ctx: Ctx, cand: Candidate): RecommendedAction {
  const base = { estimatedMinutes: null, targetId: cand.entityId, preview: null, expected: null } as const;
  switch (cand.type) {
    case "TASK": {
      const t = ctx.g.byId.get(cand.entityId!)!;
      const blockers = openBlockers(t, ctx.g);
      if (cand.flags.circular)
        return { ...base, type: "OPEN_TASK", label: "Revisar dependências circulares", reason: "Há um ciclo de dependências: remova a dependência que não é real para destravar o fluxo.", link: cand.link, confidence: "high" };
      if (blockers.length) {
        const b = ctx.g.byId.get(blockers[0])!;
        return { ...base, type: "OPEN_TASK", label: `Começar por “${b.title}”`, reason: `“${t.title}” só avança depois de “${b.title}”.`, targetId: b.id, link: `/tarefas?task=${encodeURIComponent(b.id)}`, confidence: "high" };
      }
      const rem = remainingMinutes(t);
      const F = C.focus;
      const minutes = rem ? Math.min(F.maxMinutes, Math.max(F.minMinutes, Math.ceil(rem / 15) * 15)) : F.defaultMinutes;
      const slot = pickFocusSlot(ctx.input, minutes);
      const unblocked = wouldUnblock(ctx, new Set([t.id]));
      const expected = unblocked.length ? `Desbloquear ${plural(unblocked.length, "tarefa", "tarefas")}` : rem && rem <= minutes ? "Concluir a missão" : "Avançar na missão";
      if (!slot)
        return { ...base, type: "OPEN_CAPACITY_PLANNER", label: "Abrir espaço no Capacity Planner", reason: `Não há janela livre de ${minutes} min nos próximos ${F.searchDays} dias para avançar em “${t.title}”.`, estimatedMinutes: minutes, link: "/capacity-planner", confidence: "medium", expected };
      const when = slot.date === ctx.input.today ? "hoje" : daysBetween(ctx.input.today, slot.date) === 1 ? "amanhã" : `em ${slot.date.slice(8, 10)}/${slot.date.slice(5, 7)}`;
      const period = toMin(slot.start) < 12 * 60 ? "pela manhã" : toMin(slot.start) < 18 * 60 ? "à tarde" : "à noite";
      return {
        type: "SCHEDULE_FOCUS",
        label: "Criar sessão Focus",
        reason: `Reserve uma sessão Focus de ${minutes} minutos ${when} ${period} para avançar em “${t.title}”.`,
        estimatedMinutes: minutes,
        targetId: t.id,
        link: null,
        confidence: rem ? "high" : "medium",
        preview: { date: slot.date, start: slot.start, end: slot.end, durationSource: rem ? "estimate" : "default", timeSource: slot.timeSource },
        expected,
      };
    }
    case "PROJECT":
      return { ...base, type: "OPEN_PROJECT", label: "Abrir projeto", reason: "Revise as tarefas abertas e defina a próxima entrega concreta.", link: cand.link, confidence: "medium" };
    case "CAMPAIGN":
    case "MILESTONE":
      return { ...base, type: "OPEN_CAMPAIGN", label: "Abrir campanha", reason: "Veja o próximo marco e as missões que o sustentam.", link: cand.link, confidence: "medium" };
    case "CAPACITY":
      return { ...base, type: "RUN_PROTOCOL", label: "Executar protocolo “Estou sobrecarregado”", reason: "A carga planejada passa da capacidade: revise o que pode ser adiado (nada muda sem confirmação).", targetId: "t:sobrecarregado", link: "/protocolos?executar=t%3Asobrecarregado", confidence: "high" };
    case "HABIT":
      return { ...base, type: "OPEN_HABITS", label: "Rever hábito", reason: "Ajuste a meta do hábito ou reserve um horário fixo para ele.", link: "/habitos", confidence: "medium" };
    default:
      return { ...base, type: "OPEN_HEALTH", label: "Ver registros de saúde", reason: "Acompanhe o padrão nos seus registros; isso não é diagnóstico.", link: "/saude", confidence: "low" };
  }
}

/* ---------------------------- Impacto projetado ---------------------------- */

/**
 * Simulação SOMENTE LEITURA: "se este item fosse concluído agora".
 * Trabalha sobre cópias em memória — nunca toca no banco, XP ou progresso.
 */
export function projectResolutionImpact(ctx: Ctx, cand: Candidate, topTaskOf: (cand: Candidate) => EngineTask | null): ImpactProjection {
  const items: ImpactItem[] = [];
  const empty = (basis: string): ImpactProjection => ({
    targetTitle: null,
    basis,
    items: [
      { key: "campaigns", value: null, unit: "pp", label: "Progresso nas campanhas", note: "Sem simulação para este tipo." },
      { key: "load", value: null, unit: "%", label: "Carga planejada (7 dias)", note: "—" },
      { key: "deadlines", value: null, unit: "count", label: "Prazos em risco aliviados", note: "—" },
      { key: "missions", value: null, unit: "count", label: "Missões desbloqueadas", note: "—" },
      { key: "projects", value: null, unit: "count", label: "Projetos retomados", note: "—" },
    ],
  });
  if (cand.type === "MILESTONE") {
    const m = ctx.input.milestones.find((x) => x.id === cand.entityId)!;
    const camp = ctx.input.campaigns.find((c) => c.id === m.campaignId)!;
    const r = empty("Estimativa baseada na regra de progresso da campanha.");
    r.targetTitle = m.title;
    r.items[0] = { key: "campaigns", value: camp.milestonesTotal ? Math.round((100 * camp.weights.milestones) / camp.milestonesTotal) : null, unit: "pp", label: "Progresso na campanha", note: camp.title };
    r.items[3] = { key: "missions", value: ctx.input.milestones.filter((x) => x.dependencyId === m.id && !x.done).length, unit: "count", label: "Marcos liberados", note: "Marcos que esperam por este" };
    return r;
  }
  const t = cand.type === "TASK" ? ctx.g.byId.get(cand.entityId!)! : topTaskOf(cand);
  if (!t) return empty("Não há uma missão concreta para simular neste item.");
  const ids = new Set([t.id]);
  const unblocked = wouldUnblock(ctx, ids);
  // Campanhas: cada missão concluída soma (peso de missões ÷ total de missões) — mesma regra do campaignEngine.
  const camps = ctx.campaignsOfTask(t).filter((c) => c.missionsTotal > 0);
  const deltas = camps.map((c) => ({ c, pp: (100 * c.weights.missions) / c.missionsTotal }));
  const best = deltas.sort((a, b) => b.pp - a.pp)[0];
  const planned = ctx.input.capacity.reduce((s, d) => s + d.plannedMinutes, 0);
  const rem = remainingMinutes(t);
  const projects = ctx.input.projects.filter((p) => {
    if (!ACTIVE_PROJECT(p.status)) return false;
    const open = ctx.input.tasks.filter((x) => x.projectId === p.id && !x.done && x.id !== t.id);
    if (!open.length || !open.every((x) => openBlockers(x, ctx.g).length > 0)) return false;
    return open.some((x) => unblocked.includes(x));
  });
  const relieved = unblocked.filter((u) => isAtRisk(ctx.input.today, u.dueDate)).length;
  items.push({ key: "campaigns", value: best ? Math.round(best.pp) : null, unit: "pp", label: "Progresso nas campanhas", note: best ? `até +${Math.round(best.pp)} pp em ${best.c.title}` : "Missão fora de campanhas ativas" });
  items.push({
    key: "load",
    value: rem !== null && planned > 0 && t.dueDate && daysBetween(ctx.input.today, t.dueDate) < C.capacity.horizonDays ? Math.min(100, Math.round((rem / planned) * 100)) : null,
    unit: "%",
    label: "Carga planejada (7 dias)",
    note: rem === null ? "Tempo não estimado" : planned > 0 ? "redução estimada da carga" : "Sem carga planejada",
  });
  items.push({ key: "deadlines", value: relieved, unit: "count", label: "Prazos em risco aliviados", note: "Estimativa operacional, não clínica" });
  items.push({ key: "missions", value: unblocked.length, unit: "count", label: "Missões desbloqueadas", note: unblocked.length ? unblocked.slice(0, 3).map((u) => u.title).join(", ") : "Nenhuma depende só deste item" });
  items.push({ key: "projects", value: projects.length, unit: "count", label: "Projetos retomados", note: projects.length ? projects.map((p) => p.name).join(", ") : "Nenhum projeto parado por este item" });
  return { targetTitle: t.title, items, basis: "Projeção baseada nas dependências atuais — não é garantia." };
}

/* ------------------------------ Análise completa ------------------------------ */

export interface RelatedItem { key: string; type: GraphNode["type"]; label: string; note: string; link: string }

export interface BottleneckDetail {
  candidate: Candidate;
  causes: Cause[];
  graph: DependencyGraph;
  action: RecommendedAction;
  secondaryActions: RecommendedAction[];
  impact: ImpactProjection;
  related: RelatedItem[];
  oracleText: string;
}

export interface BottleneckAnalysis {
  today: string;
  status: "ok" | "clear" | "insufficient";
  missing: string[];
  primary: BottleneckDetail | null;
  ranking: Candidate[];
  potential: Candidate[];
  all: Candidate[];
  details: Record<string, BottleneckDetail>;
  cycles: string[][];
  thresholds: typeof C.thresholds;
  /** Checagens do estado "caminho livre" (derivadas dos mesmos dados). */
  checks: { deadlines: boolean; capacity: boolean; blocks: boolean };
}

function relatedOf(graph: DependencyGraph): RelatedItem[] {
  const note: Record<GraphNode["relation"], string> = { center: "", blocked: "Depende desta entrega", blocker: "Precisa ser concluída antes", belongs: "Contém este item", affected: "Afetada por este gargalo" };
  return graph.nodes
    .filter((n) => n.relation !== "center")
    .sort((a, b) => a.depth - b.depth || (b.impact ?? 0) - (a.impact ?? 0) || a.key.localeCompare(b.key))
    .slice(0, 4)
    .map((n) => ({ key: n.key, type: n.type, label: n.label, note: n.type === "CAMPAIGN" ? `${note[n.relation]} · ${n.status}` : note[n.relation], link: n.link }));
}

function oracleTextOf(c: Candidate, impact: ImpactProjection): string {
  const parts = [`Seu principal gargalo é “${c.title}”`];
  if (c.kpis.dependentTasks) parts.push(`que hoje bloqueia ${plural(c.kpis.dependentTasks, "tarefa", "tarefas")}`);
  if (c.kpis.affectedCampaigns) parts.push(`${c.kpis.dependentTasks ? "e afeta" : "que afeta"} ${plural(c.kpis.affectedCampaigns, "campanha", "campanhas")}`);
  let text = `${parts.join(", ")}.`;
  if (c.kpis.inactiveDays !== null && c.kpis.inactiveDays >= 7) text += ` Está sem atividade há ${c.kpis.inactiveDays} dias.`;
  const missions = impact.items.find((i) => i.key === "missions")?.value;
  if (missions) text += ` Concluí-lo tende a liberar ${plural(missions, "missão dependente", "missões dependentes")}.`;
  return text;
}

export function analyzeBottlenecksPure(input: EngineInput, opts: { detailKey?: string } = {}): BottleneckAnalysis {
  const ctx = makeCtx(input);
  const openTasks = input.tasks.filter((t) => !t.done);
  const list: Candidate[] = [
    ...openTasks.map((t) => taskCandidate(ctx, t)),
    ...input.projects.filter((p) => ACTIVE_PROJECT(p.status)).map((p) => projectCandidate(ctx, p)).filter((c): c is Candidate => !!c),
    ...input.campaigns.filter((c) => c.status === "active").map((c) => campaignCandidate(ctx, c)),
    ...input.milestones.filter((m) => !m.done).map((m) => milestoneCandidate(ctx, m)).filter((c): c is Candidate => !!c),
    ...input.habits.map((h) => habitCandidate(ctx, h)).filter((c): c is Candidate => !!c),
    ...[capacityCandidate(ctx)].filter((c): c is Candidate => !!c),
    ...healthCandidates(ctx),
  ];
  const all = rankCandidates(list);
  const scoreMap = new Map(all.map((c) => [c.key, c.score]));
  const scoreOf = (k: string) => scoreMap.get(k) ?? null;
  const missing: string[] = [];
  if (openTasks.length < C.minimum.openTasks) missing.push(`Pelo menos ${C.minimum.openTasks} tarefas abertas (você tem ${openTasks.length}).`);
  if (!input.tasks.some((t) => t.dueDate)) missing.push("Prazos nas tarefas.");
  if (!input.tasks.some((t) => t.dependsOn.length)) missing.push("Dependências entre tarefas (opcional, mas revela efeitos em cadeia).");
  if (!input.tasks.some((t) => t.estimateMinutes)) missing.push("Estimativa de tempo nas tarefas.");
  const insufficient = openTasks.length < C.minimum.openTasks && input.campaigns.filter((c) => c.status === "active").length === 0 && !list.some((c) => c.type === "HABIT");

  const topTaskOf = (cand: Candidate): EngineTask | null => {
    const pool =
      cand.type === "PROJECT"
        ? openTasks.filter((t) => t.projectId === cand.entityId)
        : cand.type === "CAMPAIGN"
          ? openTasks.filter((t) => ctx.campaignsOfTask(t).some((c) => c.id === cand.entityId))
          : [];
    const best = pool.map((t) => ({ t, s: scoreMap.get(`task:${t.id}`) ?? 0 })).sort((a, b) => b.s - a.s || a.t.id.localeCompare(b.t.id))[0];
    return best?.t ?? null;
  };
  const detailOf = (c: Candidate): BottleneckDetail => {
    const graph = getAffectedDependencies(ctx, c, scoreOf);
    const impact = projectResolutionImpact(ctx, c, topTaskOf);
    const action = getRecommendedAction(ctx, c);
    const secondary: RecommendedAction[] = [];
    if (c.type === "TASK") {
      secondary.push({ type: "OPEN_TASK", label: "Abrir tarefa", reason: "Ver detalhes e dependências.", estimatedMinutes: null, targetId: c.entityId, link: c.link, confidence: "high", preview: null, expected: null });
      if (c.dueDate) secondary.push({ type: "OPEN_DEADLINE_RADAR", label: "Ver no Deadline Radar", reason: "Prazos relacionados.", estimatedMinutes: null, targetId: null, link: "/deadline-radar", confidence: "high", preview: null, expected: null });
    }
    if (c.scores && c.scores.capacity >= 60)
      secondary.push({ type: "OPEN_CAPACITY_PLANNER", label: "Ajustar no Capacity Planner", reason: "A carga do período está alta.", estimatedMinutes: null, targetId: null, link: "/capacity-planner", confidence: "medium", preview: null, expected: null });
    return { candidate: c, causes: getBottleneckCauses(ctx, c), graph, action, secondaryActions: secondary, impact, related: relatedOf(graph), oracleText: oracleTextOf(c, impact) };
  };

  // Sinal de saúde nunca é o gargalo principal: é contexto, não causa.
  const primaryCand = insufficient ? null : all.find((c) => c.type !== "HEALTH_SIGNAL" && c.score >= C.primaryMin) ?? null;
  const ranking = all.filter((c) => c.score >= C.rankingMin).slice(0, C.rankingSize);
  const potential = all.filter((c) => !ranking.includes(c) && c.score >= C.potentialMin).slice(0, C.potentialSize);
  const details: Record<string, BottleneckDetail> = {};
  const extra = opts.detailKey ? all.filter((c) => c.key === opts.detailKey) : [];
  for (const c of [...ranking, ...potential, ...(primaryCand ? [primaryCand] : []), ...extra]) details[c.key] ??= detailOf(c);
  return {
    today: input.today,
    status: insufficient ? "insufficient" : primaryCand ? "ok" : "clear",
    missing: insufficient ? missing : [],
    primary: primaryCand ? details[primaryCand.key] : null,
    ranking,
    potential,
    all: all.slice(0, 40),
    details,
    cycles: ctx.g.cycles.map((cy) => cy.map((id) => ctx.g.byId.get(id)?.title ?? id)),
    thresholds: C.thresholds,
    checks: {
      deadlines: !openTasks.some((t) => t.dueDate && daysBetween(input.today, t.dueDate) < 0),
      capacity: !list.some((c) => c.type === "CAPACITY"),
      blocks: ctx.g.cycles.length === 0 && !all.some((c) => c.type === "TASK" && c.kpis.dependentTasks > 0 && c.score >= C.primaryMin),
    },
  };
}

/** Grafo maior (Ver mapa): mesma regra, mais profundidade. */
export function expandedGraph(input: EngineInput, key: string, depth = 4): DependencyGraph | null {
  const ctx = makeCtx(input);
  const a = analyzeBottlenecksPure(input);
  const cand = a.all.find((c) => c.key === key);
  if (!cand) return null;
  const scoreMap = new Map(a.all.map((c) => [c.key, c.score]));
  return getAffectedDependencies(ctx, cand, (k) => scoreMap.get(k) ?? null, depth);
}
