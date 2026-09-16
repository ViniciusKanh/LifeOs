import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ACHIEVEMENT_UNLOCKED_EVENT, achievementsService } from "@/services/achievementsService";

const KEY = ["achievements"];

/**
 * Catálogo de conquistas com o progresso real do usuário. Ao montar,
 * também dispara um recálculo no backend (idempotente) — cobre o
 * caso de algo ter sido desbloqueado sem passar por um gatilho
 * explícito (ex.: dado importado, ou uma ação de uma versão anterior
 * do app que ainda não chamava triggerAchievementsCheck).
 */
export function useAchievements() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: achievementsService.list });

  useEffect(() => {
    achievementsService.check().then(({ newlyUnlocked }) => {
      if (newlyUnlocked.length > 0) {
        queryClient.invalidateQueries({ queryKey: KEY });
        queryClient.invalidateQueries({ queryKey: ["achievements", "custom"] });
        window.dispatchEvent(new CustomEvent(ACHIEVEMENT_UNLOCKED_EVENT, { detail: newlyUnlocked }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unlocked = (query.data ?? []).filter((a) => a.unlockedAt);
  const locked = (query.data ?? []).filter((a) => !a.unlockedAt);

  return {
    achievements: query.data ?? [],
    unlocked,
    locked,
    isLoading: query.isLoading,
  };
}
