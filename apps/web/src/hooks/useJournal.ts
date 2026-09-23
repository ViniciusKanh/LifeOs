import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { journalService, type JournalUpsertInput } from "@/services/journalService";

/** Uma entrada por data — reaproveitado pela tela Diário e, futuramente, por qualquer resumo do dia. */
export function useJournal(date: string) {
  const queryClient = useQueryClient();
  const key = ["journal", date];

  const query = useQuery({ queryKey: key, queryFn: () => journalService.get(date) });

  const save = useMutation({
    mutationFn: (input: JournalUpsertInput) => journalService.save(date, input),
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
      queryClient.invalidateQueries({ queryKey: ["analytics", "timeline"] });
    },
  });

  return {
    entry: query.data ?? null,
    isLoading: query.isLoading,
    save: save.mutateAsync,
    isSaving: save.isPending,
  };
}
