import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { codexService, type AttributeKey } from "@/services/codexService";
import { notifyGamification } from "@/services/gamificationService";
import { useGamificationProfile } from "@/hooks/useGamification";
import { useRpgPreferences } from "@/hooks/useRpgPreferences";

const KEY = ["codex"] as const;

export function useCodex(enabled = true) {
  return useQuery({ queryKey: KEY, queryFn: codexService.get, enabled, staleTime: 60_000 });
}

export function useAttributeDetail(key: AttributeKey | null) {
  return useQuery({ queryKey: [...KEY, "attr", key], queryFn: () => codexService.attribute(key!), enabled: !!key, staleTime: 60_000 });
}

export function useCodexMilestones(enabled = true) {
  return useQuery({ queryKey: [...KEY, "milestones"], queryFn: codexService.milestones, enabled, staleTime: 60_000 });
}

export function useCodexActions() {
  const qc = useQueryClient();
  const seen = useMutation({
    mutationFn: ({ kind, ids }: { kind: "relic" | "title" | "knowledge" | "discovery"; ids: string[] }) => codexService.seen(kind, ids),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
  const buy = useMutation({
    mutationFn: (id: string) => codexService.buyKnowledge(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      notifyGamification();
    },
  });
  return { seen, buy };
}

/**
 * Título equipado (catálogo central do backend). Se o salvo não estiver
 * desbloqueado, mostra o melhor título por nível já liberado.
 */
/** Catálogo de títulos com estado de desbloqueio (recarrega quando o nível muda). */
export function useCodexTitles() {
  const { data: profile } = useGamificationProfile();
  return useQuery({ queryKey: [...KEY, "titles", profile?.level ?? 0], queryFn: codexService.titles, staleTime: 5 * 60_000 });
}

export function useEquippedTitle(): string {
  const { prefs } = useRpgPreferences();
  const { data: titles } = useCodexTitles();
  return useMemo(() => {
    if (!titles) return "";
    const unlocked = titles.filter((t) => t.unlocked);
    return (unlocked.find((t) => t.id === prefs.title) ?? unlocked[unlocked.length - 1] ?? titles[0])?.name ?? "";
  }, [titles, prefs.title]);
}
