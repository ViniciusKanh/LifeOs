import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adventuresService, type CareAction, type RaidOverview } from "@/services/adventuresService";

/** Hooks dos sistemas de aventura. Toda mutação que pode gerar XP invalida o HUD. */

const K = {
  world: ["adventures", "world"] as const,
  raid: ["adventures", "raid"] as const,
  companion: ["adventures", "companion"] as const,
  atlas: ["adventures", "atlas"] as const,
  steam: ["adventures", "steam"] as const,
};

function useRefresh() {
  const qc = useQueryClient();
  return (...keys: ReadonlyArray<readonly string[]>) => {
    for (const k of keys) void qc.invalidateQueries({ queryKey: k });
    void qc.invalidateQueries({ queryKey: K.world });
    void qc.invalidateQueries({ queryKey: ["gamification"] });
  };
}

export const useAdventureWorld = () => useQuery({ queryKey: K.world, queryFn: adventuresService.world, staleTime: 2 * 60_000, refetchInterval: 5 * 60_000, refetchIntervalInBackground: false });

export const useRaid = () => useQuery({ queryKey: K.raid, queryFn: adventuresService.raid, staleTime: 30_000, refetchOnWindowFocus: true });
export function useRaidActions() {
  const refresh = useRefresh();
  return {
    settings: useMutation({ mutationFn: (s: RaidOverview["settings"]) => adventuresService.raidSettings(s), onSuccess: () => refresh(K.raid) }),
    restDay: useMutation({ mutationFn: ({ day, rest }: { day: string; rest: boolean }) => adventuresService.raidRestDay(day, rest), onSuccess: () => refresh(K.raid) }),
  };
}

export const useCompanion = () => useQuery({ queryKey: K.companion, queryFn: adventuresService.companion, staleTime: 30_000, refetchInterval: 5 * 60_000 });
export function useCompanionActions() {
  const qc = useQueryClient();
  const refresh = useRefresh();
  const set = (d: Awaited<ReturnType<typeof adventuresService.companion>>) => qc.setQueryData(K.companion, d);
  return {
    adopt: useMutation({ mutationFn: adventuresService.adopt, onSuccess: (d) => { set(d); refresh(); } }),
    care: useMutation({ mutationFn: (a: CareAction) => adventuresService.care(a), onSuccess: (d) => { set(d); refresh(); } }),
    update: useMutation({ mutationFn: adventuresService.updateCompanion, onSuccess: (d) => { set(d); refresh(); } }),
  };
}

export const useAtlas = (region: string | null) => useQuery({ queryKey: [...K.atlas, region ?? "auto"], queryFn: () => adventuresService.atlas(region), staleTime: 60_000 });
export function useAtlasActions() {
  const refresh = useRefresh();
  const r = () => refresh(K.atlas, K.raid);
  return {
    checkin: useMutation({ mutationFn: adventuresService.checkin, onSuccess: r }),
    updatePlace: useMutation({ mutationFn: ({ id, ...p }: { id: string; name?: string; category?: string; favorite?: boolean }) => adventuresService.updatePlace(id, p), onSuccess: r }),
    deletePlace: useMutation({ mutationFn: adventuresService.deletePlace, onSuccess: r }),
    deleteRoute: useMutation({ mutationFn: adventuresService.deleteRoute, onSuccess: r }),
    settings: useMutation({ mutationFn: adventuresService.atlasSettings, onSuccess: r }),
    saveJournal: useMutation({ mutationFn: ({ id, ...b }: Record<string, unknown> & { id?: string }) => adventuresService.saveJournal(b, id), onSuccess: r }),
    deleteJournal: useMutation({ mutationFn: adventuresService.deleteJournal, onSuccess: r }),
    deleteHistory: useMutation({ mutationFn: adventuresService.deleteAtlasHistory, onSuccess: r }),
  };
}

export const useSteam = (range: 7 | 14 | 30) => useQuery({ queryKey: [...K.steam, range], queryFn: () => adventuresService.steam(range), staleTime: 60_000 });
export const useSteamGame = (appid: number | null) =>
  useQuery({ queryKey: [...K.steam, "game", appid], queryFn: () => adventuresService.steamGame(appid!), enabled: appid != null, staleTime: 5 * 60_000, retry: false });

export function useSteamActions() {
  const refresh = useRefresh();
  const r = () => refresh(K.steam, ["inventory"]);
  return {
    link: useMutation({ mutationFn: adventuresService.steamLink, onSuccess: r }),
    sync: useMutation({ mutationFn: adventuresService.steamSync, onSettled: r }),
    achSync: useMutation({ mutationFn: (force: boolean) => adventuresService.steamAchSync(force), onSettled: r }),
    settings: useMutation({ mutationFn: adventuresService.steamSettings, onSuccess: r }),
    pin: useMutation({ mutationFn: ({ appid, apiName, pin }: { appid: number; apiName: string; pin: boolean }) => adventuresService.steamPin(appid, apiName, pin), onSuccess: r }),
    disconnect: useMutation({ mutationFn: adventuresService.steamDisconnect, onSuccess: r }),
  };
}
