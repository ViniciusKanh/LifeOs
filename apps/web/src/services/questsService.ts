import { api } from "./api";

/** Espelho de /api/quests — sorteio, progresso e temporada são calculados no servidor. */

export type QuestPeriod = "daily" | "weekly";
export type QuestModule = "missions" | "projects" | "health" | "library" | "habits" | "journal" | "focus" | "xp";

export interface Quest {
  id: string;
  period: QuestPeriod;
  periodKey: string;
  templateKey: string;
  title: string;
  module: QuestModule;
  unit: string | null;
  target: number;
  progress: number;
  xpReward: number;
  completed: boolean;
  claimed: boolean;
  claimedAt: string | null;
  canReroll: boolean;
}

export interface SeasonTierView {
  tier: number;
  xp: number;
  reward: string;
  rarity: string;
  unlocked: boolean;
  unlockedAt: string | null;
}

export interface SeasonSummary {
  seasonKey: string;
  name: string;
  xp: number;
  tier: number;
  questsCompleted: number;
  closedAt: string;
}

export interface Season {
  seasonKey: string;
  name: string;
  motto: string;
  from: string;
  to: string;
  daysLeft: number;
  xp: number;
  tier: number;
  maxTier: number;
  nextTier: { tier: number; xp: number; missing: number; reward: string } | null;
  tiers: SeasonTierView[];
  questsCompleted: number;
  previous: SeasonSummary | null;
}

export interface QuestBoard {
  today: string;
  timezone: string;
  daily: {
    periodKey: string;
    quests: Quest[];
    rerollsLeft: number;
    bonus: { xp: number; claimed: boolean; completed: number; total: number };
  };
  weekly: { periodKey: string; to: string; daysLeft: number; quests: Quest[] };
  season: Season;
}

export interface ClaimResult {
  questId: string;
  xp: number;
  bonusXp: number;
  replayed: boolean;
}

export const questsService = {
  board: () => api.get<QuestBoard>("/quests"),
  claim: (id: string) => api.post<ClaimResult>(`/quests/${encodeURIComponent(id)}/claim`),
  reroll: (id: string) => api.post<{ quest: Quest }>(`/quests/${encodeURIComponent(id)}/reroll`),
};
