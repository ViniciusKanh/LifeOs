import { api } from "./api";
import type { Difficulty, Task, TaskPriority } from "@/types";
import type { ProposedTask } from "./contractsService";

/** Espelho de /api/campaigns (Forja de Campanhas). Tudo isolado por usuário no backend. */
export type CampaignStatus = "planned" | "active" | "paused" | "completed" | "archived";
export type CampaignTerm = "curto" | "medio" | "longo";
export type TrailState = "completed" | "current" | "upcoming" | "blocked";

export interface CampaignMilestone {
  id: string;
  title: string;
  description: string | null;
  position: number;
  dueDate: string | null;
  status: "pending" | "completed";
  isMajor: boolean;
  dependencyId: string | null;
  xpReward: number;
  coinReward: number;
  completedAt: string | null;
  state: TrailState;
}

export interface Campaign {
  id: string;
  title: string;
  description: string | null;
  status: CampaignStatus;
  goalId: string | null;
  goalTitle: string | null;
  lifeArea: string | null;
  term: CampaignTerm;
  startDate: string | null;
  endDate: string | null;
  banner: string | null;
  icon: string | null;
  themeColor: string | null;
  priority: TaskPriority;
  streakEnabled: boolean;
  completionReward: { xp: number; coins: number };
  completedAt: string | null;
  createdAt: string;
  counts: { projects: number; missions: number; missionsDone: number; habits: number; milestones: number; milestonesDone: number };
  progress: { pct: number; missionsPct: number | null; milestonesPct: number | null; contractsPct: number | null; weights: { missions: number; milestones: number; contracts: number } };
  readyToComplete: boolean;
  earned: { xp: number; coins: number };
  potential: { xp: number; coins: number };
  streak: { weeks: number; xpPct: number; coinsPct: number; nextTier: { weeks: number; xpPct: number; coinsPct: number } | null };
  milestones: CampaignMilestone[];
}

export interface CampaignDetail {
  campaign: Campaign;
  projects: Array<{ id: string; name: string; kind: string; status: string | null }>;
  tasks: Array<Task & { direct_link: number }>;
  habits: Array<{ id: string; name: string; icon: string | null; frequency: string; target_count: number }>;
  events: Array<{ id: string; kind: string; label: string; created_at: string }>;
}

export interface MilestoneDraft {
  title: string;
  description?: string | null;
  dueDate?: string | null;
  isMajor?: boolean;
  xpReward?: number;
  coinReward?: number;
  dependsOnIndex?: number | null;
}

export interface CampaignInput {
  title: string;
  description?: string | null;
  goalId?: string | null;
  lifeArea?: string | null;
  term?: CampaignTerm;
  status?: "planned" | "active";
  startDate?: string | null;
  endDate?: string | null;
  banner?: string | null;
  icon?: string | null;
  themeColor?: string | null;
  priority?: TaskPriority;
  streakEnabled?: boolean;
  completionXp?: number;
  completionCoins?: number;
  projectIds?: string[];
  taskIds?: string[];
  habitIds?: string[];
  newTasks?: Array<{ title: string; description?: string | null; priority?: TaskPriority; difficulty?: Difficulty | null; dueDate?: string | null; projectId?: string | null }>;
  milestones?: MilestoneDraft[];
}

export interface RewardSuggestion {
  completion: { xp: number; coins: number };
  milestone: { normal: { xp: number; coins: number }; major: { xp: number; coins: number } };
  limits: { milestone: { xp: number; coins: number }; completion: { xp: number; coins: number } };
  streakTiers: Array<{ weeks: number; xpPct: number; coinsPct: number }>;
}

export const campaignsService = {
  list: () => api.get<Campaign[]>("/campaigns"),
  get: (id: string) => api.get<CampaignDetail>(`/campaigns/${id}`),
  create: (input: CampaignInput) => api.post<Campaign>("/campaigns", input),
  update: (id: string, input: Partial<Omit<CampaignInput, "projectIds" | "taskIds" | "habitIds" | "newTasks" | "milestones" | "status">>) =>
    api.patch<Campaign>(`/campaigns/${id}`, input),
  remove: (id: string) => api.delete<void>(`/campaigns/${id}`),
  setStatus: (id: string, status: "planned" | "active" | "paused" | "archived") => api.post<Campaign>(`/campaigns/${id}/status`, { status }),
  complete: (id: string) => api.post<{ campaign: Campaign; reward: { xp: number; coins: number } | null }>(`/campaigns/${id}/complete`),
  links: (id: string, kind: "projects" | "tasks" | "habits", ids: string[], linked: boolean) => api.post<Campaign>(`/campaigns/${id}/links`, { kind, ids, linked }),
  addMilestone: (id: string, m: MilestoneDraft & { dependencyId?: string | null }) => api.post<Campaign>(`/campaigns/${id}/milestones`, m),
  updateMilestone: (id: string, mid: string, m: Partial<MilestoneDraft> & { dependencyId?: string | null }) => api.patch<Campaign>(`/campaigns/${id}/milestones/${mid}`, m),
  removeMilestone: (id: string, mid: string) => api.delete<Campaign>(`/campaigns/${id}/milestones/${mid}`),
  reorderMilestones: (id: string, ids: string[]) => api.post<Campaign>(`/campaigns/${id}/milestones/reorder`, { ids }),
  milestoneDone: (id: string, mid: string, done: boolean) => api.post<{ campaign: Campaign; rewarded: boolean }>(`/campaigns/${id}/milestones/${mid}/done`, { done }),
  rewardSuggest: (term: CampaignTerm, milestones: number) => api.get<RewardSuggestion>(`/campaigns/rewards/suggest?term=${term}&milestones=${milestones}`),
  suggestMissions: (input: { title: string; description?: string | null; existing?: string[] }) => api.post<{ tasks: ProposedTask[] }>("/campaigns/ai/missions", input),
};
