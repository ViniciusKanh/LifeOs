import { api } from "./api";
import type { LifeScoreBreakdown, AnalyticsOverview, LifeInsights, TimelineEvent } from "@/types";

export const analyticsService = {
  lifeScore: (date?: string) => api.get<LifeScoreBreakdown>(`/analytics/life-score${date ? `?date=${date}` : ""}`),
  overview: (days = 30) => api.get<AnalyticsOverview>(`/analytics/overview?days=${days}`),
  insights: (days = 90) => api.get<LifeInsights>(`/analytics/insights?days=${days}`),
  timeline: (params?: { from?: string; to?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return api.get<{ from: string; to: string; events: TimelineEvent[] }>(`/analytics/timeline${qs ? `?${qs}` : ""}`);
  },
};
