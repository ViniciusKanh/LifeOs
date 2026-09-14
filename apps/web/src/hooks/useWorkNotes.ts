import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { workNotesService, type WorkNoteInput } from "@/services/workNotesService";

const WORK_NOTES_KEY = ["work-notes"];

/** Reuniões 1:1 e anotações recorrentes de trabalho — log cronológico simples (Área Profissional). */
export function useWorkNotes(limit = 30) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: [...WORK_NOTES_KEY, limit], queryFn: () => workNotesService.list(limit) });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: WORK_NOTES_KEY });

  const createNote = useMutation({ mutationFn: (input: WorkNoteInput) => workNotesService.create(input), onSuccess: invalidate });
  const removeNote = useMutation({ mutationFn: (id: string) => workNotesService.remove(id), onSuccess: invalidate });

  return {
    notes: query.data ?? [],
    isLoading: query.isLoading,
    createNote: createNote.mutateAsync,
    isCreating: createNote.isPending,
    removeNote: removeNote.mutateAsync,
  };
}
