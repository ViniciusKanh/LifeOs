import { api } from "./api";
import type { HubRank, HubMission } from "./moduleHubService";
import type { Quest, QuestBoard } from "./questsService";

/** Espelho de /api/planning — Agenda, Conselho de Guerra, Missões e Quadro de Avisos (dados derivados). */

export const EVENT_CATEGORIES = ["evento", "foco", "estudo", "saude", "missao", "meta", "pessoal"] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

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

export interface AgendaConflict {
  day: string;
  a: { id: string; title: string; start: string; end: string };
  b: { id: string; title: string; start: string; end: string };
  overlapMinutes: number;
  suggestion: { eventId: string; start: string; end: string } | null;
}

export interface AgendaSuggestion {
  id: string;
  kind: "auto_plan" | "replan" | string;
  periodKey: string | null;
  payload: {
    blocks?: Array<{ taskId: string; title: string; date: string; start: string; durationMinutes: number }>;
    moves?: Array<{ taskId: string; title: string; from: string | null; to: string; reason: string }>;
  };
  createdAt: string;
}

export interface AgendaHub {
  today: string;
  weekStart: string;
  weekEnd: string;
  rank: HubRank & { points: number };
  rankBreakdown: { sealedPlans: number; plannedOnTime: number; focusSessionsWeek: number };
  indicators: {
    eventsWeek: number;
    focusBlocks: number;
    focusSessions: number;
    planStreakWeeks: number;
    plannedMinutes: number;
    completionPct: number | null;
    conflicts: number;
    consistencyPct: number;
  };
  tower: TowerBlock[];
  conflicts: AgendaConflict[];
  distribution: Array<{ category: string; minutes: number }>;
  pendingSuggestions: AgendaSuggestion[];
}

export interface CouncilHub {
  weekStart: string;
  campaigns: Array<{ id: string; title: string; status: string; lifeArea: string | null; total: number; done: number; pct: number }>;
  load: {
    freeMinutes: number;
    plannedMinutes: number;
    unestimatedTasks: number;
    occupancyPct: number | null;
    overloaded: boolean;
    byDay: Array<{ date: string; freeMinutes: number; plannedMinutes: number }>;
    byArea: Array<{ area: string; minutes: number }>;
  };
  sealedTotal: number;
  versions: Array<{ weekStart: string; version: number; createdAt: string; planned: number; events: number; focus: number }>;
}

export type MissionTier = "comum" | "prioritaria" | "epica" | "campanha" | "concluida";

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
  position: number;
}

export interface FeaturedMission {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  difficulty: string | null;
  dueDate: string | null;
  plannedDate: string | null;
  estimateMinutes: number | null;
  timeSpentMinutes: number;
  projectId: string | null;
  projectName: string | null;
  goalId: string | null;
  goalTitle: string | null;
  campaignTitle: string | null;
  subtasks: { total: number; done: number };
  baseXp: number;
  overdue: boolean;
  tier: MissionTier;
  subtaskList: Subtask[];
}

export interface MissionsHub {
  today: string;
  rank: HubRank & { points: number };
  consistency: { activeDaysLast14: number; pct: number };
  combo: { current: number; best: number; todayDone: number; history: Array<{ day: string; completed: number }>; milestones: Array<{ days: number; reached: boolean }> };
  featured: FeaturedMission | null;
  tiers: Array<{ id: string; tier: MissionTier }>;
  counts: Record<MissionTier, number>;
  load: {
    pendingEstimateMinutes: number;
    unestimated: number;
    executedWeekMinutes: number;
    pending: number;
    overdue: number;
    byPriority: Array<{ priority: string; count: number }>;
    freeMinutesRestOfWeek: number;
    occupancyPct: number | null;
  };
}

export interface GuildHub {
  today: string;
  board: QuestBoard;
  combo: { current: number; best: number };
  progress: { dailyDone: number; dailyTotal: number; weeklyDone: number; weeklyTotal: number; weekElapsedDays: number };
  chest: { claimable: Array<{ id: string; title: string; xp: number }>; xp: number; bonusReady: boolean };
  history: Array<{ title: string; templateKey: string; period: string; xp: number; claimedAt: string }>;
  claimedTotal: number;
  notices: {
    notifications: Array<{ id: string; title: string; body: string | null; url: string | null; createdAt: string }>;
    deadlines: Array<{ kind: string; title: string; date: string }>;
    events: Array<{ id: string; title: string; startsAt: string; allDay: boolean }>;
    achievements: Array<{ title: string; unlockedAt: string }>;
    reviewsDue: number;
  };
  events: Array<HubMission & { unit: string }>;
}

export type { Quest };

export const planningHubService = {
  agenda: () => api.get<AgendaHub>("/planning/agenda"),
  council: () => api.get<CouncilHub>("/planning/council"),
  missions: () => api.get<MissionsHub>("/planning/missions"),
  guild: () => api.get<GuildHub>("/planning/guild"),
  createBlock: (input: { title: string; date: string; start: string; durationMinutes: number; category: EventCategory; taskId?: string | null; goalId?: string | null; reminderMinutes?: number | null }) =>
    api.post<{ id: string; duplicated: boolean }>("/planning/agenda/blocks", input),
  eventMeta: (id: string, patch: { category?: EventCategory; reminderMinutes?: number | null; goalId?: string | null }) => api.patch<{ ok: boolean }>(`/planning/agenda/events/${id}/meta`, patch),
  reschedule: (id: string, input: { date: string; start: string | null; durationMinutes?: number }) => api.patch<{ ok: boolean }>(`/planning/agenda/events/${id}/reschedule`, input),
  planTask: (id: string, plannedDate: string | null) => api.patch<{ ok: boolean }>(`/planning/missions/tasks/${id}/plan`, { plannedDate }),
  generateSuggestion: (kind: "auto_plan" | "replan") => api.post<{ status: string; summary: string }>(`/planning/agenda/suggestions/${kind}/generate`),
  decideSuggestion: (id: string, decision: "apply" | "reject", payload?: AgendaSuggestion["payload"]) =>
    api.post<{ applied: number }>(`/planning/agenda/suggestions/${id}/decide`, { decision, payload }),
  subtasks: (taskId: string) => api.get<Subtask[]>(`/planning/missions/tasks/${taskId}/subtasks`),
  addSubtasks: (taskId: string, titles: string[]) => api.post<Subtask[]>(`/planning/missions/tasks/${taskId}/subtasks`, { titles }),
  toggleSubtask: (id: string, done: boolean) => api.patch<{ taskId: string; subtasks: Subtask[]; movedToInProgress: boolean; allDone: boolean }>(`/planning/missions/subtasks/${id}`, { done }),
  deleteSubtask: (id: string) => api.delete<void>(`/planning/missions/subtasks/${id}`),
  breakdown: (taskId: string) => api.post<{ ai: boolean; subtasks: string[]; estimateMinutes: number | null; note: string }>(`/planning/missions/tasks/${taskId}/breakdown`),
};
