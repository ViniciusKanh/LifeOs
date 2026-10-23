import { useQuery } from "@tanstack/react-query";
import { recordsService } from "@/services/recordsService";

/** Placar da semana (eu × eu). Atualiza junto com a gamificação (XP novo invalida "gamification"). */
export function useWeeklyRecords(enabled = true) {
  return useQuery({ queryKey: ["gamification", "records", "weekly"], queryFn: recordsService.weekly, enabled, staleTime: 2 * 60_000 });
}
