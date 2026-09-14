import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { inboxService, type ProcessInboxInput } from "@/services/inboxService";

const INBOX_KEY = ["inbox"];

/**
 * Notas rápidas / Inbox — captura de uma linha, sem formulário, para
 * reduzir o atrito de "onde eu anoto isso agora". `capture` é usado
 * pelo botão flutuante (disponível em qualquer tela do app); a lista
 * de pendentes alimenta a página /inbox, onde cada item é processado
 * (vira tarefa ou é descartado).
 *
 * Sempre buscamos a lista completa (pendentes + processados) uma
 * única vez — o filtro por `includeProcessed` acontece no cliente.
 * Isso mantém um único cache compartilhado entre o botão flutuante e
 * a página de Inbox (antes eram duas chaves de query diferentes) e
 * permite calcular estatísticas (processados, total capturado) sem
 * uma segunda requisição.
 */
export function useInbox(includeProcessed = false) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: INBOX_KEY, queryFn: () => inboxService.list(true) });

  const allItems = query.data ?? [];
  const items = includeProcessed ? allItems : allItems.filter((item) => !item.processed_at);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: INBOX_KEY });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["analytics"] });
  };

  const capture = useMutation({ mutationFn: (content: string) => inboxService.create(content), onSuccess: invalidate });
  const process = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ProcessInboxInput }) => inboxService.process(id, input),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: (id: string) => inboxService.remove(id), onSuccess: invalidate });

  return {
    items,
    allItems,
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
