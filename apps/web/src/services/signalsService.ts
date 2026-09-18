import { api } from "./api";
import type { SignalPeriod, SignalsDashboard, SignalTrendSeries, SignalsRecommendation, TrendSignalKey } from "@/types";

export const signalsService = {
  dashboard: (period: SignalPeriod) => api.get<SignalsDashboard>(`/signals?period=${period}`),
  trend: (period: SignalPeriod, signal: TrendSignalKey) =>
    api.get<SignalTrendSeries>(`/signals/trend?period=${period}&signal=${signal}`),
  aiSuggestion: (period: SignalPeriod) => api.post<SignalsRecommendation>("/signals/suggestion/ai", { period }),
};
