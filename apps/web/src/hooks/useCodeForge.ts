import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { codeForgeService, type CodeRules } from "@/services/codeForgeService";

const KEY = ["code-forge"] as const;

export function useCodeForge(range: "90d" | "6m" | "12m") {
  return useQuery({ queryKey: [...KEY, range], queryFn: () => codeForgeService.overview(range), staleTime: 60_000 });
}

export function useCodeForgeActions() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: KEY });
    // XP novo aparece no HUD e na Crônica.
    void qc.invalidateQueries({ queryKey: ["gamification"] });
  };
  return {
    connect: useMutation({ mutationFn: codeForgeService.connect, onSuccess: refresh }),
    sync: useMutation({ mutationFn: codeForgeService.sync, onSettled: refresh }),
    disconnect: useMutation({ mutationFn: codeForgeService.disconnect, onSuccess: refresh }),
    rules: useMutation({ mutationFn: (r: Partial<CodeRules>) => codeForgeService.rules(r), onSuccess: refresh }),
    repo: useMutation({ mutationFn: ({ id, ...p }: { id: number; monitored?: boolean; favorite?: boolean }) => codeForgeService.repo(id, p), onSuccess: refresh }),
  };
}
