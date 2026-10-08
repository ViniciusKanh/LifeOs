import { useQuery } from "@tanstack/react-query";
import { analyticsService } from "@/services/analyticsService";

export function useLifeScore(date?: string) {
  const query = useQuery({ queryKey: ["analytics", "life-score", date ?? "today"], queryFn: () => analyticsService.lifeScore(date) });
  return { lifeScore: query.data ?? null, isLoading: query.isLoading };
}

/** Evolução real do Life Score. `enabled` espera o score de hoje carregar (é ele que grava o snapshot do dia). */
export function useLifeScoreHistory(days = 30, enabled = true) {
  const query = useQuery({
    queryKey: ["analytics", "life-score-history", days],
    queryFn: () => analyticsService.lifeScoreHistory(days),
    enabled,
  });
  return { history: query.data ?? [], isLoading: query.isLoading };
}

export function useAnalyticsOverview(days = 30) {
  const query = useQuery({ queryKey: ["analytics", "overview", days], queryFn: () => analyticsService.overview(days) });
  return { overview: query.data ?? null, isLoading: query.isLoading };
}

export function useInsights(days = 90) {
  const query = useQuery({ queryKey: ["analytics", "insights", days], queryFn: () => analyticsService.insights(days) });
  return { insights: query.data ?? null, isLoading: query.isLoading };
}

