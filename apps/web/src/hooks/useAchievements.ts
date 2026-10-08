import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ACHIEVEMENT_UNLOCKED_EVENT, achievementsService, scheduleAchievementsCheck } from "@/services/achievementsService";

const KEY = ["achievements"];

/**
 * Catálogo de conquistas com o progresso real do usuário. Ao montar,
 * agenda um recálculo no backend (idempotente e agrupado — ver
 * scheduleAchievementsCheck) para cobrir desbloqueios sem gatilho
 * explícito (ex.: dado importado).
 */
export function useAchievements(runCheck = true) {
  const queryClient = useQueryClient();
  // O catálogo calcula o progresso sobre todo o histórico: cache de 10 min,
  // renovado quando uma conquista é destravada.
  const query = useQuery({ queryKey: KEY, queryFn: achievementsService.list, staleTime: 10 * 60_000 });

  useEffect(() => {
    const onUnlock = () => {
      void queryClient.invalidateQueries({ queryKey: KEY });
      void queryClient.invalidateQueries({ queryKey: ["achievements", "custom"] });
    };
    window.addEventListener(ACHIEVEMENT_UNLOCKED_EVENT, onUnlock);
    if (runCheck) scheduleAchievementsCheck();
    return () => window.removeEventListener(ACHIEVEMENT_UNLOCKED_EVENT, onUnlock);
  }, [runCheck, queryClient]);

  const unlocked = (query.data ?? []).filter((a) => a.unlockedAt);
  const locked = (query.data ?? []).filter((a) => !a.unlockedAt);

  return {
    achievements: query.data ?? [],
    unlocked,
    locked,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
