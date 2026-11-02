import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { localDayOfStored, shiftDayKey, userDayContext } from "./localDayService.js";
import { mondayKey, notifyFromAutomation } from "./automationService.js";
import { getReadingYearSummary } from "./readingYearService.js";
import { isDailyReadingGoal } from "./dailyReadingGoalService.js";
import { syncAutoHabitsAfterWrite } from "./habitAutoService.js";
import { createCards, createDeck, listDecks } from "./grimoireService.js";
import { bestStreak, streakEndingToday } from "./planningHubService.js";

/**
 * Biblioteca 3.0 — A Academia dos Livros (camada derivada + sessões e trilhas).
 *
 * Regras de páginas (explícitas na UI):
 * - "Páginas lidas" = soma de pages_read das sessões (inclui releitura).
 * - "Páginas inéditas" = Σ posição atual de cada livro, limitada ao total.
 * - Sessão com página final só avança o livro até essa posição (reler não conta como avanço).
 * Nenhuma rota concede XP: o "XP literário" é o XP já pago por hábitos de leitura
 * (auto_source = 'reading') e conquistas de leitura.
 */

type Row = Record<string, unknown>;
type Outcome = { status: "ok" | "skipped" | "error"; summary: string };

export class LibraryHubError extends Error {
  constructor(
    message: string,
    public status: 400 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

export const TRAIL_TEMPLATES = [
  { name: "Jornada da Produtividade", theme: "Produtividade", objective: "Organizar rotina, foco e execução." },
  { name: "Academia de Ciência de Dados", theme: "Dados", objective: "Estatística, ML e prática com dados." },
  { name: "Fundamentos da Programação", theme: "Programação", objective: "Lógica, arquitetura e boas práticas." },
  { name: "Trilha de Pesquisa Científica", theme: "Pesquisa", objective: "Método, escrita acadêmica e revisão." },
  { name: "Desenvolvimento Pessoal", theme: "Pessoal", objective: "Hábitos, mentalidade e bem-estar." },
] as const;

/** Avanço de posição de uma sessão: só o trecho além da posição atual conta como inédito. */
export function positionAfter(current: number, session: { startPage?: number | null; endPage?: number | null; pages: number }, total: number | null) {
  const raw = session.endPage != null ? Math.max(current, session.endPage) : current + session.pages;
  return total ? Math.min(total, raw) : raw;
}

export async function getLibraryHub(db: Client, ownerId: string) {
  const { tz, today } = await userDayContext(db, ownerId);
  const [books, sessions, goals, xp, year, trails] = await Promise.all([
    db.execute({ sql: "SELECT id, title, author, cover_url, status, current_page, total_pages, categories, is_favorite, updated_at, finished_at FROM books WHERE owner_id = ?", args: [ownerId] }),
    db.execute({
      sql: `SELECT rs.id, rs.book_id, b.title, rs.started_at, rs.duration_minutes, rs.pages_read, rs.start_page, rs.end_page, rs.note, rs.learning
            FROM reading_sessions rs JOIN books b ON b.id = rs.book_id AND b.owner_id = rs.owner_id
            WHERE rs.owner_id = ? ORDER BY rs.started_at DESC LIMIT 2000`,
      args: [ownerId],
    }),
    db.execute({ sql: "SELECT id, title, kind, unit, status, target_value FROM goals WHERE owner_id = ? AND status = 'active'", args: [ownerId] }),
    db.execute({
      sql: `SELECT COALESCE(SUM(x.xp), 0) AS xp FROM xp_events x WHERE x.owner_id = ? AND (
              (x.source_type = 'habit_entry' AND substr(x.source_id, 1, instr(x.source_id, ':') - 1) IN (SELECT id FROM habits WHERE owner_id = x.owner_id AND auto_source = 'reading'))
              OR (x.source_type = 'achievement' AND x.source_id IN (SELECT id FROM achievements WHERE metric LIKE 'books_%' OR metric LIKE 'pages_%' OR metric LIKE 'reading_%')))`,
      args: [ownerId],
    }),
    getReadingYearSummary(db, ownerId, undefined),
    listTrails(db, ownerId),
  ]);
  const list = books.rows.map((b) => ({
    id: String(b.id),
    title: String(b.title),
    author: b.author == null ? null : String(b.author),
    coverUrl: b.cover_url == null ? null : String(b.cover_url),
    status: String(b.status),
    currentPage: Number(b.current_page ?? 0),
    totalPages: b.total_pages == null ? null : Number(b.total_pages),
    categories: b.categories == null ? null : String(b.categories),
    favorite: Number(b.is_favorite ?? 0) === 1,
    updatedAt: String(b.updated_at),
  }));
  const sess = sessions.rows.map((s) => ({
    id: String(s.id),
    bookId: String(s.book_id),
    title: String(s.title),
    at: String(s.started_at),
    day: localDayOfStored(String(s.started_at), tz),
    minutes: s.duration_minutes == null ? null : Number(s.duration_minutes),
    pages: Number(s.pages_read ?? 0),
    startPage: s.start_page == null ? null : Number(s.start_page),
    endPage: s.end_page == null ? null : Number(s.end_page),
    note: s.note == null ? null : String(s.note),
    learning: s.learning == null ? null : String(s.learning),
  }));
  const lastByBook = new Map<string, string>();
  for (const s of sess) if (!lastByBook.has(s.bookId)) lastByBook.set(s.bookId, s.day);
  const days = new Set(sess.filter((s) => s.pages > 0 || (s.minutes ?? 0) > 0).map((s) => s.day));
  const todaySess = sess.filter((s) => s.day === today);
  const dailyGoal = goals.rows.find((g) => isDailyReadingGoal({ title: String(g.title), kind: String(g.kind), unit: g.unit == null ? null : String(g.unit), status: String(g.status) }));
  const reading = list.filter((b) => b.status === "Lendo").sort((a, b) => (lastByBook.get(b.id) ?? b.updatedAt).localeCompare(lastByBook.get(a.id) ?? a.updatedAt));
  const featured = reading[0] ?? null;
  const yearFrom = `${today.slice(0, 4)}-01-01`;
  return {
    today,
    indicators: {
      total: list.length,
      reading: reading.length,
      completed: list.filter((b) => b.status === "Concluído").length,
      completedYear: year.booksFinished,
      pagesRead: sess.reduce((s, x) => s + x.pages, 0),
      pagesYear: year.pagesRead,
      uniquePages: list.reduce((s, b) => s + (b.totalPages ? Math.min(b.currentPage, b.totalPages) : b.currentPage), 0),
      streak: streakEndingToday(days, today),
      bestStreak: bestStreak(days),
      xp: Number(xp.rows[0]?.xp ?? 0),
      minutesTotal: sess.reduce((s, x) => s + (x.minutes ?? 0), 0),
      minutesYear: sess.filter((s) => s.day >= yearFrom).reduce((s, x) => s + (x.minutes ?? 0), 0),
      yearGoal: year.goal,
      yearBooks: year.books,
    },
    featured: featured ? { ...featured, lastSession: sess.find((s) => s.bookId === featured.id) ?? null } : null,
    desk: {
      pagesToday: todaySess.reduce((s, x) => s + x.pages, 0),
      minutesToday: todaySess.reduce((s, x) => s + (x.minutes ?? 0), 0),
      dailyGoal: dailyGoal ? { id: String(dailyGoal.id), title: String(dailyGoal.title), target: Number(dailyGoal.target_value ?? 0) } : null,
      streak: streakEndingToday(days, today),
      readDays30: [...days].filter((d) => d >= shiftDayKey(today, -29)).length,
    },
    books: list.map((b) => ({ ...b, lastReadDay: lastByBook.get(b.id) ?? null })),
    recentSessions: sess.slice(0, 12),
    calendar: Array.from({ length: 42 }, (_, i) => {
      const d = shiftDayKey(shiftDayKey(mondayKey(today), -35), i);
      const daySessions = sess.filter((s) => s.day === d);
      return { day: d, pages: daySessions.reduce((s, x) => s + x.pages, 0), minutes: daySessions.reduce((s, x) => s + (x.minutes ?? 0), 0), future: d > today };
    }),
    trails,
    trailTemplates: TRAIL_TEMPLATES,
    learnings: sess.filter((s) => s.learning).slice(0, 10).map((s) => ({ sessionId: s.id, bookId: s.bookId, title: s.title, day: s.day, learning: s.learning! })),
  };
}

/* ─────────────────────────────── Sessões ─────────────────────────────── */

export interface SessionInput {
  bookId: string;
  date: string; // YYYY-MM-DD local
  durationMinutes?: number | null;
  startPage?: number | null;
  endPage?: number | null;
  pages?: number | null;
  note?: string | null;
  learning?: string | null;
}

async function ownedBook(db: Client, ownerId: string, bookId: string) {
  const r = await db.execute({ sql: "SELECT id, current_page, total_pages FROM books WHERE id = ? AND owner_id = ?", args: [bookId, ownerId] });
  const b = r.rows[0];
  if (!b) throw new LibraryHubError("Livro não encontrado.", 404);
  return { current: Number(b.current_page ?? 0), total: b.total_pages == null ? null : Number(b.total_pages) };
}

/** Valida e normaliza a sessão: página final ≤ total conhecido; páginas = fim − início quando houver posições. */
export function normalizeSession(input: Pick<SessionInput, "startPage" | "endPage" | "pages">, total: number | null) {
  const start = input.startPage ?? null;
  const end = input.endPage ?? null;
  if (start != null && end != null && end < start) throw new LibraryHubError("A página final não pode ser menor que a inicial.");
  if (total && end != null && end > total) throw new LibraryHubError(`A página final passa do total do livro (${total}).`);
  if (total && start != null && start > total) throw new LibraryHubError(`A página inicial passa do total do livro (${total}).`);
  const pages = start != null && end != null ? end - start : Math.max(0, Math.round(input.pages ?? 0));
  if (pages > 2000) throw new LibraryHubError("Quantidade de páginas inválida.");
  return { start, end, pages };
}

export async function recordSession(db: Client, ownerId: string, input: SessionInput) {
  const book = await ownedBook(db, ownerId, input.bookId);
  const s = normalizeSession(input, book.total);
  if (!s.pages && !input.durationMinutes) throw new LibraryHubError("Informe páginas ou duração da sessão.");
  const id = nanoid();
  // Meio-dia UTC do dia escolhido: o dia local se mantém em fusos do Brasil.
  const startedAt = `${input.date} 12:00:00`;
  const next = positionAfter(book.current, { startPage: s.start, endPage: s.end, pages: s.pages }, book.total);
  await db.batch(
    [
      {
        sql: `INSERT INTO reading_sessions (id, book_id, owner_id, started_at, duration_minutes, pages_read, start_page, end_page, note, learning)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, input.bookId, ownerId, startedAt, input.durationMinutes ?? null, s.pages, s.start, s.end, input.note?.slice(0, 600) || null, input.learning?.slice(0, 600) || null],
      },
      { sql: "UPDATE books SET current_page = ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [next, input.bookId, ownerId] },
    ],
    "write",
  );
  // Hábito de leitura vinculado (auto_source) e quests leem a mesma sessão — sem cópia.
  await syncAutoHabitsAfterWrite(db, ownerId, startedAt);
  return { id, currentPage: next };
}

/**
 * Correção de sessão: recalcula a posição pelo delta (sessões sem página final)
 * ou pela maior página final registrada — nunca duplica o avanço.
 */
export async function updateSession(db: Client, ownerId: string, sessionId: string, patch: Omit<SessionInput, "bookId">) {
  const r = await db.execute({ sql: "SELECT book_id, pages_read, end_page FROM reading_sessions WHERE id = ? AND owner_id = ?", args: [sessionId, ownerId] });
  const old = r.rows[0];
  if (!old) throw new LibraryHubError("Sessão não encontrada.", 404);
  const bookId = String(old.book_id);
  const book = await ownedBook(db, ownerId, bookId);
  const s = normalizeSession(patch, book.total);
  await db.execute({
    sql: `UPDATE reading_sessions SET started_at = ?, duration_minutes = ?, pages_read = ?, start_page = ?, end_page = ?, note = ?, learning = ? WHERE id = ? AND owner_id = ?`,
    args: [`${patch.date} 12:00:00`, patch.durationMinutes ?? null, s.pages, s.start, s.end, patch.note?.slice(0, 600) || null, patch.learning?.slice(0, 600) || null, sessionId, ownerId],
  });
  const current = await recomputePosition(db, ownerId, bookId, book, old.end_page == null ? Number(old.pages_read ?? 0) : 0, s.end == null ? s.pages : 0);
  await syncAutoHabitsAfterWrite(db, ownerId, `${patch.date} 12:00:00`);
  return { currentPage: current };
}

export async function deleteSession(db: Client, ownerId: string, sessionId: string) {
  const r = await db.execute({ sql: "SELECT book_id, pages_read, end_page, started_at FROM reading_sessions WHERE id = ? AND owner_id = ?", args: [sessionId, ownerId] });
  const old = r.rows[0];
  if (!old) throw new LibraryHubError("Sessão não encontrada.", 404);
  const bookId = String(old.book_id);
  const book = await ownedBook(db, ownerId, bookId);
  await db.execute({ sql: "DELETE FROM reading_sessions WHERE id = ? AND owner_id = ?", args: [sessionId, ownerId] });
  const current = await recomputePosition(db, ownerId, bookId, book, old.end_page == null ? Number(old.pages_read ?? 0) : 0, 0);
  await syncAutoHabitsAfterWrite(db, ownerId, String(old.started_at));
  return { currentPage: current };
}

async function recomputePosition(db: Client, ownerId: string, bookId: string, book: { current: number; total: number | null }, oldAdditive: number, newAdditive: number) {
  const maxEnd = await db.execute({ sql: "SELECT MAX(end_page) AS m FROM reading_sessions WHERE book_id = ? AND owner_id = ?", args: [bookId, ownerId] });
  const additive = Math.max(0, book.current - oldAdditive + newAdditive);
  let next = Math.max(additive, Number(maxEnd.rows[0]?.m ?? 0));
  if (book.total) next = Math.min(book.total, next);
  await db.execute({ sql: "UPDATE books SET current_page = ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [next, bookId, ownerId] });
  return next;
}

export async function setBookFavorite(db: Client, ownerId: string, bookId: string, favorite: boolean) {
  const r = await db.execute({ sql: "UPDATE books SET is_favorite = ? WHERE id = ? AND owner_id = ?", args: [favorite ? 1 : 0, bookId, ownerId] });
  if (!r.rowsAffected) throw new LibraryHubError("Livro não encontrado.", 404);
}

/** D · Grimório: o usuário revisa frente/verso — só então o cartão é criado (no baralho do livro). */
export async function learningToCard(db: Client, ownerId: string, sessionId: string, card: { front: string; back: string }) {
  const r = await db.execute({ sql: "SELECT rs.book_id, b.title FROM reading_sessions rs JOIN books b ON b.id = rs.book_id WHERE rs.id = ? AND rs.owner_id = ?", args: [sessionId, ownerId] });
  const row = r.rows[0];
  if (!row) throw new LibraryHubError("Sessão não encontrada.", 404);
  const bookId = String(row.book_id);
  const decks = await listDecks(db, ownerId, { bookId });
  const deckId = decks[0]?.id ?? (await createDeck(db, ownerId, { name: `Leitura: ${String(row.title).slice(0, 60)}`, bookId }));
  await createCards(db, ownerId, deckId, [{ front: card.front.slice(0, 500), back: card.back.slice(0, 1000) }], "manual");
  return { deckId };
}

/* ─────────────────────────────── Trilhas ─────────────────────────────── */

export async function listTrails(db: Client, ownerId: string) {
  const [trails, links] = await Promise.all([
    db.execute({ sql: "SELECT t.*, g.title AS goal_title FROM reading_trails t LEFT JOIN goals g ON g.id = t.goal_id AND g.owner_id = t.owner_id WHERE t.owner_id = ? ORDER BY t.created_at", args: [ownerId] }),
    db.execute({
      sql: `SELECT tb.trail_id, tb.position, b.id, b.title, b.author, b.cover_url, b.status, b.current_page, b.total_pages
            FROM reading_trail_books tb JOIN books b ON b.id = tb.book_id AND b.owner_id = tb.owner_id
            WHERE tb.owner_id = ? ORDER BY tb.position`,
      args: [ownerId],
    }),
  ]);
  return trails.rows.map((t) => {
    const books = links.rows
      .filter((l) => l.trail_id === t.id)
      .map((l) => ({ id: String(l.id), title: String(l.title), author: l.author == null ? null : String(l.author), coverUrl: l.cover_url == null ? null : String(l.cover_url), status: String(l.status), currentPage: Number(l.current_page ?? 0), totalPages: l.total_pages == null ? null : Number(l.total_pages) }));
    const done = books.filter((b) => b.status === "Concluído").length;
    return {
      id: String(t.id),
      name: String(t.name),
      theme: t.theme == null ? null : String(t.theme),
      objective: t.objective == null ? null : String(t.objective),
      goalId: t.goal_id == null ? null : String(t.goal_id),
      goalTitle: t.goal_title == null ? null : String(t.goal_title),
      books,
      done,
      pct: books.length ? Math.round((done / books.length) * 100) : 0,
      nextBookId: books.find((b) => b.status !== "Concluído")?.id ?? null,
    };
  });
}

export interface TrailInput {
  name: string;
  theme?: string | null;
  objective?: string | null;
  goalId?: string | null;
  bookIds: string[];
}

async function assertTrailRefs(db: Client, ownerId: string, input: TrailInput) {
  if (input.goalId) {
    const g = await db.execute({ sql: "SELECT 1 FROM goals WHERE id = ? AND owner_id = ?", args: [input.goalId, ownerId] });
    if (!g.rows.length) throw new LibraryHubError("Meta não encontrada.", 404);
  }
  const ids = [...new Set(input.bookIds)].slice(0, 30);
  if (ids.length) {
    const r = await db.execute({ sql: `SELECT id FROM books WHERE owner_id = ? AND id IN (${ids.map(() => "?").join(",")})`, args: [ownerId, ...ids] });
    if (r.rows.length !== ids.length) throw new LibraryHubError("Algum livro não pertence à sua Biblioteca.", 400);
  }
  return ids;
}

export async function saveTrail(db: Client, ownerId: string, input: TrailInput, trailId?: string) {
  const ids = await assertTrailRefs(db, ownerId, input);
  const id = trailId ?? nanoid();
  if (trailId) {
    const r = await db.execute({ sql: "UPDATE reading_trails SET name = ?, theme = ?, objective = ?, goal_id = ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [input.name, input.theme ?? null, input.objective ?? null, input.goalId ?? null, id, ownerId] });
    if (!r.rowsAffected) throw new LibraryHubError("Trilha não encontrada.", 404);
  } else {
    await db.execute({ sql: "INSERT INTO reading_trails (id, owner_id, name, theme, objective, goal_id) VALUES (?, ?, ?, ?, ?, ?)", args: [id, ownerId, input.name, input.theme ?? null, input.objective ?? null, input.goalId ?? null] });
  }
  await db.batch(
    [
      { sql: "DELETE FROM reading_trail_books WHERE trail_id = ? AND owner_id = ?", args: [id, ownerId] },
      ...ids.map((b, i) => ({ sql: "INSERT INTO reading_trail_books (trail_id, book_id, owner_id, position) VALUES (?, ?, ?, ?)", args: [id, b, ownerId, i] })),
    ],
    "write",
  );
  return { id };
}

export async function deleteTrail(db: Client, ownerId: string, trailId: string) {
  const r = await db.execute({ sql: "DELETE FROM reading_trails WHERE id = ? AND owner_id = ?", args: [trailId, ownerId] });
  if (!r.rowsAffected) throw new LibraryHubError("Trilha não encontrada.", 404);
}

/* ─────────────────────────────── Automações ─────────────────────────────── */

/** B · Lembrete: há livro em leitura e nenhuma sessão ontem. */
export async function runReadingReminder(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const hub = await getLibraryHub(db, ownerId);
  if (!hub.featured) return { status: "skipped", summary: "Nenhum livro em leitura." };
  const yesterday = shiftDayKey(hub.today, -1);
  if (hub.recentSessions.some((s) => s.day >= yesterday)) return { status: "skipped", summary: "Já houve leitura recente." };
  await notifyFromAutomation(db, ownerId, {
    eventType: "library_reminder",
    title: "📚 Hora da leitura",
    body: `Continue “${hub.featured.title}” (página ${hub.featured.currentPage}${hub.featured.totalPages ? ` de ${hub.featured.totalPages}` : ""}).`,
    url: "/biblioteca",
    inApp: config.inApp !== false,
    push: config.push === true,
  });
  return { status: "ok", summary: "Lembrete de leitura enviado." };
}

/** E · Resumo semanal de leituras (sessões e aprendizados próprios — sem conteúdo dos livros). */
export async function runReadingSummary(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const { today } = await userDayContext(db, ownerId);
  const from = shiftDayKey(mondayKey(today), -7);
  const to = shiftDayKey(from, 6);
  const r = await db.execute({
    sql: `SELECT b.title, rs.pages_read FROM reading_sessions rs JOIN books b ON b.id = rs.book_id AND b.owner_id = rs.owner_id
          WHERE rs.owner_id = ? AND date(rs.started_at) >= ? AND date(rs.started_at) <= ?`,
    args: [ownerId, from, to],
  });
  const week = r.rows.map((x) => ({ title: String(x.title), pages: Number(x.pages_read ?? 0) }));
  if (!week.length) return { status: "skipped", summary: "Nenhuma sessão na semana passada." };
  const pages = week.reduce((s, x) => s + x.pages, 0);
  const books = new Set(week.map((s) => s.title));
  const body = `Semana passada: ${week.length} sessão(ões), ${pages} página(s) em ${books.size} livro(s): ${[...books].slice(0, 3).join(", ")}.`;
  await notifyFromAutomation(db, ownerId, { eventType: "library_summary", title: "📖 Resumo de leituras", body, url: "/biblioteca?aba=mesa", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: body };
}

