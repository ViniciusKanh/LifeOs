import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tavernService } from "@/services/tavernService";

const KEY = ["tavern"] as const;

/** Taverna (fim do dia): um único resumo + a ação confirmada de fixar a missão de amanhã. */
export function useTavern() {
  const qc = useQueryClient();
  const summary = useQuery({ queryKey: [...KEY, "summary"], queryFn: tavernService.summary, staleTime: 60_000 });
  const pin = useMutation({
    mutationFn: ({ taskId, setDueTomorrow }: { taskId: string; setDueTomorrow: boolean }) => tavernService.pinTomorrow(taskId, setDueTomorrow),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: KEY });
      // A entrada de amanhã e, se o prazo mudou, as listas de tarefas ficaram desatualizadas.
      void qc.invalidateQueries({ queryKey: ["journal", data.date] });
      if (data.dueDateChanged) void qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
  return { ...summary, pin };
}
