import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ACHIEVEMENT_CREATED_EVENT,
  ACHIEVEMENT_UNLOCKED_EVENT,
  achievementsService,
  type CustomAchievementInput,
} from "@/services/achievementsService";

const KEY = ["achievements", "custom"];
const METRICS_KEY = ["achievements", "custom-metrics"];

/**
 * Troféus customizados: o próprio usuário cadastra o desafio (ex.:
 * "concluir 5 tarefas no dia") e ele desbloqueia sozinho quando a
 * métrica real bate o limite — nunca marcado à mão.
 */
export function useCustomAchievements() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: achievementsService.listCustom });
  const metricsQuery = useQuery({ queryKey: METRICS_KEY, queryFn: achievementsService.metrics, staleTime: Infinity });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: KEY });
    queryClient.invalidateQueries({ queryKey: ["achievements"] });
  };

  const create = useMutation({
    mutationFn: (input: CustomAchievementInput) => achievementsService.createCustom(input),
    onSuccess: (created) => {
      invalidate();
      window.dispatchEvent(new CustomEvent(ACHIEVEMENT_CREATED_EVENT, { detail: created }));
      if (created.unlockedAt) {
        window.dispatchEvent(new CustomEvent(ACHIEVEMENT_UNLOCKED_EVENT, { detail: [created] }));
      }
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => achievementsService.removeCustom(id), onSuccess: invalidate });

  const trophies = query.data ?? [];

  return {
    trophies,
    unlockedCount: trophies.filter((t) => t.unlockedAt).length,
    metrics: metricsQuery.data ?? [],
    isLoading: query.isLoading,
    create: create.mutateAsync,
    isCreating: create.isPending,
    remove: remove.mutateAsync,
  };
}
