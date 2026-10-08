import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { intelligenceService, type ObjectiveKey } from "@/services/intelligenceService";

const KEY = ["intelligence"] as const;

/**
 * Forja da Inteligência. A visão geral só lê resultados já calculados no
 * servidor (barata); forjar e atualizar o grimório são ações explícitas.
 */
export function useIntelligence() {
  const qc = useQueryClient();
  const overview = useQuery({ queryKey: [...KEY, "overview"], queryFn: intelligenceService.overview, staleTime: 5 * 60_000 });
  const forge = useMutation({
    mutationFn: (objective: ObjectiveKey) => intelligenceService.forge(objective),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
  const refreshGrimoire = useMutation({
    mutationFn: intelligenceService.refreshGrimoire,
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...KEY, "overview"] }),
  });
  return { ...overview, forge, refreshGrimoire };
}

export function useArtifactDetail(id: string | null) {
  return useQuery({ queryKey: [...KEY, "artifact", id], queryFn: () => intelligenceService.artifact(id as string), enabled: !!id, staleTime: 5 * 60_000 });
}

export function useExperiments(enabled: boolean) {
  return useQuery({ queryKey: [...KEY, "experiments"], queryFn: intelligenceService.experiments, enabled, staleTime: 5 * 60_000 });
}
