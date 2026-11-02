import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { chronicleLabService } from "@/services/chronicleLabService";

// Chaves sob o prefixo de cada módulo: salvar a crônica (["journal"]) ou um
// registro de experimento (["experiments"]) invalida o hub junto.
export const CHRONICLE_HUB_KEY = ["journal", "hub"] as const;
export const LAB_HUB_KEY = ["experiments", "hub"] as const;

export const useChronicleHub = () => useQuery({ queryKey: CHRONICLE_HUB_KEY, queryFn: chronicleLabService.chronicle, staleTime: 15_000 });
export const useLabHub = () => useQuery({ queryKey: LAB_HUB_KEY, queryFn: chronicleLabService.lab, staleTime: 15_000 });
export const useDayContext = (date: string, enabled = true) =>
  useQuery({ queryKey: ["journal", "context", date], queryFn: () => chronicleLabService.dayContext(date), enabled, staleTime: 60_000 });

export function useChronicleActions() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["journal"] });
    void qc.invalidateQueries({ queryKey: ["experiments"] });
  };
  return {
    generateRetro: useMutation({ mutationFn: ({ weekStart, useAi }: { weekStart: string; useAi: boolean }) => chronicleLabService.generateRetro(weekStart, useAi), onSuccess: refresh }),
    saveRetro: useMutation({ mutationFn: ({ weekStart, content }: { weekStart: string; content: string }) => chronicleLabService.saveRetro(weekStart, content), onSuccess: refresh }),
    deleteRetro: useMutation({ mutationFn: chronicleLabService.deleteRetro, onSuccess: refresh }),
    sendNote: useMutation({ mutationFn: ({ date, experimentId, text }: { date: string; experimentId: string; text: string }) => chronicleLabService.sendNote(date, experimentId, text), onSuccess: refresh }),
    setGoal: useMutation({ mutationFn: ({ id, goalId }: { id: string; goalId: string | null }) => chronicleLabService.setGoal(id, goalId), onSuccess: refresh }),
    explain: useMutation({ mutationFn: ({ id, question }: { id: string; question?: string }) => chronicleLabService.explain(id, question) }),
  };
}
