import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { heroService, type GoalKind, type NarratorMode } from "@/services/heroService";
import { analyticsService } from "@/services/analyticsService";

// Chaves sob o prefixo do módulo de origem: resgatar, desbloquear ou registrar
// algo invalida o hub correspondente junto com as telas que já existiam.
export const ACH_HUB_KEY = ["achievements", "hero"] as const;
export const TREASURE_HUB_KEY = ["gamification", "hero-treasure"] as const;
export const SNAPSHOTS_KEY = ["build", "snapshots"] as const;

export const useAchievementsHub = () => useQuery({ queryKey: ACH_HUB_KEY, queryFn: heroService.achievements, staleTime: 30_000 });
export const useTreasureHub = () => useQuery({ queryKey: TREASURE_HUB_KEY, queryFn: heroService.treasure, staleTime: 15_000 });
export const useBuildSnapshots = () => useQuery({ queryKey: SNAPSHOTS_KEY, queryFn: heroService.snapshots, staleTime: 60_000 });

/** Indicadores do período + eventos canônicos da Timeline (mesmo endpoint de sempre). */
export function useJourney(from: string, to: string) {
  const hub = useQuery({ queryKey: ["analytics", "journey", from, to], queryFn: () => heroService.journey(from, to), placeholderData: (p) => p, staleTime: 30_000 });
  const timeline = useQuery({ queryKey: ["analytics", "timeline", from, to], queryFn: () => analyticsService.timeline({ from, to }), placeholderData: (p) => p });
  return { hub, timeline };
}

export const useMomentCandidates = (enabled: boolean) => useQuery({ queryKey: ["analytics", "journey", "moments"], queryFn: heroService.momentCandidates, enabled, staleTime: 30_000 });

export function useHeroActions() {
  const qc = useQueryClient();
  const refreshTreasure = () => void qc.invalidateQueries({ queryKey: ["gamification"] });
  const refreshJourney = () => void qc.invalidateQueries({ queryKey: ["analytics", "journey"] });
  return {
    addGoal: useMutation({ mutationFn: ({ kind, targetId }: { kind: GoalKind; targetId: string }) => heroService.addGoal(kind, targetId), onSuccess: refreshTreasure }),
    removeGoal: useMutation({ mutationFn: heroService.removeGoal, onSuccess: refreshTreasure }),
    recordSnapshot: useMutation({ mutationFn: heroService.recordSnapshot, onSuccess: () => void qc.invalidateQueries({ queryKey: SNAPSHOTS_KEY }) }),
    toggleMark: useMutation({ mutationFn: heroService.toggleMark, onSuccess: refreshJourney }),
    setMoment: useMutation({ mutationFn: ({ id, authorized }: { id: string; authorized: boolean }) => heroService.setMoment(id, authorized), onSuccess: refreshJourney }),
    narrate: useMutation({ mutationFn: (input: { from: string; to: string; mode: NarratorMode; useAi: boolean }) => heroService.narrate(input) }),
  };
}

/** Dia local (YYYY-MM-DD) no fuso do navegador. */
export function localDayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function shiftLocalDay(key: string, delta: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return localDayKey(new Date(y!, m! - 1, d! + delta));
}
