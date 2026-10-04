import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { protocolsService, type ProtocolInput } from "@/services/protocolsService";

const KEY = ["protocols"] as const;

/** Protocolos: lista + escrita. Execução invalida tudo que uma ação pode ter mudado. */
export function useProtocols() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: protocolsService.list, staleTime: 30_000 });
  const refresh = () => void qc.invalidateQueries({ queryKey: KEY });
  const afterRun = () => {
    refresh();
    for (const k of ["tasks", "habits", "capacity", "timeline", "analytics"]) void qc.invalidateQueries({ queryKey: [k] });
  };
  return {
    ...query,
    create: useMutation({ mutationFn: (i: ProtocolInput) => protocolsService.create(i), onSuccess: refresh }),
    update: useMutation({ mutationFn: ({ ref, input }: { ref: string; input: ProtocolInput }) => protocolsService.update(ref, input), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (ref: string) => protocolsService.remove(ref), onSuccess: refresh }),
    clone: useMutation({ mutationFn: (key: string) => protocolsService.clone(key), onSuccess: refresh }),
    favorite: useMutation({ mutationFn: ({ ref, favorite }: { ref: string; favorite: boolean }) => protocolsService.favorite(ref, favorite), onSuccess: refresh }),
    execute: useMutation({ mutationFn: ({ ref, ...body }: { ref: string; requestId: string; steps: Array<{ ref: string; selected: boolean; taskId?: string | null }> }) => protocolsService.execute(ref, body), onSuccess: afterRun }),
    updateRunStep: useMutation({ mutationFn: ({ runId, stepRef, status }: { runId: string; stepRef: string; status: "completed" | "skipped" }) => protocolsService.updateRunStep(runId, stepRef, status), onSuccess: afterRun }),
    cancelRun: useMutation({ mutationFn: (runId: string) => protocolsService.cancelRun(runId), onSuccess: afterRun }),
  };
}

export function useProtocolRuns(enabled = true) {
  return useQuery({ queryKey: [...KEY, "runs"], queryFn: protocolsService.runs, enabled });
}

/** Sugestões de protocolo (gatilho ativo) e missão principal do dia — usado pela tela Hoje. */
export function useProtocolSuggestions(enabled = true) {
  return useQuery({ queryKey: [...KEY, "suggestions"], queryFn: protocolsService.suggestions, enabled, staleTime: 60_000 });
}
