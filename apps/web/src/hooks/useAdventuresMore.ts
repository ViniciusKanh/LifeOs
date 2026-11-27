import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adventuresMore as svc } from "@/services/adventuresMoreService";

/** Hooks de Xadrez, Advent of Code, Expedições, Bestiário e Leitura em Áudio. */

function useRefresh(...keys: ReadonlyArray<readonly unknown[]>) {
  const qc = useQueryClient();
  return () => {
    for (const k of keys) void qc.invalidateQueries({ queryKey: k });
    void qc.invalidateQueries({ queryKey: ["gamification"] });
  };
}

export const CHESS_KEY = ["chess"] as const;
export const AOC_KEY = ["aoc"] as const;
export const EXPEDITIONS_KEY = ["expeditions"] as const;
export const BESTIARY_KEY = ["bestiary"] as const;
export const PODCASTS_KEY = ["podcasts"] as const;
const ATLAS_KEY = ["adventures", "atlas"] as const;

export const useChess = () => useQuery({ queryKey: CHESS_KEY, queryFn: svc.chess.overview, staleTime: 60_000 });
export function useChessActions() {
  const refresh = useRefresh(CHESS_KEY, ["analytics"]);
  return {
    connect: useMutation({ mutationFn: svc.chess.connect, onSettled: refresh }),
    sync: useMutation({ mutationFn: svc.chess.sync, onSettled: refresh }),
    disconnect: useMutation({ mutationFn: svc.chess.disconnect, onSuccess: refresh }),
  };
}

export const useAoc = (year?: number) => useQuery({ queryKey: [...AOC_KEY, year ?? "atual"], queryFn: () => svc.aoc.overview(year), staleTime: 5 * 60_000 });
export function useAocActions() {
  const refresh = useRefresh(AOC_KEY, ["code-forge"]);
  return {
    connect: useMutation({ mutationFn: svc.aoc.connect, onSettled: refresh }),
    sync: useMutation({ mutationFn: svc.aoc.sync, onSettled: refresh }),
    member: useMutation({ mutationFn: svc.aoc.member, onSuccess: refresh }),
    disconnect: useMutation({ mutationFn: svc.aoc.disconnect, onSuccess: refresh }),
  };
}

export const useExpeditions = () => useQuery({ queryKey: EXPEDITIONS_KEY, queryFn: svc.expeditions.overview, staleTime: 60_000 });
export function useExpeditionActions() {
  const refresh = useRefresh(EXPEDITIONS_KEY, ATLAS_KEY);
  return {
    settings: useMutation({ mutationFn: svc.expeditions.settings, onSuccess: refresh }),
    swap: useMutation({ mutationFn: svc.expeditions.swap, onSettled: refresh }),
  };
}

export const useBestiary = () => useQuery({ queryKey: BESTIARY_KEY, queryFn: svc.bestiary.overview, staleTime: 5 * 60_000 });
export function useBestiaryActions() {
  const refresh = useRefresh(BESTIARY_KEY);
  return {
    connect: useMutation({ mutationFn: svc.bestiary.connect, onSettled: refresh }),
    sync: useMutation({ mutationFn: svc.bestiary.sync, onSettled: refresh }),
    disconnect: useMutation({ mutationFn: svc.bestiary.disconnect, onSuccess: refresh }),
  };
}

export const usePodcasts = () => useQuery({ queryKey: PODCASTS_KEY, queryFn: svc.podcasts.overview, staleTime: 60_000 });
export function usePodcastActions() {
  const refresh = useRefresh(PODCASTS_KEY, ["analytics"]);
  return {
    keys: useMutation({ mutationFn: ({ key, secret }: { key: string; secret: string }) => svc.podcasts.keys(key, secret), onSuccess: refresh }),
    removeKeys: useMutation({ mutationFn: svc.podcasts.removeKeys, onSuccess: refresh }),
    follow: useMutation({ mutationFn: svc.podcasts.follow, onSuccess: refresh }),
    unfollow: useMutation({ mutationFn: svc.podcasts.unfollow, onSuccess: refresh }),
    listen: useMutation({ mutationFn: svc.podcasts.listen, onSettled: refresh }),
    unlisten: useMutation({ mutationFn: svc.podcasts.unlisten, onSettled: refresh }),
    goal: useMutation({ mutationFn: svc.podcasts.goal, onSuccess: refresh }),
  };
}
