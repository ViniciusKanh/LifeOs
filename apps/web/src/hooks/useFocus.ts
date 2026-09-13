import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { focusService } from "@/services/focusService";

const ACTIVE_KEY = ["focus", "active"];
const SUMMARY_KEY = ["focus", "summary"];
const SESSIONS_KEY = ["focus", "sessions"];

export function useFocus() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ACTIVE_KEY });
    queryClient.invalidateQueries({ queryKey: SUMMARY_KEY });
    queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
  };

  const activeQuery = useQuery({ queryKey: ACTIVE_KEY, queryFn: focusService.active, refetchInterval: 15_000 });
  const summaryQuery = useQuery({ queryKey: SUMMARY_KEY, queryFn: focusService.summary });
  const sessionsQuery = useQuery({ queryKey: SESSIONS_KEY, queryFn: () => focusService.list(10) });

  const start = useMutation({ mutationFn: focusService.start, onSuccess: invalidate });
  const stop = useMutation({
    mutationFn: ({ id, ...input }: { id: string; perceivedProductivity?: number; distractions?: number; notes?: string }) =>
      focusService.stop(id, input),
    onSuccess: invalidate,
  });

  return {
    activeSession: activeQuery.data ?? null,
    summary: summaryQuery.data ?? null,
    recentSessions: sessionsQuery.data ?? [],
    isLoading: activeQuery.isLoading,
    start: start.mutateAsync,
    stop: stop.mutateAsync,
  };
}
