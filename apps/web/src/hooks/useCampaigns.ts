import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { campaignsService, type CampaignInput } from "@/services/campaignsService";
import { notifyGamification } from "@/services/gamificationService";

const KEY = ["campaigns"] as const;

/** Lista (com progresso, recompensas e sequência já calculados no backend, em lote). */
export function useCampaigns(enabled = true) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: campaignsService.list, enabled, staleTime: 30_000 });
  const create = useMutation({
    mutationFn: (input: CampaignInput) => campaignsService.create(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
  return { ...query, campaigns: query.data ?? [], create };
}

export function useCampaignDetail(id: string | null | undefined) {
  return useQuery({ queryKey: [...KEY, "detail", id], queryFn: () => campaignsService.get(id!), enabled: !!id });
}

/** Ações que mexem em progresso/XP: invalidam campanhas, tarefas, prazos e o HUD. */
export function useCampaignActions() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: KEY });
    void qc.invalidateQueries({ queryKey: ["tasks"] });
    void qc.invalidateQueries({ queryKey: ["deadline-radar"] });
    notifyGamification();
  };
  // Mesmo padrão para toda ação: sempre chamado na mesma ordem (regras de hooks).
  const useAction = <A, R>(fn: (a: A) => Promise<R>) => useMutation({ mutationFn: fn, onSuccess: refresh });
  return {
    update: useAction(({ id, input }: { id: string; input: Parameters<typeof campaignsService.update>[1] }) => campaignsService.update(id, input)),
    setStatus: useAction(({ id, status }: { id: string; status: Parameters<typeof campaignsService.setStatus>[1] }) => campaignsService.setStatus(id, status)),
    complete: useAction((id: string) => campaignsService.complete(id)),
    remove: useAction((id: string) => campaignsService.remove(id)),
    links: useAction(({ id, kind, ids, linked }: { id: string; kind: "projects" | "tasks" | "habits"; ids: string[]; linked: boolean }) => campaignsService.links(id, kind, ids, linked)),
    addMilestone: useAction(({ id, m: ms }: { id: string; m: Parameters<typeof campaignsService.addMilestone>[1] }) => campaignsService.addMilestone(id, ms)),
    updateMilestone: useAction(({ id, mid, m: ms }: { id: string; mid: string; m: Parameters<typeof campaignsService.updateMilestone>[2] }) => campaignsService.updateMilestone(id, mid, ms)),
    removeMilestone: useAction(({ id, mid }: { id: string; mid: string }) => campaignsService.removeMilestone(id, mid)),
    reorder: useAction(({ id, ids }: { id: string; ids: string[] }) => campaignsService.reorderMilestones(id, ids)),
    milestoneDone: useAction(({ id, mid, done }: { id: string; mid: string; done: boolean }) => campaignsService.milestoneDone(id, mid, done)),
  };
}
