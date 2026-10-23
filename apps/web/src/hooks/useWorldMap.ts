import { useQuery } from "@tanstack/react-query";
import { worldmapService } from "@/services/worldmapService";

export function useWorldMap() {
  return useQuery({
    queryKey: ["worldmap"],
    queryFn: worldmapService.get,
    staleTime: 60_000,
  });
}
