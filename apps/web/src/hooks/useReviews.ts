import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { reviewsService } from "@/services/reviewsService";

/** Segunda-feira (00:00) da semana que contém `date` (ou hoje). */
export function mondayOf(date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay(); // 0 = domingo
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Histórico de revisões semanais já salvas — usado no Dashboard para o gráfico de evolução. */
export function useWeeklyReviewHistory(limit = 12) {
  const query = useQuery({ queryKey: ["reviews", "weekly-history", limit], queryFn: () => reviewsService.historyWeekly(limit) });
  return { history: query.data ?? [], isLoading: query.isLoading };
}

export function useWeeklyReview(weekStartDate: string) {
  const queryClient = useQueryClient();

  const savedQuery = useQuery({
    queryKey: ["reviews", "weekly", weekStartDate],
    queryFn: () => reviewsService.getWeekly(weekStartDate),
  });
  const computedQuery = useQuery({
    queryKey: ["reviews", "weekly-compute", weekStartDate],
    queryFn: () => reviewsService.computeWeekly(weekStartDate),
  });
  const historyQuery = useQuery({ queryKey: ["reviews", "weekly-history"], queryFn: () => reviewsService.historyWeekly() });

  const save = useMutation({
    mutationFn: reviewsService.saveWeekly,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviews", "weekly", weekStartDate] });
      queryClient.invalidateQueries({ queryKey: ["reviews", "weekly-history"] });
    },
  });

  return {
    saved: savedQuery.data ?? null,
    computed: computedQuery.data ?? null,
    history: historyQuery.data ?? [],
    isLoading: savedQuery.isLoading || computedQuery.isLoading,
    save: save.mutateAsync,
  };
}
