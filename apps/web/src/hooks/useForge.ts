import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { forgeService } from "@/services/forgeService";
import { notifyGamification } from "@/services/gamificationService";

export const FORGE_KEY = ["forge"] as const;
export const useForgeOverview = () => useQuery({ queryKey: FORGE_KEY, queryFn: forgeService.overview, staleTime: 20_000 });
export const useForgeDictionary = () => useQuery({ queryKey: [...FORGE_KEY, "dictionary"], queryFn: forgeService.dictionary, staleTime: Infinity });

/** Ações da Forja. Treinos e análises são sempre disparados por clique do usuário. */
export function useForgeActions() {
  const qc = useQueryClient();
  const sync = () => {
    void qc.invalidateQueries({ queryKey: FORGE_KEY });
    void qc.invalidateQueries({ queryKey: ["tavern3"] });
    notifyGamification();
  };
  // Mesmo número de hooks em toda renderização (ordem fixa).
  const useM = <A, R>(fn: (a: A) => Promise<R>) => useMutation({ mutationFn: fn, onSuccess: sync });
  return {
    analyze: useM(() => forgeService.analyze()),
    create: useM(forgeService.createModel),
    fromTemplate: useM(forgeService.fromTemplate),
    update: useM(({ id, input }: { id: string; input: Parameters<typeof forgeService.updateModel>[1] }) => forgeService.updateModel(id, input)),
    archive: useM(({ id, archived }: { id: string; archived: boolean }) => forgeService.archive(id, archived)),
    remove: useM(forgeService.remove),
    train: useM(forgeService.train),
    backtest: useM(forgeService.backtest),
    monitor: useM(forgeService.monitor),
    activate: useM(({ id, vid }: { id: string; vid: string }) => forgeService.activate(id, vid)),
    archiveVersion: useM(({ id, vid }: { id: string; vid: string }) => forgeService.archiveVersion(id, vid)),
    deactivate: useM(forgeService.deactivate),
    refreshPredictions: useM(() => forgeService.refreshPredictions()),
    archiveRun: useM(forgeService.archiveRun),
  };
}
