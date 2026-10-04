import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { buildService, type EvolutionPeriod } from "@/services/buildService";

const KEY = ["build"] as const;

/** Build do Personagem: leitura + build desejada + plano (aplicado só após confirmação). */
export function useBuild() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: buildService.overview, staleTime: 60_000 });
  const refresh = () => void qc.invalidateQueries({ queryKey: KEY });
  const saveDesired = useMutation({ mutationFn: buildService.saveDesired, onSuccess: refresh });
  const resetDesired = useMutation({ mutationFn: buildService.resetDesired, onSuccess: refresh });
  const applyPlan = useMutation({
    mutationFn: buildService.applyPlan,
    onSuccess: () => {
      refresh();
      void qc.invalidateQueries({ queryKey: ["habits"] });
      void qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
  return { ...query, saveDesired, resetDesired, applyPlan };
}

export function useBuildEvolution(period: EvolutionPeriod, enabled = true) {
  return useQuery({ queryKey: [...KEY, "evolution", period], queryFn: () => buildService.evolution(period), enabled, staleTime: 5 * 60_000 });
}
