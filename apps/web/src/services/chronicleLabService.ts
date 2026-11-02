import { api } from "./api";
import type { HubMission, HubRank } from "./moduleHubService";

/** Espelho de /api/chronicle e /api/lab — Diário 2.0 e Laboratório 2.0 (dados derivados). */

export type DayState = "none" | "started" | "done";

export interface ChronicleEntry {
  id: string;
  date: string;
  title: string;
  excerpt: string;
  words: number;
  gratitude: string[];
  nightTakeaway: string | null;
  nightMood: number | null;
  focusTasks: number;
  favorite: boolean;
  tags: string[];
  categories: string[];
  location: string | null;
  media: number;
  links: Array<{ type: string; id: string }>;
  state: DayState;
}

export interface ChronicleHub {
  today: string;
  timezone: string;
  rank: HubRank & { points: number };
  rankBreakdown: { days: number; closedDays: number; gratitudes: number; retros: number };
  indicators: {
    streak: number;
    bestStreak: number;
    entries: number;
    words: number;
    daysWritten: number;
    gratitudes: number;
    reflectionsClosed: number;
    experimentsLinked: number;
    favorites: number;
  };
  heatmap: Array<{ date: string; state: DayState }>;
  ritual: Array<{ key: string; title: string; done: boolean }>;
  timeline: ChronicleEntry[];
  insights: {
    themes: Array<{ label: string; count: number }>;
    moodDistribution: Array<{ mood: number; count: number }>;
    writingByWeekday: Array<{ label: string; count: number }>;
    last30: number;
    prev30: number;
    learnings: Array<{ date: string; text: string }>;
  };
  retrospectives: Array<{ weekStart: string; content: string; source: string; savedAt: string | null }>;
  journals: Array<{ id: string; name: string; entries: number }>;
  activeExperiments: Array<{ id: string; title: string; emoji: string | null; status: string }>;
  missions: HubMission[];
}

export interface DayContext {
  date: string;
  habits: { done: number; total: number };
  tasksDone: number;
  workouts: { count: number; minutes: number };
  waterMl: number;
  sleepMinutes: number | null;
  mood: { mood: number; energy: number } | null;
  pages: number;
}

export type CycleStage = "ideia" | "hipotese" | "planejamento" | "execucao" | "coleta" | "analise" | "conclusao";
export type DiscoveryVerdict = "apoiada" | "nao_apoiada" | "inconclusiva" | "interrompida";

export interface LabExperiment {
  id: string;
  title: string;
  emoji: string | null;
  category: string;
  hypothesis: string | null;
  motivation: string | null;
  status: string;
  startDate: string;
  endDate: string;
  primaryMetric: string;
  successCriteria: string;
  goalId: string | null;
  conclusion: string | null;
  perceivedResult: string | null;
  worthContinuing: string | null;
  totalDays: number;
  elapsedDays: number;
  loggedDays: number;
  doneDays: number;
  lastLog: string | null;
  adherencePct: number | null;
  missingDays: number;
  stage: CycleStage;
  verdict: DiscoveryVerdict | null;
  nextAction: string;
}

export interface LabHub {
  today: string;
  rank: HubRank & { points: number };
  rankBreakdown: { logDays: number; hypotheses: number; documented: number; stoppedDocumented: number };
  indicators: {
    active: number;
    completed: number;
    inAnalysis: number;
    paused: number;
    hypotheses: number;
    discoveries: number;
    xp: number;
    consistencyPct: number | null;
    successRatePct: number | null;
    successRateBase: number;
  };
  featured: LabExperiment | null;
  experiments: LabExperiment[];
  discoveries: Array<{ id: string; title: string; emoji: string | null; verdict: DiscoveryVerdict; conclusion: string | null; endDate: string; worthContinuing: string | null }>;
  protocolChanges: Array<{ experimentId: string; field: string; oldValue: string | null; newValue: string | null; afterStart: boolean; createdAt: string }>;
}

export const chronicleLabService = {
  chronicle: () => api.get<ChronicleHub>("/chronicle/hub"),
  dayContext: (date: string) => api.get<DayContext>(`/chronicle/context/${date}`),
  generateRetro: (weekStart: string, useAi: boolean) => api.post<{ weekStart: string; content: string; source: string; saved: boolean }>("/chronicle/retro/generate", { weekStart, useAi }),
  saveRetro: (weekStart: string, content: string) => api.put<{ ok: boolean }>(`/chronicle/retro/${weekStart}`, { content }),
  deleteRetro: (weekStart: string) => api.delete<void>(`/chronicle/retro/${weekStart}`),
  sendNote: (date: string, experimentId: string, text: string) => api.post<{ duplicated: boolean }>(`/chronicle/${date}/experiment-note`, { experimentId, text }),
  lab: () => api.get<LabHub>("/lab/hub"),
  setGoal: (id: string, goalId: string | null) => api.patch<{ ok: boolean }>(`/lab/experiments/${id}/goal`, { goalId }),
  explain: (id: string, question?: string) => api.post<{ ai: boolean; text: string }>(`/lab/experiments/${id}/explain`, { question }),
  exportUrl: (id: string) => `/lab/experiments/${id}/export.csv`,
};
