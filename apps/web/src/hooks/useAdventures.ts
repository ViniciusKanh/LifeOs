import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adventuresService, type CareAction, type MusicSessionKind, type RaidOverview } from "@/services/adventuresService";

/** Hooks dos sistemas de aventura. Toda mutação que pode gerar XP invalida o HUD. */

const K = {
  world: ["adventures", "world"] as const,
  raid: ["adventures", "raid"] as const,
  companion: ["adventures", "companion"] as const,
  atlas: ["adventures", "atlas"] as const,
  strava: ["adventures", "strava"] as const,
  spotify: ["adventures", "spotify"] as const,
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

export const useStrava = () => useQuery({ queryKey: K.strava, queryFn: adventuresService.strava, staleTime: 60_000 });
export function useStravaActions() {
  const refresh = useRefresh();
  const r = () => refresh(K.strava, K.raid, ["health"]);
  return {
    sync: useMutation({ mutationFn: adventuresService.stravaSync, onSettled: r }),
    settings: useMutation({ mutationFn: adventuresService.stravaSettings, onSuccess: r }),
    disconnect: useMutation({ mutationFn: adventuresService.stravaDisconnect, onSuccess: r }),
  };
}

export const useSpotify = () => useQuery({ queryKey: K.spotify, queryFn: adventuresService.spotify, staleTime: 60_000, refetchInterval: 3 * 60_000, refetchIntervalInBackground: false });
export const useNowPlaying = (enabled: boolean) =>
  useQuery({ queryKey: [...K.spotify, "now"], queryFn: adventuresService.nowPlaying, enabled, refetchInterval: 20_000, refetchIntervalInBackground: false, retry: false });
export function useSpotifyActions() {
  const refresh = useRefresh();
  const qc = useQueryClient();
  const r = () => refresh(K.spotify);
  return {
    player: useMutation({ mutationFn: adventuresService.player, onSettled: () => setTimeout(() => void qc.invalidateQueries({ queryKey: [...K.spotify, "now"] }), 600) }),
    sync: useMutation({ mutationFn: adventuresService.spotifySync, onSettled: r }),
    start: useMutation({ mutationFn: (k: MusicSessionKind) => adventuresService.startSession(k), onSuccess: r }),
    stop: useMutation({ mutationFn: adventuresService.stopSession, onSuccess: r }),
    deleteSession: useMutation({ mutationFn: adventuresService.deleteSession, onSuccess: r }),
    settings: useMutation({ mutationFn: adventuresService.spotifySettings, onSuccess: r }),
    playlist: useMutation({ mutationFn: ({ slot, playlist }: { slot: string; playlist: Parameters<typeof adventuresService.setJourneyPlaylist>[1] }) => adventuresService.setJourneyPlaylist(slot, playlist), onSuccess: r }),
    deleteHistory: useMutation({ mutationFn: adventuresService.deleteSpotifyHistory, onSuccess: r }),
    disconnect: useMutation({ mutationFn: adventuresService.spotifyDisconnect, onSuccess: r }),
  };
}

export const useSteam = (range: 7 | 14 | 30) => useQuery({ queryKey: [...K.steam, range], queryFn: () => adventuresService.steam(range), staleTime: 60_000 });
export function useSteamActions() {
  const refresh = useRefresh();
  const r = () => refresh(K.steam, ["inventory"]);
  return {
    link: useMutation({ mutationFn: adventuresService.steamLink, onSuccess: r }),
    sync: useMutation({ mutationFn: adventuresService.steamSync, onSettled: r }),
    settings: useMutation({ mutationFn: adventuresService.steamSettings, onSuccess: r }),
    pin: useMutation({ mutationFn: ({ appid, apiName, pin }: { appid: number; apiName: string; pin: boolean }) => adventuresService.steamPin(appid, apiName, pin), onSuccess: r }),
    disconnect: useMutation({ mutationFn: adventuresService.steamDisconnect, onSuccess: r }),
  };
}
