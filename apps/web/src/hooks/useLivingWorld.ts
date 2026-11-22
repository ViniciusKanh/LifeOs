import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { livingWorldService, type WorldSettings } from "@/services/livingWorldService";

export const WORLD_KEY = ["world"] as const;

/**
 * Estado do Meu Mundo. Sem infraestrutura de tempo real no LifeOS, a
 * sincronização é por consulta: ao abrir, ao voltar para a aba e a cada
 * 60 s com a tela visível (barato: uma leitura agregada).
 */
export function useLivingWorld() {
  return useQuery({ queryKey: WORLD_KEY, queryFn: livingWorldService.get, refetchInterval: 5 * 60_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true });
}

export function useWorldActions() {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: WORLD_KEY });
  return {
    refresh,
    saveSettings: useMutation({
      mutationFn: (patch: Partial<WorldSettings>) => livingWorldService.saveSettings(patch),
      onSuccess: refresh,
    }),
    saveAvatar: useMutation({ mutationFn: livingWorldService.saveAvatar, onSuccess: refresh }),
    saveAgentLook: useMutation({
      mutationFn: ({ key, ...body }: { key: string; look?: Parameters<typeof livingWorldService.saveAgentLook>[1]["look"]; nickname?: string | null }) => livingWorldService.saveAgentLook(key, body),
      onSuccess: refresh,
    }),
    runAgent: useMutation({
      mutationFn: ({ key, question }: { key: string; question: string | null }) => livingWorldService.runAgent(key, question),
      onSettled: () => {
        refresh();
        void qc.invalidateQueries({ queryKey: ["world", "runs"] });
      },
    }),
    placeDecor: useMutation({
      mutationFn: ({ slot, itemKey }: { slot: string; itemKey: string }) => livingWorldService.placeDecor(slot, itemKey),
      onSuccess: () => {
        refresh();
        void qc.invalidateQueries({ queryKey: ["world", "decor-items"] });
      },
    }),
    removeDecor: useMutation({ mutationFn: (slot: string) => livingWorldService.removeDecor(slot), onSuccess: refresh }),
  };
}

export function useDecorItems(enabled: boolean) {
  return useQuery({ queryKey: ["world", "decor-items"], queryFn: livingWorldService.decorItems, enabled });
}

export function useAgentRuns(key: string | null) {
  return useQuery({ queryKey: ["world", "runs", key], queryFn: () => livingWorldService.agentRuns(key!), enabled: !!key });
}
