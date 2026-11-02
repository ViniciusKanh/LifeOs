import { api } from "./api";
import type { BankSummary } from "./bankService";

/** Espelho de /api/hub — camada RPG (derivada) de Banco, Educação e Saúde. */

export interface HubRank {
  level: number;
  title: string;
  currentMin: number;
  next: { title: string; min: number } | null;
  pct: number;
}

export type VaultRarity = "comum" | "raro" | "epico" | "lendario";

export interface HubMission {
  key: string;
  title: string;
  description: string;
  current: number;
  target: number;
  done: boolean;
  achievementCode?: string | null;
}

export interface BankHub {
  summary: BankSummary;
  rank: HubRank & { xp: number };
  indicators: {
    balance: number;
    creditScore: number;
    dailyYieldEstimate: number;
    investStreakDays: number;
    activeInvestments: number;
    activeInvested: number;
    taxesPaid: number;
    transactions: number;
  };
  rarity: Record<string, VaultRarity>;
  missions: HubMission[];
  split: { enabled: boolean; config: Record<string, number> };
}

export interface EducationStage {
  id: string;
  educationId: string;
  title: string;
  position: number;
  status: "pending" | "active" | "done";
  dueDate: string | null;
  notes: string | null;
  completedAt: string | null;
}

export interface StudyPlanItem {
  date: string;
  subjectId: string | null;
  subjectName: string;
  minutes: number;
  title: string;
  reason: string;
}

export interface EducationHub {
  today: string;
  rank: HubRank & { points: number };
  breakdown: { studyMinutes: number; subjectsDone: number; deadlinesDone: number; stagesDone: number };
  indicators: {
    activeEducations: number;
    subjectsInProgress: number;
    studyMinutesWeek: number;
    studyMinutesTotal: number;
    academicProjectsOpen: number;
    upcomingDeadlines: number;
    overdueDeadlines: number;
    avgProgressPct: number | null;
  };
  educations: Array<{
    id: string;
    kind: string;
    institution: string | null;
    courseName: string;
    startedAt: string | null;
    expectedEndAt: string | null;
    progressPct: number;
    weeklyGoalMinutes: number;
    studyMinutesWeek: number;
  }>;
  subjects: Array<{ id: string; educationId: string; name: string; status: string; progressPct: number; professor: string | null; decks: Array<{ id: string; name: string }>; studyMinutesWeek: number }>;
  stages: EducationStage[];
  deadlines: Array<{ id: string; educationId: string; subjectName: string | null; title: string; dueDate: string; overdue: boolean }>;
  projects: Array<{ id: string; educationId: string | null; kind: string; title: string; progressPct: number; defenseDate: string | null; advisor: string | null }>;
  pendingPlan: { id: string; weekStart: string; payload: { weekStart: string; goalMinutes: number; items: StudyPlanItem[] } } | null;
}

export interface PillarScore {
  value: number | null;
  score: number | null;
}

export interface SleepNight {
  day: string;
  minutes: number;
  quality: number | null;
  entryIds: string[];
  merged: boolean;
}

export interface HealthHub {
  today: string;
  goals: { waterGoalMl: number; sleepGoalMinutes: number; weeklyWorkouts: number };
  vitality: {
    score: number;
    pillars: {
      water: PillarScore;
      sleep: PillarScore & { quality: number | null };
      move: PillarScore & { sessions: number };
      mood: PillarScore & { energy: number | null; stress: number | null };
    };
  };
  pulse: Array<{ day: string; water: number | null; sleep: number | null; move: number | null; mood: number | null }>;
  rank: HubRank & { points: number };
  rankBreakdown: { waterDays: number; balancedNights: number; workoutDays: number; moodDays: number };
  sleep: {
    lastNight: SleepNight | null;
    weekTotalMinutes: number;
    weekNights: number;
    weekAvgMinutes: number | null;
    inconsistent: Array<{ id: string; minutes: number; reason: string }>;
    nights: SleepNight[];
  };
  week: { workouts: number; moveMinutes: number; waterDaysAtGoal: number };
  missions: HubMission[];
  consistencyHistory: Array<{ week: string; water: number; sleep: number; move: number; mood: number }>;
}

export type AdvisorModule = "bank" | "education" | "health" | "agenda" | "council" | "missions" | "quests";
export interface AdvisorAnswer {
  ai: boolean;
  items: Array<{ kind: "dado" | "inferencia" | "sugestao"; text: string }>;
  disclaimer: string;
  insufficient: boolean;
}

export const moduleHubService = {
  bank: () => api.get<BankHub>("/hub/bank"),
  education: () => api.get<EducationHub>("/hub/education"),
  health: () => api.get<HealthHub>("/hub/health"),
  advisor: (module: AdvisorModule, body: { useAi: boolean; question?: string; research?: boolean }) => api.post<AdvisorAnswer>(`/hub/${module}/advisor`, body),
  createStage: (input: { educationId: string; title: string; dueDate?: string | null }) => api.post<EducationStage>("/hub/education/stages", input),
  applyStageTemplate: (educationId: string) => api.post<EducationStage[]>(`/hub/education/${educationId}/stages/template`),
  updateStage: (id: string, patch: Partial<Pick<EducationStage, "title" | "status" | "dueDate" | "notes" | "position">>) => api.patch<EducationStage>(`/hub/education/stages/${id}`, patch),
  deleteStage: (id: string) => api.delete<void>(`/hub/education/stages/${id}`),
  generatePlan: () => api.post<{ status: string; summary: string }>("/hub/education/plan/generate"),
  decidePlan: (id: string, decision: "apply" | "reject", items?: Array<{ date: string; subjectId?: string | null; minutes: number; title: string }>) =>
    api.post<{ ok: boolean; created: number }>(`/hub/education/plan/${id}/decide`, { decision, items }),
};
