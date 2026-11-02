import { api } from "./api";
import type { Achievement } from "@/types";

/** Espelho de /api/hero — Perfil do Herói 3.0 e Crônica 2.0 (dados derivados dos ledgers oficiais). */

export type HeroRarity = "comum" | "incomum" | "rara" | "epica" | "lendaria" | "mitica";
export type HeroAchievementState = "bloqueada" | "nao_iniciada" | "em_progresso" | "desbloqueada" | "resgatada";
export type ChainStage = "Fundamentos" | "Consistência" | "Disciplina" | "Maestria";

export interface HeroAchievement extends Achievement {
  rarity: HeroRarity;
  state: HeroAchievementState;
  chain: { metric: string; stage: ChainStage; index: number; length: number } | null;
  info: { events: string; module: string; link: string; scope: string };
  remaining: number;
  paidAt: string | null;
}

export interface AchievementsHub {
  mastery: {
    total: number;
    unlocked: number;
    inProgress: number;
    notStarted: number;
    locked: number;
    pct: number;
    xp: number;
    coins: number;
    byRarity: Array<{ rarity: HeroRarity; total: number; unlocked: number }>;
    streak: { current: number; best: number };
  };
  rarityRules: Array<{ rarity: HeroRarity; label: string; rule: string }>;
  achievements: HeroAchievement[];
  chains: Array<{
    metric: string;
    module: string;
    link: string;
    category?: string;
    currentValue: number;
    done: number;
    total: number;
    pct: number;
    next: string | null;
    links: Array<{ id: string; title: string; threshold: number | null; stage: ChainStage; state: HeroAchievementState; rarity: HeroRarity }>;
  }>;
  titles: Array<{ id: string; name: string; description: string; rarity: string; unlocked: boolean; unlockedAt: string | null; equipped: boolean; progress: number }>;
  season: {
    name: string;
    motto: string;
    from: string;
    to: string;
    daysLeft: number;
    xp: number;
    tier: number;
    maxTier: number;
    nextTier: { tier: number; xp: number; missing: number; reward: string } | null;
    tiers: Array<{ tier: number; xp: number; reward: string; rarity: string; unlocked: boolean; unlockedAt: string | null }>;
  };
}

export type GoalKind = "reward" | "title" | "relic" | "set";
export interface RewardGoal {
  id: string;
  kind: GoalKind;
  targetId: string;
  createdAt: string;
  title: string;
  current: number;
  target: number;
  unit: string;
  reached: boolean;
  eta: number | null;
  missingText: string;
  link: string;
}
export interface TreasureHub {
  indicators: { coins: number; gems: number; totalXp: number; available: number; redemptions: number; redeemStreakWeeks: number; earned30: number; spent30: number };
  goals: RewardGoal[];
  economy: Array<{ week: string; earned: number; spent: number }>;
  sources: Array<{ source: string; earned: number; spent: number }>;
  tips: Array<{ kind: "dado" | "inferencia" | "sugestao"; text: string; rewardId?: string }>;
  goalOptions: {
    rewards: Array<{ id: string; name: string; cost: number; currency: string }>;
    titles: Array<{ id: string; name: string }>;
    relics: Array<{ id: string; name: string }>;
    sets: Array<{ id: string; name: string }>;
  };
}

export interface BuildSnapshot {
  id: string;
  periodKey: string;
  origin: "auto" | "manual";
  archetypeId: string | null;
  archetypeName: string | null;
  affinity: number | null;
  scores: Record<string, number>;
  createdAt: string;
}
export interface BuildSnapshots {
  snapshots: BuildSnapshot[];
  changes: Array<{ from: string | null; to: string; at: string; snapshotId: string }>;
}

export interface JourneySummary {
  from: string;
  to: string;
  xp: number;
  activities: number;
  activeDays: number;
  top: Array<{ source: string; label: string; xp: number; count: number }>;
}
export interface JourneyHub {
  from: string;
  to: string;
  today: string;
  indicators: {
    xp: number;
    activities: number;
    coinsEarned: number;
    coinsSpent: number;
    balance: number;
    achievements: number;
    missions: number;
    quests: number;
    levelUps: number;
    consistencyPct: number;
    activeDays: number;
    spanDays: number;
    weekDeltaPct: number | null;
    level: number;
    totalXp: number;
  };
  weekly: Array<{ week: string; xp: number; activities: number }>;
  summaries: Record<"day" | "week" | "month" | "year" | "period", JourneySummary>;
  levels: Array<{ level: number; reachedAt: string; dayKey: string; totalXp: number }>;
  marks: Array<{ eventKey: string; label: string; at: string; createdAt: string }>;
  moments: Array<{ id: string; dataUri: string; caption: string | null; date: string }>;
}
export interface MomentCandidate {
  id: string;
  dataUri: string;
  caption: string | null;
  date: string;
  authorized: boolean;
}
export type NarratorMode = "rpg" | "objetivo" | "analitico";
export interface Narration {
  ai: boolean;
  mode: NarratorMode;
  paragraphs: string[];
  facts: string[];
  insufficient: boolean;
  from: string;
  to: string;
  disclaimer: string;
}

export const heroService = {
  achievements: () => api.get<AchievementsHub>("/hero/achievements"),
  treasure: () => api.get<TreasureHub>("/hero/treasure"),
  addGoal: (kind: GoalKind, targetId: string) => api.post<{ ok: true }>("/hero/treasure/goals", { kind, targetId }),
  removeGoal: (id: string) => api.delete<{ ok: true }>(`/hero/treasure/goals/${id}`),
  snapshots: () => api.get<BuildSnapshots>("/hero/build/snapshots"),
  recordSnapshot: () => api.post<{ created: boolean; periodKey: string; archetype: string }>("/hero/build/snapshots", {}),
  journey: (from: string, to: string) => api.get<JourneyHub>(`/hero/journey?from=${from}&to=${to}`),
  toggleMark: (input: { eventKey: string; label: string; at: string }) => api.post<{ favorite: boolean }>("/hero/journey/marks/toggle", input),
  momentCandidates: () => api.get<MomentCandidate[]>("/hero/journey/moments/candidates"),
  setMoment: (mediaId: string, authorized: boolean) => api.put<{ ok: true }>(`/hero/journey/moments/${mediaId}`, { authorized }),
  narrate: (input: { from: string; to: string; mode: NarratorMode; useAi: boolean }) => api.post<Narration>("/hero/journey/narrate", input),
};
