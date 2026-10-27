import { api } from "./api";
import type { LifeScoreBreakdown, AnalyticsOverview, LifeInsights, TimelineResponse } from "@/types";

export const analyticsService = {
  lifeScore: (date?: string) => api.get<LifeScoreBreakdown>(`/analytics/life-score${date ? `?date=${date}` : ""}`),
  /** Snapshots diários reais do Life Score (gravados quando o score do dia é consultado). */
  lifeScoreHistory: (days = 30) => api.get<LifeScoreBreakdown[]>(`/analytics/life-score/history?days=${days}`),
  overview: (days = 30) => api.get<AnalyticsOverview>(`/analytics/overview?days=${days}`),
  insights: (days = 90) => api.get<LifeInsights>(`/analytics/insights?days=${days}`),
  /** Timeline real (histórico automático): GET /api/analytics/timeline?from=&to= (YYYY-MM-DD). Sem parâmetros, o backend usa os últimos 14 dias. */
  timeline: (params?: { from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return api.get<TimelineResponse>(`/analytics/timeline${suffix}`);
  },
};
