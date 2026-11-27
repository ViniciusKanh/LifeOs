import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { publicApis as svc, type PublicApiProvider } from "@/services/publicApisService";
import { RESEARCH_KEY } from "@/hooks/useResearch";

/** Hooks das APIs públicas por tela (YouTube, Ar, Hugging Face, SPTrans, Wikipédia, NASA, TMDB, BCB). */

function useRefresh(...keys: ReadonlyArray<readonly unknown[]>) {
  const qc = useQueryClient();
  return () => {
    for (const k of keys) void qc.invalidateQueries({ queryKey: k });
    // XP, moedas e conquistas novas aparecem no HUD.
    void qc.invalidateQueries({ queryKey: ["gamification"] });
  };
}

export const KEYS_KEY = ["public-keys"] as const;
export const VIDEO_KEY = ["video-courses"] as const;
export const AIR_KEY = ["air"] as const;
export const HF_KEY = ["hf-trends"] as const;
export const TRANSIT_KEY = ["transit"] as const;
export const LORE_KEY = ["lore"] as const;
export const SKY_KEY = ["sky"] as const;
export const CINEMA_KEY = ["cinema"] as const;
export const THERMO_KEY = ["thermometer"] as const;

const PROVIDER_KEYS: Record<PublicApiProvider, readonly unknown[]> = { youtube: VIDEO_KEY, nasa: SKY_KEY, tmdb: CINEMA_KEY, sptrans: TRANSIT_KEY };

export const usePublicKeys = () => useQuery({ queryKey: KEYS_KEY, queryFn: svc.keys.status, staleTime: 5 * 60_000 });
export function usePublicKeyActions(provider: PublicApiProvider) {
  const refresh = useRefresh(KEYS_KEY, PROVIDER_KEYS[provider]);
  return {
    save: useMutation({ mutationFn: (key: string) => svc.keys.save(provider, key), onSuccess: refresh }),
    remove: useMutation({ mutationFn: () => svc.keys.remove(provider), onSuccess: refresh }),
  };
}

export const useVideoCourses = () => useQuery({ queryKey: VIDEO_KEY, queryFn: svc.video.overview, staleTime: 60_000 });
export function useVideoCourseActions() {
  const refresh = useRefresh(VIDEO_KEY, ["analytics"]);
  return {
    enroll: useMutation({ mutationFn: svc.video.enroll, onSuccess: refresh }),
    sync: useMutation({ mutationFn: svc.video.sync, onSettled: refresh }),
    update: useMutation({ mutationFn: ({ id, ...p }: { id: string; subjectId?: string | null; archived?: boolean }) => svc.video.update(id, p), onSuccess: refresh }),
    remove: useMutation({ mutationFn: svc.video.remove, onSuccess: refresh }),
    lesson: useMutation({ mutationFn: ({ id, done }: { id: string; done: boolean }) => svc.video.lesson(id, done), onSettled: refresh }),
  };
}

export const useAirQuality = () => useQuery({ queryKey: AIR_KEY, queryFn: svc.air.overview, staleTime: 10 * 60_000 });

export const useHfTrends = () => useQuery({ queryKey: HF_KEY, queryFn: svc.hf.overview, staleTime: 10 * 60_000 });
export function useHfActions() {
  const refresh = useRefresh(HF_KEY, RESEARCH_KEY);
  return { decide: useMutation({ mutationFn: ({ arxivId, decision }: { arxivId: string; decision: "salvar" | "dispensar" | "desfazer" }) => svc.hf.decide(arxivId, decision), onSettled: refresh }) };
}


export const useLore = () => useQuery({ queryKey: LORE_KEY, queryFn: svc.lore.overview, staleTime: 10 * 60_000 });
export function useLoreActions() {
  const refresh = useRefresh(LORE_KEY);
  return { read: useMutation({ mutationFn: svc.lore.read, onSettled: refresh }) };
}

export const useSky = () => useQuery({ queryKey: SKY_KEY, queryFn: svc.sky.overview, staleTime: 30 * 60_000 });
export function useSkyActions() {
  const refresh = useRefresh(SKY_KEY);
  return { collect: useMutation({ mutationFn: svc.sky.collect, onSettled: refresh }) };
}

export const useCinema = () => useQuery({ queryKey: CINEMA_KEY, queryFn: svc.cinema.overview, staleTime: 60_000 });
export const useCinemaSearch = (q: string) => useQuery({ queryKey: [...CINEMA_KEY, "search", q], queryFn: () => svc.cinema.search(q), enabled: q.trim().length >= 2, staleTime: 5 * 60_000 });
export const useCinemaTrending = (enabled: boolean) => useQuery({ queryKey: [...CINEMA_KEY, "trending"], queryFn: svc.cinema.trending, enabled, staleTime: 30 * 60_000 });
export function useCinemaActions() {
  const refresh = useRefresh(CINEMA_KEY, ["analytics"]);
  return {
    add: useMutation({ mutationFn: svc.cinema.add, onSuccess: refresh }),
    update: useMutation({ mutationFn: ({ id, ...p }: { id: string; status?: "quero_ver" | "assistindo" | "visto" | "abandonado"; rating?: number | null; review?: string | null; watchedDay?: string | null }) => svc.cinema.update(id, p), onSettled: refresh }),
    remove: useMutation({ mutationFn: svc.cinema.remove, onSuccess: refresh }),
    goal: useMutation({ mutationFn: svc.cinema.goal, onSuccess: refresh }),
  };
}

export const useThermometer = () => useQuery({ queryKey: THERMO_KEY, queryFn: svc.thermometer.get, staleTime: 60 * 60_000 });
