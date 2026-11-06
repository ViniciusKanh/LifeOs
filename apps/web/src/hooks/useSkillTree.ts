import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { skillTreeService, type Target } from "@/services/skillTreeService";
import { triggerAchievementsCheck } from "@/services/achievementsService";

export const SKILL_TREE_KEY = ["skill-tree"] as const;
export const useSkillTree = () => useQuery({ queryKey: SKILL_TREE_KEY, queryFn: skillTreeService.get, staleTime: 15_000 });
/** Efeitos ativos consumidos por outros módulos (Hoje, Missões, Diário…). Sem efeitos = recursos opcionais ocultos. */
export const useSkillEffects = () => useQuery({ queryKey: [...SKILL_TREE_KEY, "effects"], queryFn: skillTreeService.effects, staleTime: 60_000, retry: false });

export function useSkillTreeActions() {
  const qc = useQueryClient();
  const sync = () => {
    for (const k of [SKILL_TREE_KEY, ["codex"], ["achievements"], ["timeline"], ["gamification"]]) void qc.invalidateQueries({ queryKey: k });
    triggerAchievementsCheck();
  };
  return {
    upgrade: useMutation({ mutationFn: ({ key, expectedLevel }: { key: string; expectedLevel: number }) => skillTreeService.upgrade(key, expectedLevel), onSuccess: sync }),
    simulate: useMutation({ mutationFn: (targets: Target[]) => skillTreeService.simulate(targets) }),
    apply: useMutation({ mutationFn: ({ targets, confirmed, origin }: { targets: Target[]; confirmed: Target[]; origin: "build" | "preset" | "oracle" }) => skillTreeService.apply(targets, confirmed, origin), onSuccess: sync }),
    reset: useMutation({ mutationFn: (epoch: number) => skillTreeService.reset(epoch), onSuccess: sync }),
    settings: useMutation({ mutationFn: skillTreeService.settings, onSuccess: sync }),
    createPreset: useMutation({ mutationFn: skillTreeService.createPreset, onSuccess: sync }),
    updatePreset: useMutation({ mutationFn: ({ id, input }: { id: string; input: { name: string; description?: string | null; targets: Target[] } }) => skillTreeService.updatePreset(id, input), onSuccess: sync }),
    duplicatePreset: useMutation({ mutationFn: skillTreeService.duplicatePreset, onSuccess: sync }),
    deletePreset: useMutation({ mutationFn: skillTreeService.deletePreset, onSuccess: sync }),
    desired: useMutation({ mutationFn: skillTreeService.desired, onSuccess: sync }),
    oracle: useMutation({ mutationFn: skillTreeService.oracle }),
  };
}
