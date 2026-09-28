import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { journalService, type JournalUpsertInput } from "@/services/journalService";

/** Estatísticas reais do hábito de escrever no diário (streak, recorde, entradas, palavras) — usado pelo painel "Insights" do Diário. */
export function useJournalInsights() {
  const query = useQuery({ queryKey: ["journal", "insights"], queryFn: journalService.insights });
  return { insights: query.data ?? null, isLoading: query.isLoading };
}

/** Uma entrada por data — reaproveitado pela tela Diário e, futuramente, por qualquer resumo do dia. */
export function useJournal(date: string) {
  const queryClient = useQueryClient();
  const key = ["journal", date];

  const query = useQuery({ queryKey: key, queryFn: () => journalService.get(date) });

  const save = useMutation({
    mutationFn: (input: JournalUpsertInput) => journalService.save(date, input),
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
      queryClient.invalidateQueries({ queryKey: ["analytics", "timeline"] });
      queryClient.invalidateQueries({ queryKey: ["journal", "insights"] });
    },
  });

  return {
    entry: query.data ?? null,
    isLoading: query.isLoading,
    save: save.mutateAsync,
    isSaving: save.isPending,
  };
}

/** Feed cronológico do Diário (aba "Entradas") — página por página, mais recente primeiro. */
export function useJournalDays() {
  const query = useInfiniteQuery({
    queryKey: ["journal", "days"],
    queryFn: ({ pageParam }: { pageParam?: string }) => journalService.days(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.items.at(-1)?.date : undefined),
  });
  const days = query.data?.pages.flatMap((p) => p.items) ?? [];
  return {
    days,
    isLoading: query.isLoading,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage ?? false,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}

/** Datas com entrada real no mês (YYYY-MM) — usado pelos pontinhos da aba "Calendário". */
export function useJournalCalendarMonth(month: string) {
  const query = useQuery({ queryKey: ["journal", "calendar", month], queryFn: () => journalService.calendarMonth(month) });
  return { days: query.data?.days ?? [], isLoading: query.isLoading };
}
