import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { questsService } from "@/services/questsService";
import { notifyGamification } from "@/services/gamificationService";

// Sob "gamification": XP novo (missão, hábito...) já invalida o quadro junto com o perfil.
export const QUESTS_KEY = ["gamification", "quests"] as const;

/** Quadro de Quests + temporada. O progresso é ao vivo, então o cache é curto. */
export function useQuests(enabled = true) {
  const qc = useQueryClient();
  const board = useQuery({ queryKey: QUESTS_KEY, queryFn: questsService.board, enabled, staleTime: 30_000 });
  const claim = useMutation({
    mutationFn: (id: string) => questsService.claim(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUESTS_KEY });
      // O feedback global (+XP, som, selo) reage ao XP confirmado pelo backend.
      notifyGamification();
    },
  });
  const reroll = useMutation({
    mutationFn: (id: string) => questsService.reroll(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: QUESTS_KEY }),
  });
  return { ...board, claim, reroll };
}
