import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { personalSkillsService, type BranchNode, type ProofKind, type SkillDomain, type SkillInput } from "@/services/personalSkillsService";
import { triggerAchievementsCheck } from "@/services/achievementsService";

export const SKILLS_KEY = ["habilidades"] as const;
export const useSkillTree = () => useQuery({ queryKey: SKILLS_KEY, queryFn: personalSkillsService.tree, staleTime: 15_000 });
export const useSkillsSummary = (domain?: SkillDomain | null) => useQuery({ queryKey: [...SKILLS_KEY, "resumo", domain ?? null], queryFn: () => personalSkillsService.summary(domain), staleTime: 60_000 });
export const useSkillLinks = (enabled = true) => useQuery({ queryKey: [...SKILLS_KEY, "vinculos"], queryFn: personalSkillsService.links, staleTime: 5 * 60_000, enabled });
export const useProofHistory = (f: { skillId?: string | null; domain?: SkillDomain | null } = {}) =>
  useQuery({ queryKey: [...SKILLS_KEY, "historico", f.skillId ?? null, f.domain ?? null], queryFn: () => personalSkillsService.history(f), staleTime: 30_000 });
export const useSkillProofs = (skillId: string | null) => useQuery({ queryKey: [...SKILLS_KEY, "provas", skillId], queryFn: () => personalSkillsService.proofs(skillId!), enabled: !!skillId });

export function useSkillActions() {
  const qc = useQueryClient();
  const sync = () => void qc.invalidateQueries({ queryKey: SKILLS_KEY });
  // Prova aprovada mexe em XP, moedas, conquistas, títulos e Crônica.
  const syncAll = () => {
    for (const k of [SKILLS_KEY, ["codex"], ["achievements"], ["timeline"], ["gamification"], ["health"]]) void qc.invalidateQueries({ queryKey: k });
    triggerAchievementsCheck();
  };
  return {
    create: useMutation({ mutationFn: (input: SkillInput & { domain: SkillDomain; parentId?: string | null }) => personalSkillsService.create(input), onSuccess: syncAll }),
    createBranch: useMutation({ mutationFn: (input: { domain: SkillDomain; parentId?: string | null; source: "manual" | "ia"; nodes: BranchNode[] }) => personalSkillsService.createBranch(input), onSuccess: syncAll }),
    update: useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof personalSkillsService.update>[1] }) => personalSkillsService.update(id, patch), onSuccess: sync }),
    remove: useMutation({ mutationFn: (id: string) => personalSkillsService.remove(id), onSuccess: syncAll }),
    planBranch: useMutation({ mutationFn: personalSkillsService.planBranch }),
    suggestLevels: useMutation({ mutationFn: personalSkillsService.suggestLevels }),
    startProof: useMutation({ mutationFn: ({ skillId, kind }: { skillId: string; kind?: ProofKind }) => personalSkillsService.startProof(skillId, kind), onSuccess: sync }),
    saveDraft: useMutation({ mutationFn: ({ id, answers }: { id: string; answers: Record<string, string | number> }) => personalSkillsService.saveDraft(id, answers) }),
    submit: useMutation({ mutationFn: ({ id, answers }: { id: string; answers: Record<string, string | number> }) => personalSkillsService.submit(id, answers), onSuccess: syncAll }),
    abandon: useMutation({ mutationFn: (id: string) => personalSkillsService.abandon(id), onSuccess: sync }),
  };
}
