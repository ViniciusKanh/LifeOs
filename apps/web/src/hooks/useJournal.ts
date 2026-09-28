import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { journalService, journalCollectionsService, type JournalUpsertInput, type JournalCollectionInput } from "@/services/journalService";

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

  const onMediaChange = (data: Awaited<ReturnType<typeof journalService.get>>) => {
    queryClient.setQueryData(key, data);
    queryClient.invalidateQueries({ queryKey: ["journal", "days"] });
    queryClient.invalidateQueries({ queryKey: ["journal", "calendar"] });
  };

  const addMedia = useMutation({
    mutationFn: ({ dataUri, caption }: { dataUri: string; caption?: string | null }) => journalService.addMedia(date, dataUri, caption),
    onSuccess: onMediaChange,
  });
  const updateMediaCaption = useMutation({
    mutationFn: ({ mediaId, caption }: { mediaId: string; caption: string | null }) => journalService.updateMediaCaption(date, mediaId, caption),
    onSuccess: onMediaChange,
  });
  const removeMedia = useMutation({
    mutationFn: (mediaId: string) => journalService.removeMedia(date, mediaId),
    onSuccess: onMediaChange,
  });

  return {
    entry: query.data ?? null,
    isLoading: query.isLoading,
    save: save.mutateAsync,
    isSaving: save.isPending,
    addMedia: addMedia.mutateAsync,
    isAddingMedia: addMedia.isPending,
    updateMediaCaption: updateMediaCaption.mutateAsync,
    removeMedia: removeMedia.mutateAsync,
  };
}

/** Feed cronológico do Diário (aba "Entradas") — página por página, mais recente primeiro; `journalId` filtra por um diário/coleção específico. */
export function useJournalDays(journalId?: string) {
  const query = useInfiniteQuery({
    queryKey: ["journal", "days", journalId ?? "all"],
    queryFn: ({ pageParam }: { pageParam?: string }) => journalService.days(pageParam, journalId),
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

/** Datas com entrada real no mês (YYYY-MM) — usado pelos pontinhos da aba "Calendário"; `journalId` filtra por diário. */
export function useJournalCalendarMonth(month: string, journalId?: string) {
  const query = useQuery({
    queryKey: ["journal", "calendar", month, journalId ?? "all"],
    queryFn: () => journalService.calendarMonth(month, journalId),
  });
  return { days: query.data?.days ?? [], isLoading: query.isLoading };
}

/** Diários (coleções) do usuário — CRUD completo, usado na aba "Diários" e no seletor do editor do dia. */
export function useJournalCollections() {
  const queryClient = useQueryClient();
  const key = ["journal", "collections"];
  const query = useQuery({ queryKey: key, queryFn: journalCollectionsService.list });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const create = useMutation({
    mutationFn: (input: JournalCollectionInput) => journalCollectionsService.create(input),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<JournalCollectionInput> }) => journalCollectionsService.update(id, input),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => journalCollectionsService.remove(id),
    onSuccess: invalidate,
  });

  return {
    collections: query.data ?? [],
    isLoading: query.isLoading,
    create: create.mutateAsync,
    update: update.mutateAsync,
    remove: remove.mutateAsync,
    isSaving: create.isPending || update.isPending,
  };
}
