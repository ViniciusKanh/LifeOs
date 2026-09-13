import { useQuery } from "@tanstack/react-query";
import { notificationsService } from "@/services/notificationsService";

/**
 * Notificações calculadas em tempo real (tarefas atrasadas/vencendo
 * hoje, hábitos pendentes, weekly review em aberto) — sem persistência
 * ainda, então refetch periódico é o jeito de "atualizar" a lista.
 */
export function useNotifications() {
  const query = useQuery({
    queryKey: ["notifications", "live"],
    queryFn: notificationsService.live,
    refetchInterval: 60_000,
  });
  return { notifications: query.data ?? [], isLoading: query.isLoading };
}
