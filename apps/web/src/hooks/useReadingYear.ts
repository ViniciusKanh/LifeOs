import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { readingYearService, type QuoteKind } from "@/services/readingYearService";

export function useReadingYear(year?: number) {
  const qc = useQueryClient();
  const summary = useQuery({ queryKey: ["reading", "year", year ?? "current"], queryFn: () => readingYearService.summary(year) });
  const saveGoal = useMutation({
    mutationFn: ({ year: y, booksTarget, pagesTarget }: { year: number; booksTarget: number | null; pagesTarget: number | null }) =>
      readingYearService.saveGoal(y, { booksTarget, pagesTarget }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["reading", "year"] }),
  });
  const removeGoal = useMutation({
    mutationFn: (y: number) => readingYearService.removeGoal(y),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["reading", "year"] }),
  });
  return { ...summary, saveGoal, removeGoal };
}

export function useQuotes(opts: { bookId?: string; q?: string; kinds?: QuoteKind[] }) {
  return useQuery({ queryKey: ["reading", "quotes", opts], queryFn: () => readingYearService.quotes(opts), placeholderData: (prev) => prev });
}
