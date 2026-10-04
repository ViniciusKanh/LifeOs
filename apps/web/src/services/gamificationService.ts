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

/* ------------------------- Tesouro & Recompensas ------------------------- */

export const REWARD_CATEGORIES = [
  { id: "descanso", label: "Descanso" },
  { id: "diversao", label: "Diversão" },
  { id: "autocuidado", label: "Autocuidado" },
  { id: "social", label: "Social" },
  { id: "premium", label: "Premium" },
  { id: "personalizado", label: "Personalizado" },
] as const;
/** Categorias antigas da Loja continuam válidas para dados existentes. */
export type RewardCategory = (typeof REWARD_CATEGORIES)[number]["id"] | "lazer" | "comida" | "compras" | "experiencia" | "outro";
export type RewardRarity = "comum" | "incomum" | "raro" | "epico" | "lendario";
export type RewardCurrency = "coin" | "gem";
export type LimitPeriod = "none" | "day" | "week" | "month";
export const REWARD_ARTS = ["tv", "dessert", "pizza", "gamepad", "trail", "moon", "spa", "travel", "coffee", "book", "music", "gift"] as const;
export type RewardArt = (typeof REWARD_ARTS)[number];

export type AvailabilityCode = "available" | "inactive" | "sold_out" | "cooldown" | "period_limit" | "level" | "xp" | "achievement" | "insufficient";
export interface RewardAvailability {
  available: boolean;
  code: AvailabilityCode;
  reason: string | null;
  nextAvailableAt: string | null;
  missingCoins: number;
  missingGems: number;
  missingLevel: number;
  missingXp: number;
}

export interface Reward {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  category: RewardCategory;
  rarity: RewardRarity;
  currency: RewardCurrency;
  cost: number;
  requiredLevel: number | null;
  requiredXp: number | null;
  requiredAchievementId: string | null;
  redemptionLimit: number | null;
  cooldownHours: number;
  limitPeriod: LimitPeriod;
  tags: string[];
  art: RewardArt | null;
  isFavorite: boolean;
  isAiGenerated: boolean;
  isActive: boolean;
  timesRedeemed: number;
  lastRedeemedAt: string | null;
  availableAt: string | null;
  createdAt: string;
  /** Estado calculado no servidor (nunca no cliente). */
  availability: RewardAvailability;
}

export interface RewardInput {
  name: string;
  description?: string | null;
  icon?: string | null;
  category?: RewardCategory;
  rarity?: RewardRarity;
  currency?: RewardCurrency;
  cost: number;
  requiredLevel?: number | null;
  requiredXp?: number | null;
  requiredAchievementId?: string | null;
  redemptionLimit?: number | null;
  cooldownHours?: number;
  limitPeriod?: LimitPeriod;
  tags?: string[];
  art?: RewardArt | null;
  isFavorite?: boolean;
  isAiGenerated?: boolean;
  isActive?: boolean;
}

export type RedemptionStatus = "available" | "used" | "canceled" | "expired";
export interface Redemption {
  id: string;
  rewardId: string;
  rewardName: string;
  cost: number;
  currency: RewardCurrency;
  status: RedemptionStatus;
  icon: string | null;
  art: string | null;
  rarity: string | null;
  redeemedAt: string;
  usedAt: string | null;
  canceledAt: string | null;
}

export interface InventoryItem {
  rewardId: string;
  name: string;
  icon: string | null;
  art: string | null;
  rarity: string | null;
  quantity: number;
  nextRedemptionId: string;
  lastRedeemedAt: string;
}

export interface RareGoal {
  id: string;
  kind: "level" | "xp" | "achievement" | "campaign";
  title: string;
  current: number;
  target: number;
  unlocks: string;
  rarity: string | null;
}

export interface TreasureSummary {
  totalXp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progressPct: number;
  coins: number;
  gems: number;
  gemsEarned: number;
  streak: { days: number; bonusPct: number; campaignTitle: string | null };
  availableCount: number;
  wallet: { earned30: number; spent30: number; earned: number; spent: number };
}

export interface TreasureData {
  summary: TreasureSummary;
  rewards: Reward[];
  inventory: InventoryItem[];
  history: Redemption[];
  goals: RareGoal[];
  config: { cost: Record<RewardCurrency, { min: number; max: number }>; priceBands: Record<"pequena" | "media" | "grande" | "premium", [number, number]> };
}

export interface RedeemResponse {
  ok: true;
  redemptionId: string;
  balance: number;
  gems: number;
  reward: Reward;
  replayed: boolean;
}

export type AICategory = "descanso" | "diversao" | "autocuidado" | "social" | "premium" | "personalizado";
export interface SuggestInput {
  mode: "quick" | "custom";
  freeTime?: string;
  wishes?: string;
  leisureTime?: string;
  categories?: AICategory[];
}
export interface RewardSuggestion {
  name: string;
  description: string | null;
  category: AICategory;
  rarity: RewardRarity;
  cost: number;
  currency: "coin";
  limitPeriod: LimitPeriod;
  reason: string | null;
  art: RewardArt;
  similarTo: string | null;
}
export interface SuggestResult {
  basedOn: { level: number; balance: number; coinsLast30Days: number; avgCoinsPerDay: number; existingCount: number };
  suggestions: RewardSuggestion[];
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
  /** `requestId` torna o resgate idempotente (clique duplo/refresh não gasta duas vezes). */
  redeem: (id: string, requestId?: string) => api.post<RedeemResponse>(`/gamification/rewards/${id}/redeem`, { requestId }),
  redemptions: (status?: RedemptionStatus, limit = 30) => api.get<Redemption[]>(`/gamification/redemptions?limit=${limit}${status ? `&status=${status}` : ""}`),
  treasure: () => api.get<TreasureData>("/gamification/treasure"),
  inventory: () => api.get<InventoryItem[]>("/gamification/inventory"),
  useRedemption: (id: string) => api.post<{ ok: true }>(`/gamification/redemptions/${id}/use`),
  cancelRedemption: (id: string) => api.post<{ ok: true; balance: number; gems: number }>(`/gamification/redemptions/${id}/cancel`),
  createRewardsBatch: (rewards: RewardInput[]) => api.post<{ created: number; skipped: string[] }>("/gamification/rewards/batch", { rewards }),
  settings: () => api.get<XpSettings>("/gamification/settings"),
  saveSettings: (input: Partial<XpSettings>) => api.put<XpSettings>("/gamification/settings", input),
  wallet: () => api.get<WalletSummary>("/gamification/wallet"),
  starterRewards: () => api.post<{ created: number }>("/gamification/rewards/starter"),
  suggestRewards: (input: SuggestInput) => api.post<SuggestResult>("/gamification/rewards/ai/suggest", input),
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
