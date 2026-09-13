import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { habitService } from "@/services/habitService";
import type { Habit } from "@/types";

const HABITS_KEY = ["habits"];
const SUMMARY_KEY = ["habits", "summary"];
const STATS_KEY = ["habits", "stats"];

export function useHabits() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: HABITS_KEY });
    queryClient.invalidateQueries({ queryKey: SUMMARY_KEY });
    queryClient.invalidateQueries({ queryKey: STATS_KEY });
  };

  const habitsQuery = useQuery({ queryKey: HABITS_KEY, queryFn: habitService.list });
  const summaryQuery = useQuery({ queryKey: SUMMARY_KEY, queryFn: habitService.summary });
  const statsQuery = useQuery({ queryKey: STATS_KEY, queryFn: () => habitService.stats(30) });

  const createHabit = useMutation({ mutationFn: habitService.create, onSuccess: invalidate });
  const updateHabit = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof habitService.update>[1] }) =>
      habitService.update(id, patch),
    onSuccess: invalidate,
  });
  const removeHabit = useMutation({ mutationFn: habitService.remove, onSuccess: invalidate });
  const checkIn = useMutation({
    mutationFn: ({ id, entryDate, count }: { id: string; entryDate: string; count?: number }) =>
      habitService.checkIn(id, entryDate, count),
    onSuccess: invalidate,
  });

  const summaryByHabitId = new Map((summaryQuery.data ?? []).map((s) => [s.habitId, s]));

  return {
    habits: habitsQuery.data ?? [],
    summaryByHabitId,
    stats: statsQuery.data ?? null,
    isLoading: habitsQuery.isLoading,
    createHabit: createHabit.mutateAsync,
    updateHabit: updateHabit.mutateAsync,
    removeHabit: removeHabit.mutateAsync,
    checkIn: checkIn.mutateAsync,
  };
}

/**
 * Busca os check-ins reais de um período (ex.: a semana atual) para cada
 * hábito informado, em paralelo — usado pela grade "Meus hábitos" para
 * mostrar quais dias já foram cumpridos de verdade (nunca um estado fixo).
 */
export function useHabitEntriesRange(habits: Habit[], from: string, to: string) {
  const results = useQueries({
    queries: habits.map((h) => ({
      queryKey: ["habits", h.id, "entries", from, to],
      queryFn: () => habitService.entries(h.id, from, to),
      enabled: !!h.id,
    })),
  });

  const entriesByHabitId = new Map<string, Set<string>>();
  habits.forEach((h, i) => {
    const rows = results[i]?.data ?? [];
    entriesByHabitId.set(h.id, new Set(rows.filter((r) => r.count >= h.target_count).map((r) => r.entry_date)));
  });

  return entriesByHabitId;
}
