import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { chronicleEntryService, type ScribeAction } from "@/services/chronicleEntryService";

export const useChronicleEntryMeta = (date: string) =>
  useQuery({ queryKey: ["chronicle-entry", date], queryFn: () => chronicleEntryService.meta(date), staleTime: 15_000, placeholderData: (p) => p });

/** Ações da Entrada 3.0. O Escriba e a transcrição só devolvem prévias — nada é gravado sem aprovação. */
export function useChronicleEntryActions(date: string) {
  const qc = useQueryClient();
  return {
    setGoal: useMutation({ mutationFn: (goal: number) => chronicleEntryService.setGoal(goal), onSuccess: () => void qc.invalidateQueries({ queryKey: ["chronicle-entry"] }) }),
    scribe: useMutation({ mutationFn: (action: ScribeAction) => chronicleEntryService.scribe(date, action) }),
    transcribe: useMutation({ mutationFn: (mediaId: string) => chronicleEntryService.transcribe(mediaId) }),
    toGrimoire: useMutation({
      mutationFn: (text: string) => chronicleEntryService.learningToGrimoire(date, text),
      onSuccess: () => void qc.invalidateQueries({ queryKey: ["grimoire"] }),
    }),
  };
}
