import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dayHeroService, type RitualKind, type TimerLink, type TimerMode } from "@/services/dayHeroService";
import { notifyGamification } from "@/services/gamificationService";

export const TODAY_HUB_KEY = ["today-hub"] as const;
export const HERO_DASH_KEY = ["hero-dashboard"] as const;

export const useTodayHub = () => useQuery({ queryKey: TODAY_HUB_KEY, queryFn: dayHeroService.today, staleTime: 10_000, refetchOnWindowFocus: true });
export const useHeroDashboard = (period: string, range?: { from: string; to: string }) =>
  useQuery({ queryKey: [...HERO_DASH_KEY, period, range?.from ?? "", range?.to ?? ""], queryFn: () => dayHeroService.hero(period, range), staleTime: 20_000, placeholderData: (p) => p });

/**
 * Atualização entre telas: qualquer ação em Hoje invalida o hub, o Painel do
 * Herói e os módulos de origem — sem recarregar a página.
 */
export function useJourneySync() {
  const qc = useQueryClient();
  return (...extra: string[][]) => {
    void qc.invalidateQueries({ queryKey: TODAY_HUB_KEY });
    void qc.invalidateQueries({ queryKey: HERO_DASH_KEY });
    void qc.invalidateQueries({ queryKey: ["gamification"] });
    for (const k of extra) void qc.invalidateQueries({ queryKey: k });
    notifyGamification();
  };
}

export function useTodayActions() {
  const sync = useJourneySync();
  return {
    setMain: useMutation({ mutationFn: dayHeroService.setMain, onSuccess: () => sync(["tasks"], ["journal"]) }),
    saveRitual: useMutation({ mutationFn: (steps: Array<{ id?: string; label: string; kind: RitualKind; refId?: string | null }>) => dayHeroService.saveRitual(steps), onSuccess: () => sync() }),
    toggleRitual: useMutation({ mutationFn: ({ id, done }: { id: string; done: boolean }) => dayHeroService.toggleRitual(id, done), onSuccess: () => sync() }),
    startTimer: useMutation({ mutationFn: (input: { mode: TimerMode; plannedMinutes?: number | null; linkType?: TimerLink; linkId?: string | null }) => dayHeroService.startTimer(input), onSuccess: () => sync(["tasks"]) }),
    pauseTimer: useMutation({ mutationFn: dayHeroService.pauseTimer, onSuccess: () => sync() }),
    stopTimer: useMutation({ mutationFn: dayHeroService.stopTimer, onSuccess: () => sync(["tasks"], ["analytics"]) }),
    closeDraft: useMutation({ mutationFn: dayHeroService.closeDraft }),
    closeSave: useMutation({ mutationFn: dayHeroService.closeSave, onSuccess: () => sync(["journal"]) }),
  };
}
