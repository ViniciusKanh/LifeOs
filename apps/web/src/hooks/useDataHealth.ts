import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dataHealthService } from "@/services/dataHealthService";

const DATA_HEALTH_KEY = ["data-health"];

/** Data Health — qualidade, integridade e cobertura dos dados do usuário. */
export function useDataHealth() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: DATA_HEALTH_KEY, queryFn: dataHealthService.get });

  const recheck = useMutation({
    mutationFn: dataHealthService.recheck,
    onSuccess: (data) => queryClient.setQueryData(DATA_HEALTH_KEY, data),
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    recheck: recheck.mutateAsync,
    isRechecking: recheck.isPending,
  };
}
