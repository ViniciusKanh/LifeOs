import { api } from "./api";
import type {
  Experiment,
  ExperimentListItem,
  ExperimentDetail,
  ExperimentSummary,
  ExperimentInsightStat,
  ExperimentMetricInfo,
  ExperimentAISuggestion,
  CreateExperimentInput,
  UpdateExperimentInput,
  ExperimentStatus,
  ExperimentCheckinStatus,
  ExperimentPerception,
  ExperimentLog,
  ExperimentWorthContinuing,
  ExperimentPerceivedResult,
  ExperimentAnalysis,
  ExperimentBaselinePreview,
  ExperimentProposal,
  ExperimentInsightReport,
  ExperimentLogProposal,
  ExperimentTailoring,
  ExperimentTailorDraft,
} from "@/types";

export interface VerificationRuleInfo {
  key: string;
  label: string;
  configLabel: string;
  configUnit: string;
  metric: string;
}

export const experimentService = {
  aiTailor: (draft: ExperimentTailorDraft) => api.post<ExperimentTailoring>("/experiments/ai/tailor", draft),
  aiDesign: (goal: string, constraints?: string | null) => api.post<{ proposals: ExperimentProposal[] }>("/experiments/ai/design", { goal, constraints: constraints || null }),
  aiParseLog: (id: string, text: string, date: string) => api.post<ExperimentLogProposal>(`/experiments/${id}/ai/parse-log`, { text, date }),
  aiReports: (id: string) => api.get<ExperimentInsightReport[]>(`/experiments/${id}/ai/reports`),
  aiInsights: (id: string, opts: { refresh?: boolean; final?: boolean } = {}) =>
    api.post<{ cached: boolean; report: ExperimentInsightReport }>(`/experiments/${id}/ai/insights`, opts),
  analysis: (id: string) => api.get<ExperimentAnalysis>(`/experiments/${id}/analysis`),
  baselinePreview: (metric: string, habitId?: string | null, days = 28) =>
    api.get<ExperimentBaselinePreview>(`/experiments/metrics/${metric}/baseline?days=${days}${habitId ? `&habitId=${encodeURIComponent(habitId)}` : ""}`),
  list: () => api.get<ExperimentListItem[]>("/experiments"),
  summary: () => api.get<ExperimentSummary>("/experiments/summary"),
  insights: () => api.get<ExperimentInsightStat[]>("/experiments/insights"),
  metricsCatalog: () => api.get<ExperimentMetricInfo[]>("/experiments/metrics/catalog"),
  verificationRules: () => api.get<VerificationRuleInfo[]>("/experiments/verification/rules"),
  aiSuggestion: () => api.get<ExperimentAISuggestion>("/experiments/suggestions/ai"),
  get: (id: string) => api.get<ExperimentDetail>(`/experiments/${id}`),
  create: (input: CreateExperimentInput) => api.post<Experiment>("/experiments", input),
  update: (id: string, patch: UpdateExperimentInput) => api.patch<Experiment>(`/experiments/${id}`, patch),
  remove: (id: string) => api.delete<void>(`/experiments/${id}`),
  setStatus: (id: string, status: ExperimentStatus) => api.post<Experiment>(`/experiments/${id}/status`, { status }),
  conclude: (id: string, input: { personalConclusion?: string; worthContinuing?: ExperimentWorthContinuing; perceivedResult?: ExperimentPerceivedResult }) =>
    api.post<Experiment>(`/experiments/${id}/conclude`, input),
  upsertLog: (id: string, input: { logDate: string; checkinStatus?: ExperimentCheckinStatus | null; perception?: ExperimentPerception | null; notes?: string | null }) =>
    api.post<ExperimentLog>(`/experiments/${id}/logs`, input),
  analyze: (id: string, question?: string) => api.post<{ text: string }>(`/experiments/${id}/analyze`, { question }),
  series: (id: string, metric: string) =>
    api.get<{ metric: string; label: string; unit: string | null; points: Array<{ date: string; value: number | null; phase: "before" | "during" }> }>(
      `/experiments/${id}/series?metric=${metric}`
    ),
};
