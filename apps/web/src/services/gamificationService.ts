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
    priorityLimits?: { xp: number; coins: number };
  };
  habit: { xp: number; coins: number };
  focus: { blockMinutes: number; xpPerBlock: number; coinsPerBlock: number; maxBlocksPerSession: number };
  project: { xp: number; coins: number };
  journal: { xp: number; coins: number };
  review: Record<"weekly" | "monthly" | "quarterly" | "annual", { xp: number; coins: number }>;
  habitStreakMilestones: Array<{ days: number; xp: number; coins: number }>;
  lifeAdmin: Record<string, { xp: number; coins: number }>;
  achievementByTier?: Record<string, { xp: number; coins: number }>;
  difficulty: { defaults: DifficultyRewards; limits: { taskXp: number; taskCoins: number; contractXp: number; contractCoins: number } };
  contract: { minTasks: number; maxRewardedPerDay: number };
  experiment: {
    started: { xp: number; coins: number };
    checkin: { xp: number; coins: number };
    concluded: { xp: number; coins: number };
    concludeMinDays: number;
    concludeMinLogs: number;
    concludeMinConclusionChars: number;
  };
}

export type DifficultyKey = "facil" | "medio" | "dificil" | "epico";
export type DifficultyRewards = Record<DifficultyKey, { taskXp: number; taskCoins: number; contractXp: number; contractCoins: number }>;

export const DIFFICULTIES: Array<{ id: DifficultyKey; label: string; tone: "green" | "blue" | "orange" | "purple" }> = [
  { id: "facil", label: "Fácil", tone: "green" },
  { id: "medio", label: "Médio", tone: "blue" },
  { id: "dificil", label: "Difícil", tone: "orange" },
  { id: "epico", label: "Épico", tone: "purple" },
];

export type PriorityKey = "Baixa" | "Média" | "Alta";
/** Valor de cada prioridade definido pelo próprio usuário (tarefas sem dificuldade). */
export type PriorityRewards = Record<PriorityKey, { xp: number; coins: number }>;
export const PRIORITIES: Array<{ id: PriorityKey; tone: "green" | "orange" | "red" }> = [
  { id: "Baixa", tone: "green" },
  { id: "Média", tone: "orange" },
  { id: "Alta", tone: "red" },
];

export interface XpSettings {
  difficulty: DifficultyRewards;
  priority: PriorityRewards;
}

export interface WalletSummary {
  balance: number;
  earned: number;
  spent: number;
  earned30: number;
  spent30: number;
}

export const difficultyLabel = (d: string | null | undefined) => DIFFICULTIES.find((x) => x.id === d)?.label ?? null;

export interface RewardSuggestion {
  name: string;
  description: string | null;
  icon: string | null;
  category: RewardCategory;
  cost: number;
  cooldownHours: number;
  rationale: string | null;
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
  settings: () => api.get<XpSettings>("/gamification/settings"),
  saveSettings: (input: Partial<XpSettings>) => api.put<XpSettings>("/gamification/settings", input),
  wallet: () => api.get<WalletSummary>("/gamification/wallet"),
  starterRewards: () => api.post<{ created: number }>("/gamification/rewards/starter"),
  suggestRewards: (wish?: string) =>
    api.post<{ basedOn: { balance: number; coinsLast30Days: number; avgCoinsPerDay: number }; suggestions: RewardSuggestion[] }>("/gamification/rewards/ai/suggest", { wish }),
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
