import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { contextService } from "@/services/contextService";
import type { ContextPeriod, UpdateContextLocationInput } from "@/types";

export function useContextToday(period: ContextPeriod) {
  return useQuery({
    queryKey: ["context", "today", period],
    queryFn: () => contextService.today(period),
  });
}

export function useContextLocation() {
  return useQuery({ queryKey: ["context", "location"], queryFn: contextService.location });
}

export function useUpdateContextLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateContextLocationInput) => contextService.updateLocation(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["context"] });
      queryClient.invalidateQueries({ queryKey: ["signals"] });
    },
  });
}
