import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { reviewsService } from "@/services/reviewsService";
import { warCouncilService, type CouncilFocusRef, type CouncilSealInput } from "@/services/warCouncilService";

export function useWarCouncil(weekStart?: string) {
  const qc = useQueryClient();
  const overview = useQuery({ queryKey: ["war-council", weekStart ?? "default"], queryFn: () => warCouncilService.overview(weekStart) });
  const proposal = useMutation({ mutationFn: ({ week, focus }: { week: string; focus: CouncilFocusRef[] }) => warCouncilService.proposal(week, focus) });
  const seal = useMutation({
    mutationFn: (input: CouncilSealInput) => warCouncilService.seal(input),
    onSuccess: () => {
      // Datas planejadas, Agenda, XP e Timeline mudam juntos.
      for (const k of ["war-council", "tasks", "events", "calendar", "capacity", "gamification", "analytics"]) void qc.invalidateQueries({ queryKey: [k] });
    },
  });
  return { overview, proposal, seal };
}

/** Resumo da semana passada — o mesmo cálculo da Revisão Semanal (nada recalculado à parte). */
export function usePreviousWeekSummary(previousWeekStart: string | undefined) {
  return useQuery({
    queryKey: ["reviews", "weekly-compute", previousWeekStart],
    queryFn: () => reviewsService.computeWeekly(previousWeekStart!),
    enabled: !!previousWeekStart,
    staleTime: 5 * 60_000,
  });
}
