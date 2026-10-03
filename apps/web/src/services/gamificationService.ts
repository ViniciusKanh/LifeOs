import { api } from "./api";

/** Espelho dos tipos de /api/gamification (nível sempre derivado do XP no backend). */
export interface PlayerEvent {
  id: string;
  sourceType: "task" | "day" | "habit_entry" | "focus" | "project" | "journal" | string;
  sourceId: string;
  eventType: string;
  xp: number;
  coins: number;
  label: string | null;
  dayKey: string;
  createdAt: string;
}

export interface PlayerProfile {
  level: number;
  totalXp: number;
  levelStartXp: number;
  nextLevelXp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progressPct: number;
  xpToday: number;
  coins: number;
  streakDays: number;
  today: string;
  recentEvents: PlayerEvent[];
}

export interface XpHistoryDay {
  date: string;
  total: number;
  bySource: Record<string, number>;
}

export interface GamificationRules {
  task: {
    xpByPriority: Record<string, number>;
    coinsByPriority: Record<string, number>;
    dailyMissionXp: number;
    mainMissionXp: number;
    beforeDeadlineXp: number;
  };
  habit: { xp: number; coins: number };
  focus: { blockMinutes: number; xpPerBlock: number; coinsPerBlock: number; maxBlocksPerSession: number };
  project: { xp: number; coins: number };
  journal: { xp: number; coins: number };
  review: Record<"weekly" | "monthly" | "quarterly" | "annual", { xp: number; coins: number }>;
  habitStreakMilestones: Array<{ days: number; xp: number; coins: number }>;
  lifeAdmin: Record<string, { xp: number; coins: number }>;
}

export const REWARD_CATEGORIES = [
  { id: "lazer", label: "Lazer" },
  { id: "descanso", label: "Descanso" },
  { id: "comida", label: "Comida" },
  { id: "compras", label: "Compras" },
  { id: "social", label: "Social" },
  { id: "experiencia", label: "Experiência" },
  { id: "outro", label: "Outro" },
] as const;
export type RewardCategory = (typeof REWARD_CATEGORIES)[number]["id"];

export interface Reward {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  category: RewardCategory;
  cost: number;
  redemptionLimit: number | null;
  cooldownHours: number;
  isActive: boolean;
  timesRedeemed: number;
  lastRedeemedAt: string | null;
  availableAt: string | null;
  createdAt: string;
}

export interface RewardInput {
  name: string;
  description?: string | null;
  icon?: string | null;
  category?: RewardCategory;
  cost: number;
  redemptionLimit?: number | null;
  cooldownHours?: number;
  isActive?: boolean;
}

export interface Redemption {
  id: string;
  rewardId: string;
  rewardName: string;
  cost: number;
  icon: string | null;
  redeemedAt: string;
}

export const gamificationService = {
  profile: () => api.get<PlayerProfile>("/gamification/profile"),
  history: (days = 30) => api.get<{ days: XpHistoryDay[] }>(`/gamification/history?days=${days}`),
  projects: () => api.get<Record<string, { earnedXp: number; availableXp: number }>>("/gamification/projects"),
  rules: () => api.get<GamificationRules>("/gamification/rules"),
  rewards: (all = false) => api.get<Reward[]>(`/gamification/rewards${all ? "?all=1" : ""}`),
  createReward: (input: RewardInput) => api.post<Reward>("/gamification/rewards", input),
  updateReward: (id: string, input: Partial<RewardInput>) => api.patch<Reward>(`/gamification/rewards/${id}`, input),
  removeReward: (id: string) => api.delete<void>(`/gamification/rewards/${id}`),
  redeem: (id: string) => api.post<{ ok: true; redemptionId: string; balance: number; reward: Reward }>(`/gamification/rewards/${id}/redeem`),
  redemptions: () => api.get<Redemption[]>("/gamification/redemptions"),
  levels: () => api.get<{ levels: Array<{ level: number; reachedAt: string; dayKey: string; totalXp: number }> }>("/gamification/levels"),
};

/**
 * Evento global: "algo que pode render XP acabou de ser persistido".
 * O GamificationFeedback escuta, recarrega o perfil e anima só os
 * eventos novos — a animação nunca acontece antes do backend confirmar.
 */
export const GAMIFICATION_REFRESH_EVENT = "lifeos:gamification-refresh";

export function notifyGamification() {
  window.dispatchEvent(new CustomEvent(GAMIFICATION_REFRESH_EVENT));
}
