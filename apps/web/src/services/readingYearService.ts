import { api } from "./api";

/** Espelho de /api/reading — meta anual (progresso derivado no servidor) e mural de citações. */

export type PaceStatus = "adiantado" | "no_ritmo" | "atrasado" | "sem_dados";

export interface TargetProgress {
  target: number;
  done: number;
  pct: number;
  expectedByNow: number;
  projected: number | null;
  status: PaceStatus;
  remainingPerDay: number | null;
}

export interface ReadingYearSummary {
  year: number;
  today: string;
  timezone: string;
  isCurrentYear: boolean;
  dayOfYear: number;
  daysInYear: number;
  goal: { booksTarget: number | null; pagesTarget: number | null } | null;
  booksFinished: number;
  pagesRead: number;
  books: TargetProgress | null;
  pages: TargetProgress | null;
  finishedList: Array<{ id: string; title: string; author: string | null; coverUrl: string | null; finishedDay: string }>;
}

export type QuoteKind = "quote" | "insight" | "note" | "summary" | "idea";

export interface QuoteItem {
  id: string;
  bookId: string;
  bookTitle: string;
  bookAuthor: string | null;
  coverUrl: string | null;
  kind: QuoteKind;
  content: string;
  page: number | null;
  createdAt: string;
  cardCount: number;
}

export const readingYearService = {
  summary: (year?: number) => api.get<ReadingYearSummary>(`/reading/year${year ? `?year=${year}` : ""}`),
  saveGoal: (year: number, input: { booksTarget: number | null; pagesTarget: number | null }) => api.put<ReadingYearSummary>(`/reading/year/${year}`, input),
  removeGoal: (year: number) => api.delete<void>(`/reading/year/${year}`),
  quotes: (opts: { bookId?: string; q?: string; kinds?: QuoteKind[] } = {}) => {
    const p = new URLSearchParams();
    if (opts.bookId) p.set("bookId", opts.bookId);
    if (opts.q?.trim()) p.set("q", opts.q.trim());
    if (opts.kinds?.length) p.set("kinds", opts.kinds.join(","));
    const s = p.toString();
    return api.get<QuoteItem[]>(`/reading/quotes${s ? `?${s}` : ""}`);
  },
};
