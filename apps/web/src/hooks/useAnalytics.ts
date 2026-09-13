import { useQuery } from "@tanstack/react-query";
import { analyticsService } from "@/services/analyticsService";

export function useLifeScore(date?: string) {
  const query = useQuery({ queryKey: ["analytics", "life-score", date ?? "today"], queryFn: () => analyticsService.lifeScore(date) });
  return { lifeScore: query.data ?? null, isLoading: query.isLoading };
}

export function useAnalyticsOverview(days = 30) {
  const query = useQuery({ queryKey: ["analytics", "overview", days], queryFn: () => analyticsService.overview(days) });
  return { overview: query.data ?? null, isLoading: query.isLoading };
}

export function useInsights(days = 90) {
  const query = useQuery({ queryKey: ["analytics", "insights", days], queryFn: () => analyticsService.insights(days) });
  return { insights: query.data ?? null, isLoading: query.isLoading };
}

export function useTimeline(params?: { from?: string; to?: string }) {
  const query = useQuery({
    queryKey: ["analytics", "timeline", params?.from ?? "default", params?.to ?? "default"],
    queryFn: () => analyticsService.timeline(params),
  });
  return { events: query.data?.events ?? [], isLoading: query.isLoading };
}
