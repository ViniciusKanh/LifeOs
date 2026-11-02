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
  counts: { total: number; due: number; new: number; mature: number; reinforce: number };
  goalId: string | null;
  goalTitle: string | null;
  goalSyncMode: GoalSyncMode;
  sources: DeckSource[];
  nextReview: string | null;
  lastStudiedAt: string | null;
}

export type GoalSyncMode = "study_days" | "mastery" | "none";
export interface DeckSource {
  title: string;
  url?: string | null;
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
  /** reinforce = cartão "a reforçar" (lapsos ou facilidade baixa), etapa própria do ritual. */
  cards: Array<GrimoireCard & { deckName: string; reinforce?: boolean }>;
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
  goalId?: string | null;
  goalSyncMode?: GoalSyncMode;
  sources?: DeckSource[];
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
  { key: "errei", label: "Novamente", quality: 1, tone: "red" },
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
  review: (cardId: string, quality: number, durationMs?: number) => api.post<ReviewResult>(`/grimoire/cards/${cardId}/review`, { quality, durationMs }),
  hub: () => api.get<GrimoireHub>("/grimoire/hub"),
  explainOracle: () => api.post<{ text: string }>("/grimoire/oracle/explain"),
  hardCards: (deckId: string) => api.get<Array<GrimoireCard & { deckName: string }>>(`/grimoire/decks/${deckId}/hard`),
  importContent: (input: { title: string; kind: "text" | "pdf"; text?: string; pdfBase64?: string; deckId?: string | null }) =>
    api.post<{ ok: true; importId: string; summary: ImportSummary | null; suggested: number }>("/grimoire/import", input),
  imports: () => api.get<GrimoireImport[]>("/grimoire/imports"),
  suggestFromJournal: (entryDate: string, deckId: string | null) => api.post<{ added: number }>("/grimoire/suggestions/from-journal", { entryDate, deckId }),
  suggestions: () => api.get<GrimoireSuggestion[]>("/grimoire/suggestions"),
  decideSuggestions: (input: { approve: Array<{ id: string; front?: string; back?: string }>; reject: string[]; deckId?: string | null }) =>
    api.post<{ created: number; rejected: number }>("/grimoire/suggestions/decide", input),
  stats: (deckId?: string, days?: number) => api.get<GrimoireStats>(`/grimoire/stats${qs({ deckId, days: days ? String(days) : undefined })}`),
  generate: (source: CardGenSource, count?: number) => api.post<CardGenResult>("/grimoire/generate", { source, count }),
};

export interface OracleRec {
  kind: "focus" | "best_hour" | "reinforce" | "neglected" | "diary" | "start";
  title: string;
  detail: string;
  provenance: "dado" | "inferência" | "sugestão";
  action: { type: "study_deck" | "open_deck" | "generate_diary" | "new_deck"; deckId?: string; entryDate?: string } | null;
}

/** Painel central do Grimório 2.0 — tudo calculado no servidor a partir das revisões reais. */
export interface GrimoireHub {
  today: string;
  indicators: {
    streak: number;
    bestStreak: number;
    retention: number | null;
    retentionSample: number;
    domain: number | null;
    studyMinutes7d: number;
    studyMinutesPrev7d: number;
    measuredReviews7d: number;
    studyXp30d: number;
    studyXpTotal: number;
    activeDecks: number;
  };
  ritual: { due: number; fresh: number; reinforce: number; reviewedToday: number; clearedToday: boolean };
  oracle: OracleRec[];
  recent: Array<{ cardId: string; front: string; deckId: string; deckName: string; grade: number; at: string }>;
  domainMap: Array<{ deckId: string; name: string; subject: string | null; total: number; mature: number; pct: number | null; accuracy30d: number | null }>;
  calendar: Array<{ day: string; reviews: number }>;
  achievements: Array<{ code: string; title: string; description: string | null; tier: string; threshold: number; value: number; unlockedAt: string | null }>;
  pendingSuggestions: number;
  hasAi: boolean;
}

export interface ImportSummary {
  overview: string;
  sections: Array<{ title: string; points: string[] }>;
  concepts: Array<{ term: string; definition: string }>;
  questions: string[];
  cardsSuggested?: number;
}

export interface GrimoireImport {
  id: string;
  title: string;
  kind: "text" | "pdf";
  status: "processing" | "done" | "error";
  error: string | null;
  deckId: string | null;
  deckName: string | null;
  summary: ImportSummary | null;
  createdAt: string;
}

export interface GrimoireSuggestion {
  id: string;
  deckId: string | null;
  deckName: string | null;
  sourceKind: string;
  sourceRef: string;
  sourceLabel: string | null;
  front: string;
  back: string;
  createdAt: string;
}
