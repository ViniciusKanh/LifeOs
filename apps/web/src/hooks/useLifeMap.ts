import { useQuery } from "@tanstack/react-query";
import { lifeMapService } from "@/services/lifeMapService";

const LIFEMAP_KEY = ["lifemap"];

/** Life Map — grafo de conexões entre metas, projetos, hábitos, educação, leitura e saúde. */
export function useLifeMap() {
  const query = useQuery({ queryKey: LIFEMAP_KEY, queryFn: lifeMapService.get });
  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
