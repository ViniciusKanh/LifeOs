import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { journeyReviewService, type ReviewAdvisorMode, type ReviewKind, type ReviewPatch } from "@/services/journeyReviewService";
import { triggerAchievementsCheck } from "@/services/achievementsService";
import { notifyGamification } from "@/services/gamificationService";

export const JOURNEY_REVIEW_KEY = ["journey-review"] as const;
export const useJourneyReview = (kind: ReviewKind, key: string | null) =>
  useQuery({ queryKey: [...JOURNEY_REVIEW_KEY, kind, key ?? "atual"], queryFn: () => journeyReviewService.get(kind, key), staleTime: 20_000 });

export function useJourneyReviewActions(kind: ReviewKind, key: string | null) {
  const qc = useQueryClient();
  const sync = () => {
    void qc.invalidateQueries({ queryKey: JOURNEY_REVIEW_KEY });
    for (const k of [["council"], ["planning"], ["achievements"], ["gamification"], ["timeline"]]) void qc.invalidateQueries({ queryKey: k });
  };
  const need = () => {
    if (!key) throw new Error("Período ainda carregando.");
    return key;
  };
  return {
    // Autosave: não recarrega a revisão inteira a cada gravação (a tela guarda o rascunho local e a versão-base).
    save: useMutation({ mutationFn: (patch: ReviewPatch) => journeyReviewService.save(kind, need(), patch) }),
    refresh: () => void qc.invalidateQueries({ queryKey: JOURNEY_REVIEW_KEY }),
    seal: useMutation({
      mutationFn: () => journeyReviewService.seal(kind, need()),
      onSuccess: () => {
        sync();
        triggerAchievementsCheck();
      },
    }),
    claim: useMutation({
      mutationFn: () => journeyReviewService.claim(kind, need()),
      onSuccess: () => {
        sync();
        notifyGamification();
      },
    }),
    applyPlan: useMutation({ mutationFn: () => journeyReviewService.applyPlan(kind, need()), onSuccess: sync }),
    advisor: useMutation({ mutationFn: ({ mode, question }: { mode: ReviewAdvisorMode; question?: string | null }) => journeyReviewService.advisor(kind, need(), mode, question) }),
    settings: useMutation({ mutationFn: journeyReviewService.settings, onSuccess: sync }),
  };
}
