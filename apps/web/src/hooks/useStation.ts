import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { stationService as svc } from "@/services/stationService";
import { TRANSIT_KEY } from "@/hooks/usePublicApis";

/** Estação das Carruagens. Atualiza a cada 30 s (o relógio da tela conta os segundos localmente). */
export const useStation = () => useQuery({ queryKey: TRANSIT_KEY, queryFn: svc.overview, staleTime: 20_000, refetchInterval: 30_000 });

export function useStationActions() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: TRANSIT_KEY });
    void qc.invalidateQueries({ queryKey: ["gamification"] });
  };
  return {
    addStop: useMutation({ mutationFn: svc.addStop, onSuccess: refresh }),
    updateStop: useMutation({ mutationFn: ({ id, ...p }: { id: string; walkMinutes?: number; lines?: string[]; first?: boolean }) => svc.updateStop(id, p), onSuccess: refresh }),
    removeStop: useMutation({ mutationFn: svc.removeStop, onSuccess: refresh }),
    plan: useMutation({ mutationFn: ({ from, to }: { from: Parameters<typeof svc.plan>[0]; to: Parameters<typeof svc.plan>[1] }) => svc.plan(from, to) }),
    createJourney: useMutation({ mutationFn: svc.createJourney, onSuccess: refresh }),
    primaryJourney: useMutation({ mutationFn: svc.primaryJourney, onSuccess: refresh }),
    removeJourney: useMutation({ mutationFn: svc.removeJourney, onSuccess: refresh }),
    depart: useMutation({ mutationFn: svc.depart, onSettled: refresh }),
  };
}
