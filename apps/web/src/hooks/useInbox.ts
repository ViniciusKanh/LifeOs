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
 * `includeProcessed` traz também os itens já processados (com
 * `processed_at` preenchido) — sem isso, um item descartado ou virado
 * tarefa simplesmente desaparecia da tela sem deixar rastro, o que
 * parecia "a captura não gravou nada".
 */
export function useInbox(includeProcessed = false) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: [...INBOX_KEY, includeProcessed],
    queryFn: () => inboxService.list(includeProcessed),
  });

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
    items: query.data ?? [],
    isLoading: query.isLoading,
    capture: capture.mutateAsync,
    isCapturing: capture.isPending,
    process: process.mutateAsync,
    isProcessing: process.isPending,
    remove: remove.mutateAsync,
  };
}
