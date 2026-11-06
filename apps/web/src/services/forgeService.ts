import { api, API_URL } from "./api";

/** Espelho de /api/forge (Forja da Inteligência 3.0). */

export type Problem = "classification" | "regression";
export type Alg = "baseline" | "persistence" | "logistic" | "naive_bayes" | "knn" | "tree" | "random_forest" | "gradient_boosting" | "linear" | "ridge";
export type Primary = "balanced_accuracy" | "brier" | "log_loss" | "mae" | "rmse";
export type ModelStatus = "rascunho" | "aguardando_dados" | "treinando" | "validacao" | "experimental" | "aprovado" | "ativo" | "degradado" | "arquivado";

export interface ClassMetrics {
  accuracy: number;
  balancedAccuracy: number;
  precision: number;
  recall: number;
  f1: number;
  rocAuc: number | null;
  prAuc: number | null;
  brier: number;
  logLoss: number;
  confidence: number;
  confusion: { tp: number; fp: number; tn: number; fn: number };
  n: number;
}
export interface RegMetrics {
  mae: number;
  rmse: number;
  r2: number | null;
  n: number;
}
export type Metrics = ClassMetrics | RegMetrics;
export const isReg = (m: Metrics): m is RegMetrics => "mae" in m;

export interface ArenaEntry {
  algorithm: Alg;
  label: string;
  hp: Record<string, number>;
  cvMean: number;
  cvStd: number;
  foldScores: number[];
  cvMetrics: Metrics | null;
  trials: number;
  trainMs: number;
  isBaseline: boolean;
}
export interface VersionMetrics {
  primary: Primary;
  arena: ArenaEntry[];
  reference: Alg | null;
  champion: Alg | null;
  selected: Alg | null;
  beatsBaseline: boolean;
  holdout: { model: Metrics; baseline: Metrics; n: number } | null;
  calibration: Array<{ from: number; to: number; n: number; predicted: number | null; observed: number | null }> | null;
  residuals: { q10: number; q90: number } | null;
  leakage: string[];
  samples: { total: number; dev: number; test: number };
}
export interface Version {
  id: string;
  modelId: string;
  version: number;
  algorithm: Alg;
  algorithmLabel: string;
  hyperparams: Record<string, number>;
  metrics: VersionMetrics;
  dataset: { target: string; threshold: number | null; horizon: number; from: string | null; to: string | null; samples: number; positiveRate: number | null; yMean: number; granularity: string };
  importance: Array<{ key: string; label: string; importance: number; coefficient: number | null }>;
  status: "candidata" | "ativa" | "arquivada";
  trainedAt: string;
  durationMs: number;
  pipelineVersion: string;
  configHash: string;
  dataHash: string;
  seed: number;
}
export interface Validation {
  folds: number;
  holdoutPct: number;
  search: "grid" | "random" | "none";
  searchBudget: number;
  primary: Primary;
  margin: number;
}
export interface ModelInput {
  name: string;
  problem: Problem;
  target: string;
  horizon: number;
  features: string[];
  algorithms: Alg[];
  validation: Validation;
  schedule: "manual" | "weekly" | "monthly";
}
export interface MonitorSnapshot {
  modelId: string;
  status: "ok" | "atencao" | "degradado" | "sem_dados";
  checkedAt: string;
  drift: { features: Array<{ key: string; label: string; psi: number | null; noise: number; n: number; smoothed: boolean; level: string }>; target: { text: string; changed: boolean; n: number }; thresholds: string } | null;
  perf: { n: number; observed: number | null; expected: number | null; degraded: boolean; text: string } | null;
}
export interface ForgeModel extends ModelInput {
  id: string;
  templateKey: string | null;
  targetLabel: string;
  status: ModelStatus;
  activeVersionId: string | null;
  lastTrainedAt: string | null;
  createdAt: string;
  versions: number;
  active: Version | null;
  latest: Version | null;
  monitor: MonitorSnapshot | null;
  nextTraining: string | null;
}
export interface Run {
  id: string;
  modelId: string | null;
  kind: "train" | "backtest" | "inference" | "monitor" | "quality";
  status: "running" | "done" | "failed" | "cancelled" | "insufficient";
  trigger: string;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  result: Record<string, unknown> | null;
  log: string[];
  archived: boolean;
}
export interface Prediction {
  modelId: string;
  versionId: string;
  targetDate: string;
  value: number;
  lower: number | null;
  upper: number | null;
  partial: boolean;
  explanation: { factors: Array<{ key: string; label: string; value: number | null; effect: number }>; missing: number; version: number; horizon: number };
  actual: number | null;
}
export interface DataAnalysis {
  analyzedAt: string;
  sources: Array<{ key: string; label: string; connected: boolean; records: number; from: string | null; to: string | null; recentDays: number; duplicates: number; quality: number | null; usedAsFeature: boolean; eligible: boolean; eligibility: string; granularity: string }>;
  quality: {
    range: { from: string | null; to: string; days: number };
    scores: { completeness: number; validity: number; outlierRate: number; overall: number | null };
    series: Array<{ key: string; label: string; unit: string; kind: string; days: number; daysWithData: number; completeness: number; invalid: number; outliers: number; constant: boolean; mean: number | null; std: number | null; min: number | null; max: number | null; lastDate: string | null; staleDays: number | null; longestGap: number }>;
    balance: Array<{ target: string; label: string; samples: number; positives: number; negatives: number; threshold: number | null }>;
    alerts: Array<{ level: "alto" | "medio" | "baixo"; text: string }>;
    definitions: Record<string, string>;
  };
  bottlenecks: Array<{ key: string; label: string; current: number; previous: number; diffPct: number; n: [number, number]; text: string; action: string; basis?: "total" | "dias" | "media"; unit?: string }>;
  sample: Array<Record<string, number | string | null>>;
}
export interface ForgeOverview {
  today: string;
  indicators: { artifactsActive: number; modelsTrained: number; models: number; experiments: number; dataQuality: number | null; beatBaseline: number; predictionsToday: number; alerts: number };
  researcher: { level: number; title: string; points: number; next: { title: string; min: number } | null; pct: number; breakdown: { models: number; versions: number; beatBaseline: number; backtests: number }; rule: string };
  milestones: Array<{ code: string; title: string; description: string; done: boolean }>;
  milestoneReward: { xp: number; coins: number };
  models: ForgeModel[];
  versions: Version[];
  runs: Run[];
  predictions: Prediction[];
  monitors: MonitorSnapshot[];
  quality: DataAnalysis | null;
  templates: Array<{ key: string; name: string; icon: string; target: string; description: string; problem: Problem; created: boolean }>;
  legacyArtifacts: number;
  alerts: Array<{ level: "alto" | "medio" | "baixo"; text: string; modelId: string | null }>;
}
export interface Dictionary {
  features: Array<{ key: string; label: string; source: string; type: string; description: string }>;
  targets: Array<{ key: string; label: string; problem: Problem; description: string }>;
  algorithms: Record<Problem, Array<{ key: Alg; label: string }>>;
  leakageRule: string;
}
export type TrainResult = { status: "trained" | "identical" | "insufficient" | "skipped"; message: string; runId?: string; versionId?: string; version?: number };

export const forgeService = {
  overview: () => api.get<ForgeOverview>("/forge/overview"),
  dictionary: () => api.get<Dictionary>("/forge/dictionary"),
  analyze: () => api.post<DataAnalysis>("/forge/data/analyze", {}),
  createModel: (input: ModelInput) => api.post<ForgeModel>("/forge/models", input),
  fromTemplate: (key: string) => api.post<ForgeModel>(`/forge/templates/${key}`, {}),
  updateModel: (id: string, input: Partial<ModelInput>) => api.put<ForgeModel>(`/forge/models/${id}`, input),
  archive: (id: string, archived: boolean) => api.post<ForgeModel>(`/forge/models/${id}/archive`, { archived }),
  remove: (id: string) => api.delete<void>(`/forge/models/${id}`),
  train: (id: string) => api.post<TrainResult>(`/forge/models/${id}/train`, {}),
  backtest: (id: string) => api.post<{ status: string; result?: unknown } | null>(`/forge/models/${id}/backtest`, {}),
  monitor: (id: string) => api.post<unknown>(`/forge/models/${id}/monitor`, {}),
  activate: (id: string, vid: string) => api.post<{ ok: true }>(`/forge/models/${id}/versions/${vid}/activate`, {}),
  archiveVersion: (id: string, vid: string) => api.post<{ ok: true }>(`/forge/models/${id}/versions/${vid}/archive`, {}),
  deactivate: (id: string) => api.post<{ ok: true }>(`/forge/models/${id}/deactivate`, {}),
  refreshPredictions: () => api.post<{ resolved: number; generated: number }>("/forge/predictions/refresh", {}),
  explanationViewed: () => api.post<{ ok: true }>("/forge/explanations/viewed", {}),
  archiveRun: (id: string) => api.post<{ ok: true }>(`/forge/runs/${id}/archive`, {}),
  report: (id: string) => api.get<Record<string, unknown>>(`/forge/models/${id}/report`),
  /** Download do CSV (binário fora do wrapper JSON). */
  downloadCsv: async (id: string) => {
    const res = await fetch(`${API_URL}/forge/models/${id}/report?format=csv`, { credentials: "include" });
    if (!res.ok) throw new Error("Não foi possível exportar o relatório.");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `forja-modelo-${id}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

/* ───────── rótulos (exibição) ───────── */

export const STATUS_LABEL: Record<ModelStatus, string> = {
  rascunho: "Rascunho",
  aguardando_dados: "Aguardando dados",
  treinando: "Treinando",
  validacao: "Em validação",
  experimental: "Experimental",
  aprovado: "Aprovado",
  ativo: "Ativo",
  degradado: "Degradado",
  arquivado: "Arquivado",
};
export const STATUS_TONE: Record<ModelStatus, "muted" | "blue" | "purple" | "gold" | "green" | "red" | "orange"> = {
  rascunho: "muted",
  aguardando_dados: "orange",
  treinando: "purple",
  validacao: "blue",
  experimental: "orange",
  aprovado: "gold",
  ativo: "green",
  degradado: "red",
  arquivado: "muted",
};
export const PRIMARY_LABEL: Record<Primary, string> = { balanced_accuracy: "Acurácia balanceada", brier: "Brier (menor é melhor)", log_loss: "Log-loss (menor é melhor)", mae: "MAE (menor é melhor)", rmse: "RMSE (menor é melhor)" };
export const RUN_KIND: Record<Run["kind"], string> = { train: "Treino", backtest: "Backtest", inference: "Inferência", monitor: "Monitoramento", quality: "Qualidade dos dados" };
export const RUN_STATUS: Record<Run["status"], string> = { running: "Executando", done: "Concluído", failed: "Falhou", cancelled: "Cancelado", insufficient: "Dados insuficientes" };

export function primaryOf(m: Metrics, p: Primary): number {
  if (isReg(m)) return p === "rmse" ? m.rmse : m.mae;
  return p === "brier" ? m.brier : p === "log_loss" ? m.logLoss : m.balancedAccuracy;
}
export const fmtNum = (v: number | null | undefined, d = 3) => (v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: d }));
