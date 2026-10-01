import { useQuery } from "@tanstack/react-query";
import { professionalService } from "@/services/professionalService";
import { localIsoDate } from "@/utils/dashboardMetrics";

/**
 * Visão cruzada da área Profissional. Fica sob ["analytics"] porque
 * depende de tarefas, saúde, hábitos e anotações — todas essas mutações
 * já invalidam "analytics".
 */
export function useProfessionalOverview() {
  const today = localIsoDate();
  const query = useQuery({ queryKey: ["analytics", "professional", today], queryFn: () => professionalService.overview(today) });
  return { overview: query.data ?? null, isLoading: query.isLoading, isError: query.isError };
}
