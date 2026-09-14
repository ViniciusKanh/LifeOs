import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { goalsService, type GoalCreateInput, type GoalUpdateInput } from "@/services/goalsService";
import { triggerAchievementsCheck } from "@/services/achievementsService";

const GOALS_KEY = ["goals"];
const STATS_KEY = ["goals", "stats"];

export function useGoals(params?: { parentGoalId?: string }) {
  const queryClient = useQueryClient();
  const key = [...GOALS_KEY, params?.parentGoalId ?? "all"];

  const goalsQuery = useQuery({ queryKey: key, queryFn: () => goalsService.list(params) });
  const statsQuery = useQuery({ queryKey: STATS_KEY, queryFn: goalsService.stats });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: GOALS_KEY });
    queryClient.invalidateQueries({ queryKey: STATS_KEY });
  };

  const createGoal = useMutation({ mutationFn: (input: GoalCreateInput) => goalsService.create(input), onSuccess: invalidate });
  const updateGoal = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: GoalUpdateInput }) => goalsService.update(id, patch),
    onSuccess: (_data, variables) => {
      invalidate();
      // Concluir uma meta é gatilho de conquista (ex.: "Focado em metas") — antes não disparava nenhuma checagem.
      if (variables.patch.status === "done") triggerAchievementsCheck();
    },
  });
  const removeGoal = useMutation({ mutationFn: goalsService.remove, onSuccess: invalidate });
  const addProgress = useMutation({
    mutationFn: ({ id, value, note }: { id: string; value: number; note?: string }) =>
      goalsService.addProgress(id, value, note),
    onSuccess: invalidate,
  });

  return {
    goals: goalsQuery.data ?? [],
    stats: statsQuery.data ?? null,
    isLoading: goalsQuery.isLoading,
    createGoal: createGoal.mutateAsync,
    updateGoal: updateGoal.mutateAsync,
    removeGoal: removeGoal.mutateAsync,
    addProgress: addProgress.mutateAsync,
  };
}

export function useGoalDetail(id: string | undefined) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["goals", "detail", id],
    queryFn: () => goalsService.get(id as string),
    enabled: !!id,
  });

  const addProgress = useMutation({
    mutationFn: (input: { value: number; note?: string }) => goalsService.addProgress(id as string, input.value, input.note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals", "detail", id] });
      queryClient.invalidateQueries({ queryKey: GOALS_KEY });
    },
  });

  return { goal: query.data ?? null, isLoading: query.isLoading, addProgress: addProgress.mutateAsync };
}
