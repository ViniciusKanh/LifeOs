import { useQuery } from "@tanstack/react-query";
import { goalForecastService } from "@/services/goalForecastService";
import type { GoalForecastPeriodFilter } from "@/types";

/** Dashboard preditivo do módulo Metas (previsão de conclusão, ritmo, risco) para o filtro de período. */
export function useGoalForecast(period: GoalForecastPeriodFilter) {
  return useQuery({
    queryKey: ["goal-forecast", period],
    queryFn: () => goalForecastService.dashboard(period),
  });
}
