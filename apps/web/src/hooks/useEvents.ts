import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { eventsService } from "@/services/eventsService";

/** Calendário — combina eventos manuais com prazos reais (tarefas, metas, TCC) num período. */
export function useEvents(from: string, to: string) {
  const queryClient = useQueryClient();
  const key = ["events", from, to];

  const query = useQuery({ queryKey: key, queryFn: () => eventsService.list(from, to) });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["events"] });

  const createEvent = useMutation({ mutationFn: eventsService.create, onSuccess: invalidate });
  const updateEvent = useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Parameters<typeof eventsService.update>[1]) =>
      eventsService.update(id, input),
    onSuccess: invalidate,
  });
  const removeEvent = useMutation({ mutationFn: eventsService.remove, onSuccess: invalidate });

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    createEvent: createEvent.mutateAsync,
    updateEvent: updateEvent.mutateAsync,
    removeEvent: removeEvent.mutateAsync,
  };
}

/**
 * URL de assinatura do calendário externo (.ics) — Google/Apple/Outlook
 * Calendar buscam prazos de tarefas + eventos direto, sem precisar abrir
 * o LifeOS. "Gerar novo link" invalida a URL anterior.
 */
export function useIcsFeed() {
  const query = useQuery({ queryKey: ["events", "ics-feed"], queryFn: () => eventsService.icsFeed() });
  const regenerate = useMutation({
    mutationFn: eventsService.regenerateIcsFeed,
    onSuccess: () => {
      void query.refetch();
    },
  });
  return {
    url: query.data?.url ?? null,
    isLoading: query.isLoading,
    regenerate: regenerate.mutateAsync,
    isRegenerating: regenerate.isPending,
  };
}
