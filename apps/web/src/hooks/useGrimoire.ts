import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { grimoireService, type DeckInput } from "@/services/grimoireService";

export const GRIMOIRE_KEY = ["grimoire"] as const;

/** Invalida tudo do Grimório + XP (a fila concluída concede XP) + mural de citações (contagem de cartões). */
function useInvalidate() {
  const qc = useQueryClient();
  return (opts: { xp?: boolean; quotes?: boolean } = {}) => {
    void qc.invalidateQueries({ queryKey: GRIMOIRE_KEY });
    if (opts.xp) void qc.invalidateQueries({ queryKey: ["gamification"] });
    if (opts.quotes) void qc.invalidateQueries({ queryKey: ["reading", "quotes"] });
  };
}

export function useGrimoireDecks(opts: { archived?: boolean; subjectId?: string; bookId?: string } = {}) {
  return useQuery({ queryKey: [...GRIMOIRE_KEY, "decks", opts], queryFn: () => grimoireService.listDecks(opts) });
}

export function useGrimoireCards(deckId: string | null) {
  return useQuery({
    queryKey: [...GRIMOIRE_KEY, "cards", deckId],
    queryFn: () => grimoireService.listCards(deckId as string),
    enabled: !!deckId,
  });
}

export function useGrimoireQueue(deckId?: string) {
  return useQuery({ queryKey: [...GRIMOIRE_KEY, "queue", deckId ?? "all"], queryFn: () => grimoireService.queue(deckId) });
}

export function useGrimoireStats(deckId?: string) {
  return useQuery({ queryKey: [...GRIMOIRE_KEY, "stats", deckId ?? "all"], queryFn: () => grimoireService.stats(deckId, 30) });
}

export function useGrimoireMutations() {
  const invalidate = useInvalidate();
  const createDeck = useMutation({ mutationFn: (input: DeckInput) => grimoireService.createDeck(input), onSuccess: () => invalidate() });
  const updateDeck = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<DeckInput> & { archived?: boolean } }) => grimoireService.updateDeck(id, patch),
    onSuccess: () => invalidate(),
  });
  const deleteDeck = useMutation({ mutationFn: (id: string) => grimoireService.deleteDeck(id), onSuccess: () => invalidate({ quotes: true }) });
  const createCards = useMutation({
    mutationFn: ({ deckId, cards, source }: { deckId: string; cards: Array<{ front: string; back: string }>; source?: "manual" | "ai" }) =>
      grimoireService.createCards(deckId, cards, source),
    onSuccess: () => invalidate(),
  });
  const updateCard = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { front?: string; back?: string } }) => grimoireService.updateCard(id, patch),
    onSuccess: () => invalidate(),
  });
  const deleteCard = useMutation({ mutationFn: (id: string) => grimoireService.deleteCard(id), onSuccess: () => invalidate({ quotes: true }) });
  const cardFromNote = useMutation({ mutationFn: grimoireService.cardFromNote, onSuccess: () => invalidate({ quotes: true }) });
  const review = useMutation({
    mutationFn: ({ cardId, quality }: { cardId: string; quality: number }) => grimoireService.review(cardId, quality),
    // A fila é avançada localmente durante a sessão; aqui só atualizamos contagens/estatísticas.
    onSuccess: (r) => invalidate({ xp: r.xpAwarded > 0 }),
  });
  const generate = useMutation({ mutationFn: ({ source, count }: { source: Parameters<typeof grimoireService.generate>[0]; count?: number }) => grimoireService.generate(source, count) });
  return { createDeck, updateDeck, deleteDeck, createCards, updateCard, deleteCard, cardFromNote, review, generate };
}
