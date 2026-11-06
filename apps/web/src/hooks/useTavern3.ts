import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tavern3Service } from "@/services/tavern3Service";
import { notifyGamification } from "@/services/gamificationService";

export const TAVERN3_KEY = ["tavern3"] as const;
export const useTavern3 = () => useQuery({ queryKey: TAVERN3_KEY, queryFn: tavern3Service.get, staleTime: 15_000 });

/** Ações da Taverna: tudo atualiza o ritual, o Diário, Hoje e a gamificação. */
export function useTavern3Actions() {
  const qc = useQueryClient();
  const sync = () => {
    for (const k of [TAVERN3_KEY, ["journal"], ["chronicle-entry"], ["today-hub"], ["gamification"], ["events"], ["tasks"]]) void qc.invalidateQueries({ queryKey: k });
  };
  return {
    sync,
    saveRitual: useMutation({ mutationFn: tavern3Service.saveRitual, onSuccess: () => void qc.invalidateQueries({ queryKey: TAVERN3_KEY }) }),
    saveJournal: useMutation({ mutationFn: tavern3Service.saveJournal, onSuccess: sync }),
    settings: useMutation({ mutationFn: tavern3Service.settings, onSuccess: sync }),
    focusBlock: useMutation({ mutationFn: tavern3Service.focusBlock, onSuccess: sync }),
    tomorrowTask: useMutation({ mutationFn: tavern3Service.tomorrowTask, onSuccess: sync }),
    close: useMutation({
      mutationFn: tavern3Service.close,
      onSuccess: () => {
        sync();
        notifyGamification();
      },
    }),
  };
}
