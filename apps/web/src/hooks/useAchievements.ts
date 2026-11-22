import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ACHIEVEMENT_UNLOCKED_EVENT, achievementsService, scheduleAchievementsCheck } from "@/services/achievementsService";

const KEY = ["achievements"];

/**
 * Catálogo de conquistas com o progresso real do usuário. O recálculo no
 * backend (POST /achievements/check) é a consulta mais cara do app, então só
 * roda quando `runCheck` é pedido explicitamente — hoje apenas na tela
 * Conquistas. Antes rodava em todo carregamento do app e a cada ação, e era o
 * principal consumo de CPU das functions na Vercel.
 */
export function useAchievements(runCheck = false) {
  const queryClient = useQueryClient();
  // O catálogo calcula o progresso sobre todo o histórico: cache de 30 min,
  // renovado quando uma conquista é destravada.
  const query = useQuery({ queryKey: KEY, queryFn: achievementsService.list, staleTime: 30 * 60_000 });

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

/**
 * Versão leve: só as conquistas já destravadas, sem recalcular métricas no
 * backend. Para componentes sempre montados (ex.: moldura do avatar no
 * cabeçalho), que não podem disparar a consulta cara a cada abertura do app.
 * A chave fica sob ["achievements"], então é invalidada junto quando algo destrava.
 */
export function useUnlockedAchievements() {
  const query = useQuery({ queryKey: [...KEY, "unlocked-only"], queryFn: achievementsService.listUnlockedOnly, staleTime: 60 * 60_000 });
  return { achievements: query.data ?? [], isLoading: query.isLoading };
}
