import { api } from "./api";
import type { HubRank } from "./moduleHubService";

/** Espelho de /api/lab — Laboratório 2.0 (dados derivados). O Diário foi removido do LifeOS. */

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
  lab: () => api.get<LabHub>("/lab/hub"),
  setGoal: (id: string, goalId: string | null) => api.patch<{ ok: boolean }>(`/lab/experiments/${id}/goal`, { goalId }),
  explain: (id: string, question?: string) => api.post<{ ai: boolean; text: string }>(`/lab/experiments/${id}/explain`, { question }),
  exportUrl: (id: string) => `/lab/experiments/${id}/export.csv`,
};
