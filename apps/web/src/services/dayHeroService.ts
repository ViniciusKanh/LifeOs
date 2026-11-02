import { api } from "./api";

/** Espelho de /api/today-hub e /api/hero-dashboard (dados derivados das fontes oficiais). */

export type RitualKind = "manual" | "planning" | "task" | "habit" | "focus" | "health" | "study" | "journal";
export type TimerMode = "pomodoro" | "free" | "block";
export type TimerLink = "task" | "subject" | "deck" | "project" | null;

export interface TimerState {
  entryId: string;
  mode: TimerMode;
  plannedMinutes: number | null;
  startedAt: string;
  pausedAt: string | null;
  pausedMs: number;
  linkType: TimerLink;
  linkId: string | null;
  linkLabel: string | null;
}
export interface TodayMission {
  id: string;
  title: string;
  priority: string;
  status: string;
  dueDate: string | null;
  overdue: boolean;
  projectName: string | null;
  estimateMinutes: number | null;
  spentMinutes: number;
  subtasks: { done: number; total: number };
  isMain: boolean;
  reward: { xp: number; coins: number };
}
export interface TodayHub {
  today: string;
  timezone: string;
  profile: { level: number; totalXp: number; progressPct: number; xpToday: number; coins: number; coinsToday: number; streakDays: number; xpAvg7: number };
  lifeScore: { overall: number; delta: number | null; dims: Record<"productivity" | "health" | "habits" | "goals" | "reading" | "education" | "professional", number> };
  indicators: { prioritiesDone: number; prioritiesTotal: number; focusMinutes: number; focusSessions: number; missionsDone: number };
  main: (TodayMission & { subtaskList: Array<{ id: string; title: string; done: boolean }>; manual: boolean }) | null;
  missions: TodayMission[];
  habits: { items: Array<{ id: string; name: string; icon: string | null; done: boolean; count: number; target: number; unit: string | null; streak: number; frequency: string }>; done: number; total: number };
  agenda: Array<{ id: string; title: string; startsAt: string; endsAt: string | null; allDay: boolean; sourceType: string; sourceId: string | null; link: string | null; category: string | null; blockTaskId: string | null }>;
  conflicts: Array<{ a: string; b: string; minutes: number }>;
  signals: { sleep: { minutes: number; quality: number | null } | null; mood: { mood: number | null; energy: number | null } | null; workoutMinutes: number; workouts: number; waterMl: number; readingPages: number };
  timer: TimerState | null;
  ritual: { steps: Array<{ id: string; label: string; kind: RitualKind; refId: string | null; position: number; auto: boolean; done: boolean }>; custom: boolean; done: number; total: number; history: Array<{ day: string; checks: number }> };
  rewards: { nextHabit: { habitId: string; habitName: string; days: number; missing: number; xp: number; coins: number } | null; quests: { done: number; total: number; bonusXp: number; bonusClaimed: boolean; claimable: number } | null; achievementsToday: Array<{ title: string; tier: string }> };
  nextAction: { kind: string; text: string; targetId: string | null };
  focusBlocks: Array<{ start: string; end: string }>;
}

type Dim = "productivity" | "health" | "habits" | "goals" | "reading" | "education" | "professional";
export interface HeroDashboard {
  today: string;
  period: { key: string; from: string; to: string; span: number };
  hero: {
    name: string;
    avatarUrl: string | null;
    level: number;
    totalXp: number;
    xpIntoLevel: number;
    xpForNextLevel: number;
    progressPct: number;
    nextLevelAt: number;
    title: { id: string; name: string } | null;
    archetype: { id: string; name: string; avatar: string; affinity: number; tags: string[]; description: string; secondary: { id: string; name: string; affinity: number } | null } | null;
    buildReady: boolean;
  };
  status: { xpToday: number; coins: number; gems: number; achievements: { unlocked: number; total: number }; habitsActive: number; missionsOpen: number; lifeScore: number; streakDays: number };
  attributes: Array<{ key: Dim; label: string; value: number; periodAvg: number | null; previousAvg: number | null; delta: number | null; source: string; series: Array<{ day: string; value: number | null }> }>;
  radar: { current: Record<Dim, number | null>; previous: Record<Dim, number | null>; today: Record<Dim, number>; snapshots: number };
  featured: { id: string; title: string; dueDate: string | null; priority: string; status: string; score: number; reasons: string[] } | null;
  nextEvolutions: Array<{ key: string; title: string; current: number; target: number; unit: string; link: string }>;
  journey: { milestones: Array<{ id: string; name: string; rarity: string; minLevel: number; description: string; unlocked: boolean; current: boolean }>; next: { name: string; minLevel: number } | null };
  campaigns: Array<{ id: string; title: string; lifeArea: string | null; priority: string; endDate: string | null; pct: number; missions: number; missionsDone: number; nextMilestone: string | null; icon: string | null }>;
  recentAchievements: Array<{ id: string; title: string; tier: string; unlockedAt: string | null; reward?: { xp: number; coins: number }; icon: string | null }>;
  treasure: { coins: number; gems: number; available: number; recentItems: Array<{ key: string; name: string; rarity: string; art: string; artSet: "items" | "rewards" | "codex"; at: string }>; equipped: { title: string | null; frame: string; emblem: string | null }; titlesUnlocked: number; relics: number };
  evolution: { timeline: Array<{ day: string; xp: number; missions: number; lifeScore: number | null }>; totals: { xp: number; missions: number; activeDays: number; consistencyPct: number; achievements: number; goals: number }; lifeScoreSnapshots: number };
  tree: Array<{ key: string; label: string; description: string; score: number; xpTotal: number; attrLevel: number; sources: string; recommendation: string; habits: string[]; nodes: Array<{ id: string; title: string; unlocked: boolean; progress: number; requirement: string }>; done: number }>;
}

export const dayHeroService = {
  today: () => {
    const d = new Date();
    return api.get<TodayHub>(`/today-hub?now=${d.getHours() * 60 + d.getMinutes()}`);
  },
  setMain: (taskId: string | null) => api.post<{ ok: true }>("/today-hub/main", { taskId }),
  saveRitual: (steps: Array<{ id?: string; label: string; kind: RitualKind; refId?: string | null }>) => api.put<{ ok: true }>("/today-hub/ritual", { steps }),
  toggleRitual: (id: string, done: boolean) => api.post<{ ok: true }>(`/today-hub/ritual/${id}/toggle`, { done }),
  startTimer: (input: { mode: TimerMode; plannedMinutes?: number | null; linkType?: TimerLink; linkId?: string | null }) => api.post<TimerState>("/today-hub/timer/start", input),
  pauseTimer: (pause: boolean) => api.post<TimerState>("/today-hub/timer/pause", { pause }),
  stopTimer: () => api.post<{ minutes: number; entryId: string }>("/today-hub/timer/stop", {}),
  closeDraft: () => api.get<{ text: string }>("/today-hub/close"),
  closeSave: (text: string) => api.post<{ ok: true }>("/today-hub/close", { text }),
  hero: (period: string, range?: { from: string; to: string }) => api.get<HeroDashboard>(`/hero-dashboard?period=${period}${range ? `&from=${range.from}&to=${range.to}` : ""}`),
};
