import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { lifeMapService } from "@/services/lifeMapService";
import type { CreateLifeMapLinkInput } from "@/types";

const LIFEMAP_KEY = ["lifemap"];

/** Life Map — grafo de conexões entre metas, projetos, hábitos, educação, leitura, saúde e vida profissional. */
export function useLifeMap() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: LIFEMAP_KEY, queryFn: lifeMapService.get });

  const createLink = useMutation({
    mutationFn: (input: CreateLifeMapLinkInput) => lifeMapService.createLink(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIFEMAP_KEY }),
  });

  const deleteLink = useMutation({
    mutationFn: (linkId: string) => lifeMapService.deleteLink(linkId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIFEMAP_KEY }),
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    createLink: createLink.mutateAsync,
    isCreatingLink: createLink.isPending,
    createLinkError: createLink.error as Error | null,
    deleteLink: deleteLink.mutateAsync,
    isDeletingLink: deleteLink.isPending,
  };
}
