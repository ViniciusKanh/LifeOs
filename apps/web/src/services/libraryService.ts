import { api } from "./api";
import type { Book, BookLookupResult, BookNote, BookSource, BookStatus, ReadingSession } from "@/types";

export interface BookCreateInput {
  title: string;
  isbn?: string | null;
  author?: string | null;
  publisher?: string | null;
  coverUrl?: string | null;
  publishedYear?: number | null;
  totalPages?: number | null;
  categories?: string[];
  description?: string | null;
  status?: BookStatus;
  source?: BookSource;
}

export interface BookUpdateInput extends Partial<BookCreateInput> {
  currentPage?: number;
  rating?: number | null;
  personalNote?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export const libraryService = {
  list: (params?: { status?: string; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.search) qs.set("search", params.search);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return api.get<Book[]>(`/books${suffix}`);
  },
  get: (id: string) => api.get<Book>(`/books/${id}`),
  lookupIsbn: (isbn: string) => api.get<BookLookupResult>(`/books/lookup/${encodeURIComponent(isbn)}`),
  create: (input: BookCreateInput) => api.post<Book>("/books", input),
  update: (id: string, patch: BookUpdateInput) => api.patch<Book>(`/books/${id}`, patch),
  remove: (id: string) => api.delete<void>(`/books/${id}`),

  listNotes: (bookId: string) => api.get<BookNote[]>(`/books/${bookId}/notes`),
  createNote: (bookId: string, input: { kind?: BookNote["kind"]; content: string; page?: number | null }) =>
    api.post<BookNote>(`/books/${bookId}/notes`, input),
  removeNote: (bookId: string, noteId: string) => api.delete<void>(`/books/${bookId}/notes/${noteId}`),

  listSessions: (bookId: string) => api.get<ReadingSession[]>(`/books/${bookId}/sessions`),
  createSession: (
    bookId: string,
    input: { startedAt: string; endedAt?: string | null; durationMinutes?: number | null; pagesRead?: number }
  ) => api.post<ReadingSession>(`/books/${bookId}/sessions`, input),
};
