import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { inboxService, type ProcessInboxInput } from "@/services/inboxService";

const INBOX_KEY = ["inbox"];

function useInboxInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: INBOX_KEY });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["analytics"] });
  };
}

/** Página de Inbox: lista limitada + estatísticas leves vindas do backend. */
export function useInbox(includeProcessed = false) {
  const invalidate = useInboxInvalidation();
  const query = useQuery({
    queryKey: [...INBOX_KEY, includeProcessed],
    queryFn: () => inboxService.list(includeProcessed),
  });
  const statsQuery = useQuery({ queryKey: [...INBOX_KEY, "stats"], queryFn: inboxService.stats });

  const capture = useMutation({ mutationFn: (content: string) => inboxService.create(content), onSuccess: invalidate });
  const process = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ProcessInboxInput }) => inboxService.process(id, input),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: (id: string) => inboxService.remove(id), onSuccess: invalidate });

  return {
    items: query.data ?? [],
    stats: statsQuery.data ?? { pending: 0, processedLast7d: 0, capturedLast7d: 0 },
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
    capture: capture.mutateAsync,
    isCapturing: capture.isPending,
    captureError: capture.error as Error | null,
    process: process.mutateAsync,
    isProcessing: process.isPending,
    remove: remove.mutateAsync,
  };
}

/** Captura rápida global: não carrega a lista do Inbox em todas as páginas. */
export function useInboxCapture() {
  const invalidate = useInboxInvalidation();
  const capture = useMutation({ mutationFn: (content: string) => inboxService.create(content), onSuccess: invalidate });

  return {
    capture: capture.mutateAsync,
    isCapturing: capture.isPending,
    captureError: capture.error as Error | null,
  };
}
