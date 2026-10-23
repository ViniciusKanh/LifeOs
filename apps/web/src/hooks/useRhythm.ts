import { useQuery } from "@tanstack/react-query";
import { rhythmService } from "@/services/rhythmService";

/** Ritmo do herói — muda devagar; XP novo invalida "gamification". */
export function useRhythm(days = 90) {
  return useQuery({ queryKey: ["gamification", "rhythm", days], queryFn: () => rhythmService.get(days), staleTime: 10 * 60_000 });
}
