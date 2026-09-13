import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { libraryService, type BookUpdateInput } from "@/services/libraryService";
import { triggerAchievementsCheck } from "@/services/achievementsService";
import type { BookNote } from "@/types";

const BOOKS_KEY = ["books"];
const bookKey = (id: string) => ["books", id];
const notesKey = (bookId: string) => ["books", bookId, "notes"];
const sessionsKey = (bookId: string) => ["books", bookId, "sessions"];

export function useBooks(filters?: { status?: string; search?: string }) {
  const queryClient = useQueryClient();

  const booksQuery = useQuery({
    queryKey: [...BOOKS_KEY, filters ?? {}],
    queryFn: () => libraryService.list(filters),
  });

  const createBook = useMutation({
    mutationFn: libraryService.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BOOKS_KEY }),
  });

  const updateBook = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: BookUpdateInput }) => libraryService.update(id, patch),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: BOOKS_KEY });
      queryClient.invalidateQueries({ queryKey: bookKey(vars.id) });
      // Terminar um livro é o gatilho das conquistas de leitura ("Leitor assíduo", "Bibliófilo").
      if (vars.patch.status === "Concluído") triggerAchievementsCheck();
    },
  });

  const removeBook = useMutation({
    mutationFn: libraryService.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BOOKS_KEY }),
  });

  return {
    books: booksQuery.data ?? [],
    isLoading: booksQuery.isLoading,
    createBook: createBook.mutateAsync,
    updateBook: updateBook.mutate,
    removeBook: removeBook.mutateAsync,
  };
}

/** Busca metadados por ISBN sob demanda (não é uma query em cache — é um lookup pontual). */
export function useIsbnLookup() {
  return useMutation({ mutationFn: (isbn: string) => libraryService.lookupIsbn(isbn) });
}

export function useBook(id: string | undefined) {
  const queryClient = useQueryClient();

  const bookQuery = useQuery({
    queryKey: id ? bookKey(id) : ["books", "none"],
    queryFn: () => libraryService.get(id as string),
    enabled: !!id,
  });

  const notesQuery = useQuery({
    queryKey: id ? notesKey(id) : ["books", "none", "notes"],
    queryFn: () => libraryService.listNotes(id as string),
    enabled: !!id,
  });

  const sessionsQuery = useQuery({
    queryKey: id ? sessionsKey(id) : ["books", "none", "sessions"],
    queryFn: () => libraryService.listSessions(id as string),
    enabled: !!id,
  });

  const addNote = useMutation({
    mutationFn: (input: { kind?: BookNote["kind"]; content: string; page?: number | null }) =>
      libraryService.createNote(id as string, input),
    onSuccess: () => id && queryClient.invalidateQueries({ queryKey: notesKey(id) }),
  });

  const removeNote = useMutation({
    mutationFn: (noteId: string) => libraryService.removeNote(id as string, noteId),
    onSuccess: () => id && queryClient.invalidateQueries({ queryKey: notesKey(id) }),
  });

  const addSession = useMutation({
    mutationFn: (input: { startedAt: string; endedAt?: string | null; durationMinutes?: number | null; pagesRead?: number }) =>
      libraryService.createSession(id as string, input),
    onSuccess: () => {
      if (!id) return;
      queryClient.invalidateQueries({ queryKey: sessionsKey(id) });
      queryClient.invalidateQueries({ queryKey: bookKey(id) });
      queryClient.invalidateQueries({ queryKey: BOOKS_KEY });
    },
  });

  return {
    book: bookQuery.data,
    isLoading: bookQuery.isLoading,
    notes: notesQuery.data ?? [],
    sessions: sessionsQuery.data ?? [],
    addNote: addNote.mutateAsync,
    removeNote: removeNote.mutateAsync,
    addSession: addSession.mutateAsync,
  };
}
