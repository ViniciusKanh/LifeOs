import { api } from "./api";
import type { LifeScoreBreakdown, AnalyticsOverview, LifeInsights } from "@/types";

export const analyticsService = {
  lifeScore: (date?: string) => api.get<LifeScoreBreakdown>(`/analytics/life-score${date ? `?date=${date}` : ""}`),
  /** Snapshots diários reais do Life Score (gravados quando o score do dia é consultado). */
  lifeScoreHistory: (days = 30) => api.get<LifeScoreBreakdown[]>(`/analytics/life-score/history?days=${days}`),
  overview: (days = 30) => api.get<AnalyticsOverview>(`/analytics/overview?days=${days}`),
  insights: (days = 90) => api.get<LifeInsights>(`/analytics/insights?days=${days}`),
};
