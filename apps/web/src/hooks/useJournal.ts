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
  const addAudioMedia = useMutation({
    mutationFn: ({ dataUri, durationSeconds, caption }: { dataUri: string; durationSeconds: number; caption?: string | null }) =>
      journalService.addAudioMedia(date, dataUri, durationSeconds, caption),
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

  const toggleFavorite = useMutation({
    mutationFn: (isFavorite: boolean) => journalService.toggleFavorite(date, isFavorite),
    onSuccess: onMediaChange,
  });

  const deleteEntry = useMutation({
    mutationFn: () => journalService.deleteEntry(date),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal"] });
    },
  });

  return {
    entry: query.data ?? null,
    isLoading: query.isLoading,
    save: save.mutateAsync,
    isSaving: save.isPending,
    addMedia: addMedia.mutateAsync,
    isAddingMedia: addMedia.isPending,
    addAudioMedia: addAudioMedia.mutateAsync,
    isAddingAudioMedia: addAudioMedia.isPending,
    updateMediaCaption: updateMediaCaption.mutateAsync,
    removeMedia: removeMedia.mutateAsync,
    toggleFavorite: toggleFavorite.mutateAsync,
    isTogglingFavorite: toggleFavorite.isPending,
    deleteEntry: deleteEntry.mutateAsync,
    isDeletingEntry: deleteEntry.isPending,
  };
}

/**
 * Ações leves de um dia a partir do card do feed "Entradas" — favoritar,
 * mover para outro(s) diário(s) e excluir — sem buscar a entrada inteira
 * (`useJournal(date)` é pesado demais pra usar dentro de cada card de uma
 * lista). Só invalida o feed/calendário/insights e, se a entrada daquele
 * dia estiver aberta em outra tela, o cache dela também é invalidado.
 */
export function useJournalDayActions() {
  const queryClient = useQueryClient();
  const invalidateFeed = (date: string) => {
    queryClient.invalidateQueries({ queryKey: ["journal", "days"] });
    queryClient.invalidateQueries({ queryKey: ["journal", "calendar"] });
    queryClient.invalidateQueries({ queryKey: ["journal", "insights"] });
    queryClient.invalidateQueries({ queryKey: ["journal", date] });
  };

  const toggleFavorite = useMutation({
    mutationFn: ({ date, isFavorite }: { date: string; isFavorite: boolean }) => journalService.toggleFavorite(date, isFavorite),
    onSuccess: (_data, vars) => invalidateFeed(vars.date),
  });
  const moveToJournals = useMutation({
    mutationFn: ({ date, journalIds }: { date: string; journalIds: string[] }) => journalService.moveToJournals(date, journalIds),
    onSuccess: (_data, vars) => invalidateFeed(vars.date),
  });
  const deleteEntry = useMutation({
    mutationFn: (date: string) => journalService.deleteEntry(date),
    onSuccess: (_data, date) => invalidateFeed(date),
  });

  return {
    toggleFavorite: toggleFavorite.mutateAsync,
    moveToJournals: moveToJournals.mutateAsync,
    deleteEntry: deleteEntry.mutateAsync,
  };
}

/** Feed cronológico do Diário (aba "Entradas") — página por página, mais recente primeiro; `journalId` filtra por um diário/coleção específico, `favoritesOnly` só pelos dias marcados como favoritos (Fase 6). */
export function useJournalDays(journalId?: string, favoritesOnly?: boolean) {
  const query = useInfiniteQuery({
    queryKey: ["journal", "days", journalId ?? "all", favoritesOnly ?? false],
    queryFn: ({ pageParam }: { pageParam?: string }) => journalService.days(pageParam, journalId, favoritesOnly),
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

/** "Lembranças" (Fase 10 — On This Day): entradas reais de anos anteriores no mesmo dia/mês de hoje. */
export function useJournalOnThisDay(date?: string) {
  const query = useQuery({
    queryKey: ["journal", "on-this-day", date ?? "today"],
    queryFn: () => journalService.onThisDay(date),
  });
  return { items: query.data?.items ?? [], isLoading: query.isLoading };
}

/** Datas com entrada real no mês (YYYY-MM) — usado pelos pontinhos da aba "Calendário"; `journalId` filtra por diário. */
export function useJournalCalendarMonth(month: string, journalId?: string) {
  const query = useQuery({
    queryKey: ["journal", "calendar", month, journalId ?? "all"],
    queryFn: () => journalService.calendarMonth(month, journalId),
  });
  return { days: query.data?.days ?? [], isLoading: query.isLoading };
}

/** Bloqueio de privacidade do Diário (Fase 12): status do PIN e ações de definir/verificar/remover — nunca guarda o PIN em texto puro. */
export function useJournalPin() {
  const queryClient = useQueryClient();
  const key = ["journal", "pin", "status"];
  const query = useQuery({ queryKey: key, queryFn: journalService.pinStatus });

  const setPin = useMutation({
    mutationFn: (pin: string) => journalService.setPin(pin),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  const verifyPin = useMutation({
    mutationFn: (pin: string) => journalService.verifyPin(pin),
  });
  const removePin = useMutation({
    mutationFn: (pin: string) => journalService.removePin(pin),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return {
    hasPin: query.data?.hasPin ?? false,
    isLoading: query.isLoading,
    setPin: setPin.mutateAsync,
    isSettingPin: setPin.isPending,
    verifyPin: verifyPin.mutateAsync,
    isVerifyingPin: verifyPin.isPending,
    removePin: removePin.mutateAsync,
    isRemovingPin: removePin.isPending,
  };
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
