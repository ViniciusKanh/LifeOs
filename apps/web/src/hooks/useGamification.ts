import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gamificationService, type RedemptionStatus, type RewardInput, type XpSettings } from "@/services/gamificationService";

const KEY = ["gamification"] as const;

export function useGamificationProfile(enabled = true) {
  // O perfil soma todo o XP no servidor: cache de 5 min, renovado por
  // notifyGamification() sempre que uma ação rende XP.
  return useQuery({ queryKey: [...KEY, "profile"], queryFn: gamificationService.profile, enabled, staleTime: 5 * 60_000 });
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
  // Sem atualização otimista: a UI só muda depois que o backend confirma o débito.
  const redeem = useMutation({ mutationFn: ({ id, requestId }: { id: string; requestId?: string }) => gamificationService.redeem(id, requestId), onSuccess: invalidate });
  const createBatch = useMutation({ mutationFn: (items: RewardInput[]) => gamificationService.createRewardsBatch(items), onSuccess: invalidate });

  return { ...query, rewards: query.data ?? [], create, update, remove, redeem, createBatch };
}

/** Tela Tesouro & Recompensas: KPIs, recompensas, inventário, histórico e metas raras. */
export function useTreasure() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: [...KEY, "treasure"], queryFn: gamificationService.treasure, staleTime: 15_000 });
  const invalidate = () => qc.invalidateQueries({ queryKey: KEY });
  const consume = useMutation({ mutationFn: (redemptionId: string) => gamificationService.useRedemption(redemptionId), onSuccess: invalidate });
  const cancelItem = useMutation({ mutationFn: (redemptionId: string) => gamificationService.cancelRedemption(redemptionId), onSuccess: invalidate });
  return { ...query, consume, cancelItem };
}

/** Datas reais de cada subida de nível (derivadas do ledger no backend). */
export function useLevelHistory(enabled = true) {
  return useQuery({ queryKey: [...KEY, "levels"], queryFn: gamificationService.levels, enabled, staleTime: 60_000 });
}

/** Resumo real da carteira (ganho/gasto) para a Loja. */
export function useWallet(enabled = true) {
  return useQuery({ queryKey: [...KEY, "wallet"], queryFn: gamificationService.wallet, enabled, staleTime: 30_000 });
}

export function useRedemptions(status?: RedemptionStatus, limit = 30, enabled = true) {
  return useQuery({ queryKey: [...KEY, "redemptions", status ?? "all", limit], queryFn: () => gamificationService.redemptions(status, limit), enabled });
}

/** XP/moedas por dificuldade e por prioridade do próprio usuário (Perfil e Missões). */
export function useDifficultySettings(enabled = true) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: [...KEY, "settings"], queryFn: gamificationService.settings, enabled, staleTime: 5 * 60_000 });
  const save = useMutation({
    mutationFn: (input: Partial<XpSettings>) => gamificationService.saveSettings(input),
    onSuccess: (data) => {
      qc.setQueryData([...KEY, "settings"], data);
      void qc.invalidateQueries({ queryKey: ["contracts"] });
      void qc.invalidateQueries({ queryKey: [...KEY, "projects"] });
    },
  });
  return { ...query, rewards: query.data?.difficulty, priority: query.data?.priority, save };
}
