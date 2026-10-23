import { api } from "./api";

/** Espelho de /api/grimoire — o SM-2, a fila do dia e as estatísticas são calculados no servidor. */

export type CardSource = "manual" | "ai" | "quote";

export interface GrimoireDeck {
  id: string;
  name: string;
  description: string | null;
  subjectId: string | null;
  subjectName: string | null;
  courseId: string | null;
  courseName: string | null;
  bookId: string | null;
  bookTitle: string | null;
  newPerDay: number;
  createdAt: string;
  archivedAt: string | null;
  counts: { total: number; due: number; new: number; mature: number };
}

export interface GrimoireCard {
  id: string;
  deckId: string;
  front: string;
  back: string;
  source: CardSource;
  sourceNoteId: string | null;
  ease: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  dueDate: string;
  isNew: boolean;
  lastReviewedAt: string | null;
  createdAt: string;
}

export interface DailyQueue {
  today: string;
  timezone: string;
  cards: Array<GrimoireCard & { deckName: string }>;
  dueCount: number;
  newCount: number;
  reviewedToday: number;
  clearedToday: boolean;
}

export interface ReviewResult {
  card: GrimoireCard;
  queueCleared: boolean;
  xpAwarded: number;
}

export interface GrimoireStats {
  today: string;
  totals: { cards: number; new: number; learning: number; mature: number; dueToday: number };
  reviewsToday: number;
  retention30d: number | null;
  retentionSample: number;
  streak: number;
  byDay: Array<{ day: string; reviews: number; correct: number }>;
}

export interface DeckInput {
  name: string;
  description?: string | null;
  subjectId?: string | null;
  courseId?: string | null;
  bookId?: string | null;
  newPerDay?: number;
}

export type CardGenSource =
  | { kind: "text"; text: string }
  | { kind: "book_notes"; bookId: string; noteIds?: string[] }
  | { kind: "journal"; entryDate: string };

export interface CardGenResult {
  label: "sugestão";
  basedOn: string;
  suggestions: Array<{ front: string; back: string }>;
}

/** Botões de avaliação → qualidade SM-2 (teclas 1-4 nesta ordem). Mesmo mapa do servidor (srsEngine.GRADE_BUTTONS). */
export const GRADE_BUTTONS = [
  { key: "errei", label: "Errei", quality: 1, tone: "red" },
  { key: "dificil", label: "Difícil", quality: 3, tone: "orange" },
  { key: "bom", label: "Bom", quality: 4, tone: "blue" },
  { key: "facil", label: "Fácil", quality: 5, tone: "green" },
] as const;

const qs = (params: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const grimoireService = {
  listDecks: (opts: { archived?: boolean; subjectId?: string; bookId?: string } = {}) =>
    api.get<GrimoireDeck[]>(`/grimoire/decks${qs({ archived: opts.archived ? "1" : undefined, subjectId: opts.subjectId, bookId: opts.bookId })}`),
  createDeck: (input: DeckInput) => api.post<GrimoireDeck>("/grimoire/decks", input),
  updateDeck: (id: string, patch: Partial<DeckInput> & { archived?: boolean }) => api.patch<GrimoireDeck>(`/grimoire/decks/${id}`, patch),
  deleteDeck: (id: string) => api.delete<void>(`/grimoire/decks/${id}`),
  listCards: (deckId: string) => api.get<GrimoireCard[]>(`/grimoire/decks/${deckId}/cards`),
  createCards: (deckId: string, cards: Array<{ front: string; back: string }>, source: "manual" | "ai" = "manual") =>
    api.post<GrimoireCard[]>(`/grimoire/decks/${deckId}/cards`, { cards, source }),
  updateCard: (id: string, patch: { front?: string; back?: string; deckId?: string }) => api.patch<GrimoireCard>(`/grimoire/cards/${id}`, patch),
  deleteCard: (id: string) => api.delete<void>(`/grimoire/cards/${id}`),
  cardFromNote: (input: { noteId: string; deckId: string; front?: string; back?: string }) => api.post<GrimoireCard>("/grimoire/cards/from-note", input),
  queue: (deckId?: string) => api.get<DailyQueue>(`/grimoire/queue${qs({ deckId })}`),
  review: (cardId: string, quality: number) => api.post<ReviewResult>(`/grimoire/cards/${cardId}/review`, { quality }),
  stats: (deckId?: string, days?: number) => api.get<GrimoireStats>(`/grimoire/stats${qs({ deckId, days: days ? String(days) : undefined })}`),
  generate: (source: CardGenSource, count?: number) => api.post<CardGenResult>("/grimoire/generate", { source, count }),
};
