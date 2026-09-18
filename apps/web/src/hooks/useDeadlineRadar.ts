import { useQuery } from "@tanstack/react-query";
import { deadlineRadarService } from "@/services/deadlineRadarService";
import type { DeadlinePeriodFilter } from "@/types";

/** Dashboard agregado do Deadline Radar (KPIs, itens críticos, risco, tendência) para o filtro de período. */
export function useDeadlineRadar(period: DeadlinePeriodFilter) {
  return useQuery({
    queryKey: ["deadline-radar", period],
    queryFn: () => deadlineRadarService.dashboard(period),
  });
}
