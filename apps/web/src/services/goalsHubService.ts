import { api } from "./api";

/** Espelho de /api/goals-hub — Metas 2.0 (tudo derivado de metas, tarefas, projetos e Grimório reais). */
export type GoalHealth = "done" | "late" | "risk" | "stalled" | "ok" | "abandoned";

export interface HubGoal {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  status: string;
  lifeArea: string | null;
  category: string | null;
  period: string | null;
  dueDate: string | null;
  createdAt: string;
  completedAt: string | null;
  currentValue: number;
  targetValue: number | null;
  unit: string | null;
  nextAction: string | null;
  progressPct: number;
  expectedPct: number | null;
  daysLeft: number | null;
  health: GoalHealth;
  tasks: { total: number; done: number; overdue: number; source: "tasks" | "projects" | null };
  decks: Array<{ id: string; name: string; mode: string }>;
  projects: Array<{ id: string; name: string }>;
  campaigns: Array<{ id: string; title: string }>;
  lastActivityAt: string | null;
  forecast: { forecast: { date: string; ratePerDay: number; daysRemaining: number; aheadOrBehindDays: number | null } | null; reason: string | null };
  automations: string[];
}

export interface GoalsHub {
  today: string;
  goals: HubGoal[];
  indicators: {
    active: number;
    doneThisMonth: number;
    doneLastMonth: number;
    overallProgress: number | null;
    avgDaysToDeadline: number | null;
    overdue: number;
    atRisk: number;
    consistency: number | null;
    consistencyWeeks: number;
  };
  planner: {
    level: number;
    title: string;
    xp: number;
    levelStartXp: number;
    nextLevelXp: number;
    nextTitle: { title: string; level: number } | null;
    breakdown: Array<{ label: string; count: number; xp: number }>;
    rules: Record<string, number>;
  };
  /** Conquistas de planejamento do catálogo oficial (progresso real). */
  rewards: Array<{ code: string; title: string; description: string | null; tier: string; threshold: number; value: number; unlockedAt: string | null }>;
}

export interface GoalsAnalytics {
  weekly: Array<{ week: string; progressEvents: number; tasksDone: number; goalsDone: number }>;
  months: Array<{ month: string; done: number; created: number }>;
  byArea: Array<{ area: string; goals: number; avgProgress: number }>;
  deadlines: { onTime: number; late: number; sample: number };
  plannedVsActual: Array<{ id: string; title: string; expected: number; actual: number }>;
}

export interface GoalInsight {
  kind: "late" | "risk" | "stalled" | "bottleneck" | "conflict" | "no_plan" | "next_action" | "ok";
  goalId: string | null;
  title: string;
  detail: string;
  provenance: "dado" | "inferência" | "sugestão";
}

export interface GoalsInsights {
  insights: GoalInsight[];
  nextActions: Array<{ taskId: string; title: string; dueDate: string | null; priority: string; goalId: string; goalTitle: string }>;
  activeGoals: number;
}

export interface WeeklyPlanPayload {
  weekStart: string;
  days: Array<{ date: string; tasks: Array<{ taskId: string; title: string; goalTitle: string; dueDate: string | null }> }>;
  unscheduled: number;
}
export interface ReplanPayload {
  goalTitle: string;
  reason: string;
  basis: string;
  newDueDate: string | null;
  raisePriority: boolean;
  scopeNote: string | null;
  tasks: Array<{ taskId: string; title: string; from: string | null; to: string }>;
}
export interface BreakdownPayload {
  summary: string;
  milestones: Array<{ title: string; dueDate: string | null }>;
  tasks: Array<{ title: string; description: string | null; dueDate: string | null; estimateMinutes: number | null; priority: "Baixa" | "Média" | "Alta"; dependsOn: number | null }>;
  indicators: string[];
}

export type PlanSuggestion =
  | { id: string; kind: "weekly"; goalId: null; goalTitle: null; createdAt: string; payload: WeeklyPlanPayload }
  | { id: string; kind: "replan"; goalId: string; goalTitle: string | null; createdAt: string; payload: ReplanPayload }
  | { id: string; kind: "breakdown"; goalId: string; goalTitle: string | null; createdAt: string; payload: BreakdownPayload };

export const goalsHubService = {
  overview: () => api.get<GoalsHub>("/goals-hub/overview"),
  analytics: () => api.get<GoalsAnalytics>("/goals-hub/analytics"),
  insights: () => api.get<GoalsInsights>("/goals-hub/insights"),
  ask: (question: string) => api.post<{ ai: boolean; answer: string; insights: GoalInsight[] }>("/goals-hub/copilot", { question }),
  suggestions: () => api.get<PlanSuggestion[]>("/goals-hub/suggestions"),
  weeklyPlan: () => api.post<{ id: string; payload: WeeklyPlanPayload }>("/goals-hub/weekly-plan"),
  replan: (goalId: string) => api.post<{ id: string; payload: ReplanPayload }>(`/goals-hub/goals/${goalId}/replan`),
  planAi: (goalId: string) => api.post<{ id: string; payload: BreakdownPayload }>(`/goals-hub/goals/${goalId}/plan-ai`),
  apply: (id: string, payload?: unknown) => api.post<{ ok: boolean; message: string }>(`/goals-hub/suggestions/${id}/apply`, payload === undefined ? {} : { payload }),
  reject: (id: string) => api.post<void>(`/goals-hub/suggestions/${id}/reject`),
};
