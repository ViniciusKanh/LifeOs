import { api } from "./api";

export type CouncilFocusType = "campaign" | "project" | "goal";
export interface CouncilFocusRef {
  type: CouncilFocusType;
  id: string;
}
export interface CouncilFocusOption extends CouncilFocusRef {
  title: string;
  openTasks: number;
}

export interface CouncilAdherence {
  weekStart: string;
  planned: number;
  completed: number;
  pct: number | null;
  byDay: Array<{ date: string; planned: number; completed: number }>;
}

export interface CouncilPlan {
  id: string;
  weekStart: string;
  focus: CouncilFocusRef[];
  notes: string | null;
  sealedAt: string | null;
}

export interface CouncilOverview {
  today: string;
  weekStart: string;
  weekEnd: string;
  previousWeekStart: string;
  plan: CouncilPlan | null;
  previousPlanSealed: boolean;
  focusOptions: CouncilFocusOption[];
  adherence: CouncilAdherence;
  previousAdherence: CouncilAdherence;
  reward: { xp: number; coins: number; awarded: boolean };
}

export type CouncilCandidateReason = "focus" | "overdue" | "due_this_week" | "planned";

export interface CouncilCandidate {
  id: string;
  title: string;
  priority: "Baixa" | "Média" | "Alta";
  status: string;
  estimateMinutes: number | null;
  dueDate: string | null;
  plannedDate: string | null;
  projectName: string | null;
  projectColor: string | null;
  reasons: CouncilCandidateReason[];
}

export interface CouncilProposal {
  weekStart: string;
  firstDay: string;
  candidates: CouncilCandidate[];
  assignments: Array<{ taskId: string; plannedDate: string | null; unplacedReason: string | null }>;
  dayLoads: Array<{ date: string; capacityMinutes: number; plannedMinutes: number; tasks: number }>;
}

export interface CouncilEventInput {
  taskId: string;
  date: string;
  startTime: string;
  durationMinutes: number;
}

export interface CouncilSealInput {
  weekStart: string;
  focus: CouncilFocusRef[];
  notes?: string | null;
  assignments: Array<{ taskId: string; plannedDate: string | null }>;
  events?: CouncilEventInput[];
}

export interface CouncilSealResult {
  plan: CouncilPlan | null;
  adherence: CouncilAdherence;
  plannedCount: number;
  eventsCreated: number;
  xpAwarded: boolean;
}

/** Conselho de Guerra — planejamento da semana (/api/war-council). Só `seal` grava. */
export const warCouncilService = {
  overview: (weekStart?: string) => api.get<CouncilOverview>(`/war-council${weekStart ? `?weekStart=${weekStart}` : ""}`),
  proposal: (weekStart: string, focus: CouncilFocusRef[]) => api.post<CouncilProposal>("/war-council/proposal", { weekStart, focus }),
  seal: (input: CouncilSealInput) => api.post<CouncilSealResult>("/war-council/seal", input),
};
