import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { missions3Service, type MissionProposal, type ProposeInput, type AdvisorMode } from "@/services/missions3Service";
import { triggerAchievementsCheck } from "@/services/achievementsService";
import { notifyGamification } from "@/services/gamificationService";

export const MISSIONS3_KEY = ["missions3"] as const;
export const useMissionsOverview = () => useQuery({ queryKey: [...MISSIONS3_KEY, "overview"], queryFn: missions3Service.overview, staleTime: 15_000 });
export const useMissionsLoad = (enabled: boolean) => useQuery({ queryKey: [...MISSIONS3_KEY, "load"], queryFn: () => missions3Service.load(10), enabled, staleTime: 60_000 });

/** Invalida tudo que depende de tarefas (o quadro, os hubs, projetos, metas, contratos e Analytics). */
export function useMissionsSync() {
  const qc = useQueryClient();
  return () => {
    for (const k of [MISSIONS3_KEY, ["tasks"], ["planning"], ["projects"], ["goals"], ["contracts"], ["analytics"], ["direction"], ["events"], ["journey-review"]]) void qc.invalidateQueries({ queryKey: k });
    notifyGamification();
  };
}

export function useMissionsBoardActions() {
  const sync = useMissionsSync();
  return {
    reorder: useMutation({ mutationFn: missions3Service.reorder, onSuccess: sync }),
    archive: useMutation({ mutationFn: ({ id, archived }: { id: string; archived: boolean }) => missions3Service.archive(id, archived), onSuccess: sync }),
  };
}

/** Conselheiro: propor/refinar não grava missão; só "aplicar" grava (após aprovação). */
export function useMissionAdvisor() {
  const sync = useMissionsSync();
  return {
    propose: useMutation({ mutationFn: (input: ProposeInput) => missions3Service.propose(input) }),
    recalc: useMutation({ mutationFn: (p: MissionProposal) => missions3Service.recalc(p) }),
    apply: useMutation({
      mutationFn: (input: { sessionId: string; mode: AdvisorMode; items: MissionProposal[]; targetTaskId?: string | null; reserveBlocks?: boolean }) => missions3Service.apply(input),
      onSuccess: () => {
        sync();
        triggerAchievementsCheck();
      },
    }),
    discard: useMutation({ mutationFn: (id: string) => missions3Service.discard(id) }),
  };
}
