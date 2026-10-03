import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gamificationService, type RewardInput } from "@/services/gamificationService";

const KEY = ["gamification"] as const;

export function useGamificationProfile(enabled = true) {
  return useQuery({ queryKey: [...KEY, "profile"], queryFn: gamificationService.profile, enabled, staleTime: 30_000 });
}

export function useXpHistory(days = 30, enabled = true) {
  return useQuery({ queryKey: [...KEY, "history", days], queryFn: () => gamificationService.history(days), enabled, staleTime: 60_000 });
}

export function useProjectsXp(enabled = true) {
  return useQuery({ queryKey: [...KEY, "projects"], queryFn: gamificationService.projects, enabled, staleTime: 60_000 });
}

/** Valores públicos das regras — mudam só em deploy, então cache longo. */
export function useGamificationRules(enabled = true) {
  return useQuery({ queryKey: [...KEY, "rules"], queryFn: gamificationService.rules, enabled, staleTime: 60 * 60_000 });
}

export function useRewards(includeInactive = false) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: [...KEY, "rewards", includeInactive], queryFn: () => gamificationService.rewards(includeInactive) });
  const invalidate = () => qc.invalidateQueries({ queryKey: KEY });

  const create = useMutation({ mutationFn: (input: RewardInput) => gamificationService.createReward(input), onSuccess: invalidate });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<RewardInput> }) => gamificationService.updateReward(id, input),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: (id: string) => gamificationService.removeReward(id), onSuccess: invalidate });
  const redeem = useMutation({ mutationFn: (id: string) => gamificationService.redeem(id), onSuccess: invalidate });

  return { ...query, rewards: query.data ?? [], create, update, remove, redeem };
}

export function useRedemptions() {
  return useQuery({ queryKey: [...KEY, "redemptions"], queryFn: gamificationService.redemptions });
}
