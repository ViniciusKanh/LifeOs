import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationsService } from "@/services/notificationsService";
import type { CustomNotificationTrigger, NotificationTriggerEvent, NotificationTriggerRule } from "@/types";

export function useNotificationTriggers() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["notifications", "triggers"],
    queryFn: notificationsService.triggers,
  });
  const customQuery = useQuery({
    queryKey: ["notifications", "triggers", "custom"],
    queryFn: notificationsService.customTriggers,
  });

  const update = useMutation({
    mutationFn: ({ eventType, patch }: { eventType: NotificationTriggerEvent; patch: Partial<NotificationTriggerRule> }) =>
      notificationsService.updateTrigger(eventType, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications", "triggers"] });
    },
  });

  const run = useMutation({ mutationFn: notificationsService.runTriggers });
  const invalidateCustom = () => {
    queryClient.invalidateQueries({ queryKey: ["notifications", "triggers", "custom"] });
  };
  const createCustom = useMutation({ mutationFn: (input: Omit<CustomNotificationTrigger, "id">) => notificationsService.createCustomTrigger(input), onSuccess: invalidateCustom });
  const updateCustom = useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Partial<Omit<CustomNotificationTrigger, "id">> }) => notificationsService.updateCustomTrigger(id, patch), onSuccess: invalidateCustom });
  const deleteCustom = useMutation({ mutationFn: notificationsService.deleteCustomTrigger, onSuccess: invalidateCustom });

  return {
    triggers: query.data ?? [],
    customTriggers: customQuery.data ?? [],
    isLoading: query.isLoading,
    updateTrigger: update.mutateAsync,
    isUpdating: update.isPending,
    runTriggers: run.mutateAsync,
    isRunning: run.isPending,
    createCustomTrigger: createCustom.mutateAsync,
    updateCustomTrigger: updateCustom.mutateAsync,
    deleteCustomTrigger: deleteCustom.mutateAsync,
  };
}

/**
 * Sino de notificações: histórico real do que já foi disparado (não uma
 * recomputação de condições atuais — isso já existe no cartão "Precisa da
 * sua atenção" do Dashboard). Atualiza sozinho a cada minuto para o badge
 * de não lidas refletir disparos recentes sem precisar recarregar a tela.
 */
export function useNotificationFeed() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["notifications", "feed"],
    queryFn: () => notificationsService.feed(),
    refetchInterval: 60_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notifications", "feed"] });
  const markRead = useMutation({ mutationFn: notificationsService.markFeedItemRead, onSuccess: invalidate });
  const markAllRead = useMutation({ mutationFn: notificationsService.markAllFeedRead, onSuccess: invalidate });

  return {
    items: query.data?.items ?? [],
    unreadCount: query.data?.unreadCount ?? 0,
    isLoading: query.isLoading,
    markRead: markRead.mutateAsync,
    markAllRead: markAllRead.mutateAsync,
  };
}
