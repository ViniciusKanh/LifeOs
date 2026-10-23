import { api } from "./api";
import type { ArtifactIcon, ProphecyFactor } from "./intelligenceService";

/** Espelho de /api/tavern — o balanço e a profecia são calculados no servidor; a UI só apresenta. */

/** Valor de hoje + média diária dos 7 dias anteriores (null quando a janela não tem registro). */
export interface TavernMetric {
  today: number;
  avg7: number | null;
}

export interface TavernBalance {
  xp: TavernMetric;
  coins: TavernMetric;
  missions: { count: number; avg7: number | null; items: Array<{ id: string; title: string; priority: string }> };
  habits: { done: number; total: number; avg7: number | null; items: Array<{ id: string; name: string; icon: string | null }> };
  water: { todayMl: number; avg7: number | null };
  exercise: { todayMinutes: number; sessions: number; avg7: number | null };
  sleep: { durationMinutes: number | null; quality: number | null } | null;
  achievements: Array<{ id: string; title: string; icon: string | null; unlockedAt: string; custom: boolean }>;
  mainMission: { id: string; title: string; done: boolean } | null;
}

export interface TomorrowProphecy {
  artifactId: string;
  artifactName: string;
  icon: ArtifactIcon;
  targetLabel: string;
  targetDate: string;
  confidence: number;
  status: "production" | "experimental";
  probability: number | null;
  factors: ProphecyFactor[];
  /** Runas sem registro na véspera (hoje) — o modelo as trata como ausentes. */
  missing: Array<{ key: string; label: string }>;
  reason: string | null;
}

export interface TavernMissionCandidate {
  id: string;
  title: string;
  priority: string;
  dueDate: string | null;
  projectName: string | null;
  reasons: string[];
}

export interface TavernSummary {
  today: string;
  tomorrow: string;
  timezone: string;
  balance: TavernBalance;
  prophecy: { prophecies: TomorrowProphecy[] };
  mission: {
    primary: TavernMissionCandidate | null;
    alternatives: TavernMissionCandidate[];
    dueTomorrow: Array<{ id: string; title: string; priority: string }>;
    pinned: Array<{ id: string; title: string; done: boolean }>;
  };
}

export interface TavernPinResult {
  date: string;
  focusTaskIds: string[];
  task: { id: string; title: string };
  dueDateChanged: boolean;
}

export const tavernService = {
  summary: () => api.get<TavernSummary>("/tavern/summary"),
  pinTomorrow: (taskId: string, setDueTomorrow: boolean) => api.post<TavernPinResult>("/tavern/pin-tomorrow", { taskId, setDueTomorrow }),
};
