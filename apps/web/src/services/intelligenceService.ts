import { api } from "./api";

/** Espelho de /api/intelligence — treino, arena e profecias rodam no servidor; a UI só apresenta. */
export type AlgorithmId = "baseline" | "logistic" | "naive_bayes" | "knn" | "tree";
export type ObjectiveKey = "productivity" | "habits" | "focus" | "energy" | "study";
export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type ArtifactIcon = "sun" | "leaf" | "flame" | "bolt" | "book";

export interface ClassMetrics {
  accuracy: number;
  balancedAccuracy: number;
  precision: number;
  recall: number;
  f1: number;
  rocAuc: number | null;
  brier: number;
  confidence: number;
  confusion: { tp: number; fp: number; tn: number; fn: number };
  n: number;
}
export interface ArtifactMetrics extends ClassMetrics {
  cvMean: number;
  cvStd: number;
  folds: number;
}

export interface ArtifactSummary {
  id: string;
  objective: ObjectiveKey;
  name: string;
  description: string;
  targetLabel: string;
  icon: ArtifactIcon;
  algorithm: AlgorithmId;
  algorithmLabel: string;
  status: "production" | "experimental";
  xp: number;
  level: number;
  levelStartXp: number;
  nextLevelXp: number;
  rarity: Rarity;
  score: number;
  metrics: ArtifactMetrics;
  samples: number;
  trainings: number;
  trainedAt: string;
  daysSinceTraining: number;
}

export interface Importance {
  key: string;
  label: string;
  source: string;
  importance: number;
  direction: "positive" | "negative" | "neutral";
}

export interface ArenaResult {
  algorithm: AlgorithmId;
  label: string;
  metrics: ClassMetrics;
  cvMean: number;
  cvStd: number;
  folds: number;
}
export interface Experiment {
  id: string;
  artifactId: string | null;
  objective: ObjectiveKey;
  objectiveLabel: string;
  winner: AlgorithmId | null;
  samples: number;
  results: ArenaResult[];
  createdAt: string;
}

export interface Readiness {
  objective: ObjectiveKey;
  samples: number;
  positives: number;
  negatives: number;
  ready: boolean;
  reason: string | null;
  thresholdText: string;
}

export interface Grimoire {
  rangeFrom: string | null;
  rangeTo: string;
  records: number;
  features: number;
  daysObserved: number;
  sources: Array<{ key: string; label: string; records: number; pct: number }>;
  qualityScore: number | null;
  missingRate: number | null;
  outlierRate: number | null;
  areas: Array<{ key: string; label: string; days: number; active: boolean }>;
  corePower: number;
  readiness: Readiness[];
  featureCoverage: Array<{ key: string; label: string; coverage: number }>;
  updatedAt: string;
}

export interface CoreAlert {
  type: "drift" | "reforge" | "experimental" | "opportunity";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  artifactId: string;
}

export interface ProphecyFactor {
  key: string;
  label: string;
  /** Efeito na probabilidade, em pontos percentuais. */
  effect: number;
  value: number | null;
}
export interface Prophecy {
  artifactId: string;
  artifactName: string;
  targetLabel: string;
  targetDate: string;
  confidence: number;
  status: "production" | "experimental";
  probability: number | null;
  factors: ProphecyFactor[];
  reason?: string;
}

export interface IntelligenceOverview {
  today: string;
  summary: { artifactsActive: number; artifactsTotal: number; experiments: number; avgAccuracy: number | null; corePower: number | null };
  core: { totalXp: number; level: number; levelStartXp: number; nextLevelXp: number; areas: Grimoire["areas"] };
  artifacts: ArtifactSummary[];
  objectives: Array<{ key: ObjectiveKey; name: string; description: string; targetLabel: string; icon: ArtifactIcon; forged: boolean }>;
  arena: Experiment | null;
  grimoire: Grimoire | null;
  runes: { artifactId: string; artifactName: string; items: Importance[] } | null;
  alerts: CoreAlert[];
  prophecy: Prophecy | null;
}

export interface ArtifactDetail extends ArtifactSummary {
  importance: Importance[];
  insights: {
    drift: { detected: boolean; text: string | null };
    opportunities: Array<{ feature: string; label: string; coverage: number }>;
    threshold: string;
    baselineCv: number;
  };
  experiments: Experiment[];
  predictions: { total: number; resolved: number; correct: number };
}

export interface ForgeResult {
  artifact: ArtifactSummary;
  xpGain: number;
  confirmed: number;
  experiment: Omit<Experiment, "artifactId" | "objectiveLabel" | "createdAt">;
}

export const intelligenceService = {
  overview: () => api.get<IntelligenceOverview>("/intelligence/overview"),
  experiments: () => api.get<Experiment[]>("/intelligence/experiments"),
  artifact: (id: string) => api.get<ArtifactDetail>(`/intelligence/artifacts/${encodeURIComponent(id)}`),
  refreshGrimoire: () => api.post<Grimoire>("/intelligence/grimoire/refresh"),
  forge: (objective: ObjectiveKey) => api.post<ForgeResult>("/intelligence/forge", { objective }),
};
