import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { award, computeStreak, dayKeyIn, todayKeyFor, userTimezone } from "./gamificationService.js";
import { normalizeStoredUtc } from "./healthService.js";
import { addDaysToKey, buildDailyQueue, sm2 } from "./srsEngine.js";

/**
 * Grimório de Memorização — baralhos, cartões, fila do dia, revisões e
 * estatísticas. Toda leitura/escrita filtra owner_id; o "dia" é sempre o
 * dia local do usuário (todayKeyFor). O algoritmo SM-2 vive em srsEngine.ts.
 */

export class GrimoireError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** XP modesto por concluir a fila do dia — uma vez por dia (chave = dia local). */
export const GRIMOIRE_REWARD = { queueClearedXp: 15, queueClearedCoins: 2 } as const;

export interface DeckInput {
  name: string;
  description?: string | null;
  subjectId?: string | null;
  courseId?: string | null;
  bookId?: string | null;
  newPerDay?: number;
}

export interface CardInput {
  front: string;
  back: string;
}

export type CardSource = "manual" | "ai" | "quote";

export interface Deck {
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

export interface Card {
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

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? null : String(v));

function mapCard(r: Row): Card {
  return {
    id: String(r.id),
    deckId: String(r.deck_id),
    front: String(r.front),
    back: String(r.back),
    source: String(r.source) as CardSource,
    sourceNoteId: s(r.source_note_id),
    ease: Number(r.ease),
    intervalDays: Number(r.interval_days),
    repetitions: Number(r.repetitions),
    lapses: Number(r.lapses),
    dueDate: String(r.due_date),
    isNew: r.last_reviewed_at == null,
    lastReviewedAt: s(r.last_reviewed_at),
    createdAt: String(r.created_at),
  };
}

/** Valida que os vínculos opcionais (disciplina, curso, livro) pertencem ao usuário. */
async function assertLinksOwned(db: Client, ownerId: string, input: Pick<DeckInput, "subjectId" | "courseId" | "bookId">) {
  const checks: Array<[string | null | undefined, string, string]> = [
    [input.subjectId, "subjects", "Disciplina não encontrada."],
    [input.courseId, "courses", "Curso não encontrado."],
    [input.bookId, "books", "Livro não encontrado."],
  ];
  for (const [id, table, msg] of checks) {
    if (!id) continue;
    const r = await db.execute({ sql: `SELECT 1 FROM ${table} WHERE id = ? AND owner_id = ?`, args: [id, ownerId] });
    if (!r.rows[0]) throw new GrimoireError(404, msg);
  }
}

async function ownedDeck(db: Client, ownerId: string, deckId: string) {
  const r = await db.execute({ sql: "SELECT * FROM flashcard_decks WHERE id = ? AND owner_id = ?", args: [deckId, ownerId] });
  const row = r.rows[0];
  if (!row) throw new GrimoireError(404, "Baralho não encontrado.");
  return row as unknown as Row;
}

// ------------------------------------------------------------
// Baralhos
// ------------------------------------------------------------

export async function listDecks(db: Client, ownerId: string, opts: { includeArchived?: boolean; subjectId?: string; bookId?: string } = {}, now = new Date()): Promise<Deck[]> {
  const today = await todayKeyFor(db, ownerId, now);
  const cond = ["d.owner_id = ?"];
  const args: Array<string> = [today, today, ownerId];
  if (!opts.includeArchived) cond.push("d.archived_at IS NULL");
  if (opts.subjectId) {
    cond.push("d.subject_id = ?");
    args.push(opts.subjectId);
  }
  if (opts.bookId) {
    cond.push("d.book_id = ?");
    args.push(opts.bookId);
  }
  const r = await db.execute({
    sql: `SELECT d.*, sb.name AS subject_name, co.name AS course_name, b.title AS book_title,
            (SELECT COUNT(*) FROM flashcards c WHERE c.deck_id = d.id AND c.owner_id = d.owner_id) AS total,
            (SELECT COUNT(*) FROM flashcards c WHERE c.deck_id = d.id AND c.owner_id = d.owner_id AND c.last_reviewed_at IS NOT NULL AND c.due_date <= ?) AS due,
            (SELECT COUNT(*) FROM flashcards c WHERE c.deck_id = d.id AND c.owner_id = d.owner_id AND c.last_reviewed_at IS NULL) AS fresh,
            (SELECT COUNT(*) FROM flashcards c WHERE c.deck_id = d.id AND c.owner_id = d.owner_id AND c.interval_days >= 21) AS mature,
            ? AS _today
          FROM flashcard_decks d
          LEFT JOIN subjects sb ON sb.id = d.subject_id AND sb.owner_id = d.owner_id
          LEFT JOIN courses co ON co.id = d.course_id AND co.owner_id = d.owner_id
          LEFT JOIN books b ON b.id = d.book_id AND b.owner_id = d.owner_id
          WHERE ${cond.join(" AND ")}
          ORDER BY d.archived_at IS NOT NULL, d.updated_at DESC`,
    args,
  });
  return (r.rows as unknown as Row[]).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    description: s(row.description),
    subjectId: s(row.subject_id),
    subjectName: s(row.subject_name),
    courseId: s(row.course_id),
    courseName: s(row.course_name),
    bookId: s(row.book_id),
    bookTitle: s(row.book_title),
    newPerDay: Number(row.new_per_day),
    createdAt: String(row.created_at),
    archivedAt: s(row.archived_at),
    counts: { total: Number(row.total), due: Number(row.due), new: Number(row.fresh), mature: Number(row.mature) },
  }));
}

export async function getDeck(db: Client, ownerId: string, deckId: string, now = new Date()): Promise<Deck> {
  await ownedDeck(db, ownerId, deckId);
  const all = await listDecks(db, ownerId, { includeArchived: true }, now);
  return all.find((d) => d.id === deckId)!;
}

export async function createDeck(db: Client, ownerId: string, input: DeckInput): Promise<string> {
  await assertLinksOwned(db, ownerId, input);
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO flashcard_decks (id, owner_id, name, description, subject_id, course_id, book_id, new_per_day)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, ownerId, input.name, input.description ?? null, input.subjectId ?? null, input.courseId ?? null, input.bookId ?? null, input.newPerDay ?? 15],
  });
  return id;
}

export async function updateDeck(db: Client, ownerId: string, deckId: string, patch: Partial<DeckInput> & { archived?: boolean }): Promise<void> {
  await ownedDeck(db, ownerId, deckId);
  await assertLinksOwned(db, ownerId, patch);
  const map: Record<string, string> = { name: "name", description: "description", subjectId: "subject_id", courseId: "course_id", bookId: "book_id", newPerDay: "new_per_day" };
  const sets: string[] = [];
  const args: Array<string | number | null> = [];
  for (const [key, col] of Object.entries(map)) {
    if (key in patch) {
      sets.push(`${col} = ?`);
      args.push(((patch as Record<string, unknown>)[key] ?? null) as string | number | null);
    }
  }
  if (patch.archived !== undefined) sets.push(patch.archived ? "archived_at = COALESCE(archived_at, datetime('now'))" : "archived_at = NULL");
  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now')");
  await db.execute({ sql: `UPDATE flashcard_decks SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`, args: [...args, deckId, ownerId] });
}

export async function deleteDeck(db: Client, ownerId: string, deckId: string): Promise<void> {
  const r = await db.execute({ sql: "DELETE FROM flashcard_decks WHERE id = ? AND owner_id = ?", args: [deckId, ownerId] });
  if (r.rowsAffected === 0) throw new GrimoireError(404, "Baralho não encontrado.");
}

// ------------------------------------------------------------
// Cartões
// ------------------------------------------------------------

export async function listCards(db: Client, ownerId: string, deckId: string): Promise<Card[]> {
  await ownedDeck(db, ownerId, deckId);
  const r = await db.execute({ sql: "SELECT * FROM flashcards WHERE deck_id = ? AND owner_id = ? ORDER BY created_at DESC", args: [deckId, ownerId] });
  return (r.rows as unknown as Row[]).map(mapCard);
}

export async function createCards(
  db: Client,
  ownerId: string,
  deckId: string,
  cards: CardInput[],
  source: CardSource,
  opts: { sourceNoteId?: string | null; now?: Date } = {},
): Promise<Card[]> {
  const deck = await ownedDeck(db, ownerId, deckId);
  if (deck.archived_at) throw new GrimoireError(409, "Este baralho está arquivado. Restaure-o para adicionar cartões.");
  const today = await todayKeyFor(db, ownerId, opts.now);
  const ids = cards.map(() => nanoid());
  await db.batch(
    [
      ...cards.map((c, i) => ({
        sql: `INSERT INTO flashcards (id, owner_id, deck_id, front, back, source, source_note_id, due_date)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [ids[i], ownerId, deckId, c.front, c.back, source, opts.sourceNoteId ?? null, today],
      })),
      { sql: "UPDATE flashcard_decks SET updated_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [deckId, ownerId] },
    ],
    "write",
  );
  const r = await db.execute({
    sql: `SELECT * FROM flashcards WHERE owner_id = ? AND id IN (${ids.map(() => "?").join(",")}) ORDER BY created_at`,
    args: [ownerId, ...ids],
  });
  return (r.rows as unknown as Row[]).map(mapCard);
}

export async function updateCard(db: Client, ownerId: string, cardId: string, patch: Partial<CardInput> & { deckId?: string }): Promise<Card> {
  if (patch.deckId) await ownedDeck(db, ownerId, patch.deckId);
  const sets: string[] = [];
  const args: string[] = [];
  if (patch.front !== undefined) {
    sets.push("front = ?");
    args.push(patch.front);
  }
  if (patch.back !== undefined) {
    sets.push("back = ?");
    args.push(patch.back);
  }
  if (patch.deckId) {
    sets.push("deck_id = ?");
    args.push(patch.deckId);
  }
  if (sets.length > 0) {
    sets.push("updated_at = datetime('now')");
    const r = await db.execute({ sql: `UPDATE flashcards SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`, args: [...args, cardId, ownerId] });
    if (r.rowsAffected === 0) throw new GrimoireError(404, "Cartão não encontrado.");
  }
  const r = await db.execute({ sql: "SELECT * FROM flashcards WHERE id = ? AND owner_id = ?", args: [cardId, ownerId] });
  if (!r.rows[0]) throw new GrimoireError(404, "Cartão não encontrado.");
  return mapCard(r.rows[0] as unknown as Row);
}

export async function deleteCard(db: Client, ownerId: string, cardId: string): Promise<void> {
  const r = await db.execute({ sql: "DELETE FROM flashcards WHERE id = ? AND owner_id = ?", args: [cardId, ownerId] });
  if (r.rowsAffected === 0) throw new GrimoireError(404, "Cartão não encontrado.");
}

/** Cria um cartão a partir de uma citação/nota da Biblioteca (frente = trecho, verso = livro + página). */
export async function cardFromBookNote(db: Client, ownerId: string, noteId: string, deckId: string, override?: Partial<CardInput>): Promise<Card> {
  const r = await db.execute({
    sql: `SELECT n.id, n.content, n.page, n.kind, b.title, b.author FROM book_notes n JOIN books b ON b.id = n.book_id AND b.owner_id = n.owner_id
          WHERE n.id = ? AND n.owner_id = ?`,
    args: [noteId, ownerId],
  });
  const note = r.rows[0] as unknown as { content: string; page: number | null; title: string; author: string | null } | undefined;
  if (!note) throw new GrimoireError(404, "Citação não encontrada.");
  const ref = `${note.title}${note.author ? ` — ${note.author}` : ""}${note.page ? `, p. ${note.page}` : ""}`;
  const front = override?.front?.trim() || String(note.content).slice(0, 2000);
  const back = override?.back?.trim() || ref;
  const [card] = await createCards(db, ownerId, deckId, [{ front, back }], "quote", { sourceNoteId: noteId });
  return card;
}

// ------------------------------------------------------------
// Fila do dia e revisões
// ------------------------------------------------------------

export interface DailyQueue {
  today: string;
  timezone: string;
  cards: Array<Card & { deckName: string }>;
  dueCount: number;
  newCount: number;
  reviewedToday: number;
  /** A fila de hoje já foi concluída (XP do dia concedido). */
  clearedToday: boolean;
}

/** Fila de hoje (todos os baralhos ativos ou só um): vencidos + novos até o limite diário de cada baralho. */
export async function getDailyQueue(db: Client, ownerId: string, opts: { deckId?: string } = {}, now = new Date()): Promise<DailyQueue> {
  const tz = await userTimezone(db, ownerId);
  const today = dayKeyIn(now, tz);
  if (opts.deckId) await ownedDeck(db, ownerId, opts.deckId);

  const deckCond = opts.deckId ? "AND d.id = ?" : "";
  const deckArgs = opts.deckId ? [opts.deckId] : [];
  const [cardsRes, newTodayRes, reviewedRes, clearedRes] = await Promise.all([
    db.execute({
      sql: `SELECT c.*, d.name AS deck_name, d.new_per_day FROM flashcards c JOIN flashcard_decks d ON d.id = c.deck_id AND d.owner_id = c.owner_id
            WHERE c.owner_id = ? AND d.archived_at IS NULL ${deckCond}
              AND (c.last_reviewed_at IS NULL OR c.due_date <= ?)`,
      args: [ownerId, ...deckArgs, today],
    }),
    db.execute({
      sql: "SELECT deck_id, COUNT(DISTINCT card_id) AS n FROM flashcard_reviews WHERE owner_id = ? AND day_key = ? AND was_new = 1 GROUP BY deck_id",
      args: [ownerId, today],
    }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM flashcard_reviews WHERE owner_id = ? AND day_key = ?", args: [ownerId, today] }),
    db.execute({
      sql: "SELECT 1 FROM xp_events WHERE owner_id = ? AND source_type = 'grimoire' AND source_id = ? AND event_type = 'queue_cleared'",
      args: [ownerId, today],
    }),
  ]);

  const newToday = new Map((newTodayRes.rows as unknown as Row[]).map((r) => [String(r.deck_id), Number(r.n)]));
  const byDeck = new Map<string, { limit: number; cards: Array<Card & { deckName: string }> }>();
  for (const row of cardsRes.rows as unknown as Row[]) {
    const deckId = String(row.deck_id);
    const entry = byDeck.get(deckId) ?? { limit: Number(row.new_per_day), cards: [] };
    entry.cards.push({ ...mapCard(row), deckName: String(row.deck_name) });
    byDeck.set(deckId, entry);
  }
  const cards: Array<Card & { deckName: string }> = [];
  for (const [deckId, { limit, cards: deckCards }] of byDeck) {
    cards.push(...buildDailyQueue(deckCards, today, limit - (newToday.get(deckId) ?? 0)));
  }
  // Vencidos primeiro (mais antigos antes), depois os novos.
  cards.sort((a, b) => Number(a.isNew) - Number(b.isNew) || a.dueDate.localeCompare(b.dueDate) || a.createdAt.localeCompare(b.createdAt));

  return {
    today,
    timezone: tz,
    cards,
    dueCount: cards.filter((c) => !c.isNew).length,
    newCount: cards.filter((c) => c.isNew).length,
    reviewedToday: Number(reviewedRes.rows[0]?.n ?? 0),
    clearedToday: clearedRes.rows.length > 0,
  };
}

export interface ReviewResult {
  card: Card;
  /** Fila geral de hoje ficou vazia com esta revisão. */
  queueCleared: boolean;
  /** XP concedido AGORA por concluir a fila (false se já tinha sido concedido hoje). */
  xpAwarded: number;
}

/** Registra a revisão de um cartão (SM-2) e, se a fila do dia zerou, concede o XP do dia (idempotente). */
export async function reviewCard(db: Client, ownerId: string, cardId: string, quality: number, now = new Date()): Promise<ReviewResult> {
  const r = await db.execute({ sql: "SELECT * FROM flashcards WHERE id = ? AND owner_id = ?", args: [cardId, ownerId] });
  const row = r.rows[0] as unknown as Row | undefined;
  if (!row) throw new GrimoireError(404, "Cartão não encontrado.");
  const card = mapCard(row);
  const tz = await userTimezone(db, ownerId);
  const today = dayKeyIn(now, tz);
  const next = sm2(card, quality, today);
  const nowIso = now.toISOString();

  await db.batch(
    [
      {
        sql: `UPDATE flashcards SET ease = ?, interval_days = ?, repetitions = ?, lapses = ?, due_date = ?, last_reviewed_at = ?, updated_at = datetime('now')
              WHERE id = ? AND owner_id = ?`,
        args: [next.ease, next.intervalDays, next.repetitions, next.lapses, next.dueDate, nowIso, cardId, ownerId],
      },
      {
        sql: `INSERT INTO flashcard_reviews (id, owner_id, card_id, deck_id, grade, was_new, interval_days, reviewed_at, day_key)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [nanoid(), ownerId, cardId, card.deckId, Math.round(quality), card.isNew ? 1 : 0, next.intervalDays, nowIso, today],
      },
    ],
    "write",
  );

  const queue = await getDailyQueue(db, ownerId, {}, now);
  let xpAwarded = 0;
  if (queue.cards.length === 0) {
    const granted = await award(
      db,
      ownerId,
      {
        sourceType: "grimoire",
        sourceId: today,
        eventType: "queue_cleared",
        xp: GRIMOIRE_REWARD.queueClearedXp,
        coins: GRIMOIRE_REWARD.queueClearedCoins,
        label: `Grimório: estudo do dia concluído (${queue.reviewedToday} revisões)`,
      },
      today,
    );
    if (granted) xpAwarded = GRIMOIRE_REWARD.queueClearedXp;
  }
  return { card: { ...card, ...next, isNew: false, lastReviewedAt: nowIso }, queueCleared: queue.cards.length === 0, xpAwarded };
}

// ------------------------------------------------------------
// Estatísticas
// ------------------------------------------------------------

export interface GrimoireStats {
  today: string;
  totals: { cards: number; new: number; learning: number; mature: number; dueToday: number };
  reviewsToday: number;
  /** % de acertos (qualidade ≥ 3) em cartões já aprendidos, últimos 30 dias. null sem amostra. */
  retention30d: number | null;
  retentionSample: number;
  streak: number;
  byDay: Array<{ day: string; reviews: number; correct: number }>;
}

export async function getStats(db: Client, ownerId: string, opts: { deckId?: string; days?: number } = {}, now = new Date()): Promise<GrimoireStats> {
  const today = await todayKeyFor(db, ownerId, now);
  if (opts.deckId) await ownedDeck(db, ownerId, opts.deckId);
  const days = Math.min(90, Math.max(7, opts.days ?? 30));
  const from = addDaysToKey(today, -(days - 1));
  const deckCond = opts.deckId ? "AND deck_id = ?" : "";
  const deckArgs = opts.deckId ? [opts.deckId] : [];

  const [totals, byDay, retention, allDays] = await Promise.all([
    db.execute({
      sql: `SELECT COUNT(*) AS total,
              SUM(CASE WHEN c.last_reviewed_at IS NULL THEN 1 ELSE 0 END) AS fresh,
              SUM(CASE WHEN c.last_reviewed_at IS NOT NULL AND c.interval_days < 21 THEN 1 ELSE 0 END) AS learning,
              SUM(CASE WHEN c.interval_days >= 21 THEN 1 ELSE 0 END) AS mature,
              SUM(CASE WHEN c.last_reviewed_at IS NOT NULL AND c.due_date <= ? THEN 1 ELSE 0 END) AS due
            FROM flashcards c JOIN flashcard_decks d ON d.id = c.deck_id AND d.owner_id = c.owner_id
            WHERE c.owner_id = ? AND d.archived_at IS NULL ${opts.deckId ? "AND c.deck_id = ?" : ""}`,
      args: [today, ownerId, ...deckArgs],
    }),
    db.execute({
      sql: `SELECT day_key AS d, COUNT(*) AS n, SUM(CASE WHEN grade >= 3 THEN 1 ELSE 0 END) AS ok
            FROM flashcard_reviews WHERE owner_id = ? AND day_key BETWEEN ? AND ? ${deckCond} GROUP BY day_key`,
      args: [ownerId, from, today, ...deckArgs],
    }),
    db.execute({
      sql: `SELECT COUNT(*) AS n, SUM(CASE WHEN grade >= 3 THEN 1 ELSE 0 END) AS ok
            FROM flashcard_reviews WHERE owner_id = ? AND was_new = 0 AND day_key BETWEEN ? AND ? ${deckCond}`,
      args: [ownerId, addDaysToKey(today, -29), today, ...deckArgs],
    }),
    db.execute({ sql: `SELECT DISTINCT day_key AS d FROM flashcard_reviews WHERE owner_id = ? ${deckCond} ORDER BY day_key DESC LIMIT 400`, args: [ownerId, ...deckArgs] }),
  ]);

  const t = totals.rows[0] as unknown as Row;
  const map = new Map((byDay.rows as unknown as Row[]).map((r) => [String(r.d), { reviews: Number(r.n), correct: Number(r.ok) }]));
  const series = Array.from({ length: days }, (_, i) => {
    const day = addDaysToKey(from, i);
    return { day, ...(map.get(day) ?? { reviews: 0, correct: 0 }) };
  });
  const ret = retention.rows[0] as unknown as Row;
  const sample = Number(ret?.n ?? 0);
  // Abaixo de 10 revisões a taxa é ruído — mostramos "dados insuficientes".
  const retention30d = sample >= 10 ? Math.round((Number(ret.ok) / sample) * 100) : null;

  return {
    today,
    totals: {
      cards: Number(t?.total ?? 0),
      new: Number(t?.fresh ?? 0),
      learning: Number(t?.learning ?? 0),
      mature: Number(t?.mature ?? 0),
      dueToday: Number(t?.due ?? 0),
    },
    reviewsToday: map.get(today)?.reviews ?? 0,
    retention30d,
    retentionSample: sample,
    streak: computeStreak((allDays.rows as unknown as Row[]).map((r) => String(r.d)), today),
    byDay: series,
  };
}

/** Converte o instante salvo (UTC) para o dia local — usado ao montar contexto para a IA. */
export function localDayOf(stored: string, tz: string): string {
  return dayKeyIn(new Date(normalizeStoredUtc(stored)), tz);
}
