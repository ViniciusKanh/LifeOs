import { useState } from "react";
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

/** Data (YYYY-MM-DD) `days` dias atrás, em fuso local do navegador — usado só para montar o range da Timeline. */
function shiftDayKeyLocal(dateKey: string, deltaDays: number): string {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayKeyLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Timeline real (histórico automático de eventos). Período padrão de 14 dias
 * (mesmo default do backend); "carregar mais" amplia a janela em +14 dias,
 * sempre terminando hoje. Period state fica aqui pra tela só consumir.
 */
export function useTimeline() {
  const [windowDays, setWindowDays] = useState(14);
  const to = todayKeyLocal();
  const from = shiftDayKeyLocal(to, -(windowDays - 1));
  const query = useQuery({
    queryKey: ["analytics", "timeline", from, to],
    queryFn: () => analyticsService.timeline({ from, to }),
    placeholderData: (prev) => prev,
  });
  return {
    timeline: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    refetch: query.refetch,
    from,
    to,
    loadMore: () => setWindowDays((d) => d + 14),
  };
}

