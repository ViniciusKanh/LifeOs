import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { dayKeyIn, userTimezone } from "./gamificationService.js";
import { normalizeStoredUtc } from "./healthService.js";

/**
 * Meta anual de leitura + mural de citações da Biblioteca.
 *
 * O progresso nunca é armazenado: livros concluídos no ano e páginas lidas
 * no ano são derivados das fontes originais (books e reading_sessions),
 * sempre no fuso do usuário. A projeção usa só o ritmo real do ano.
 */

export class ReadingYearError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type PaceStatus = "adiantado" | "no_ritmo" | "atrasado" | "sem_dados";

export interface TargetProgress {
  target: number;
  done: number;
  pct: number;
  /** Quanto já deveria estar feito hoje para fechar o ano no alvo (linear). */
  expectedByNow: number;
  /** Projeção para 31/12 mantendo o ritmo do ano. null quando ainda não há ritmo. */
  projected: number | null;
  status: PaceStatus;
  /** Quanto falta por dia (ou semana p/ livros) até o fim do ano. */
  remainingPerDay: number | null;
}

export interface ReadingYearSummary {
  year: number;
  today: string;
  timezone: string;
  isCurrentYear: boolean;
  /** Dias decorridos no ano (inclui hoje) e total de dias do ano. */
  dayOfYear: number;
  daysInYear: number;
  goal: { booksTarget: number | null; pagesTarget: number | null } | null;
  booksFinished: number;
  pagesRead: number;
  books: TargetProgress | null;
  pages: TargetProgress | null;
  finishedList: Array<{ id: string; title: string; author: string | null; coverUrl: string | null; finishedDay: string }>;
}

type Row = Record<string, unknown>;

function daysInYear(year: number) {
  return (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000;
}

function dayIndex(dayKey: string, year: number) {
  return Math.round((Date.parse(`${dayKey}T00:00:00Z`) - Date.UTC(year, 0, 1)) / 86_400_000) + 1;
}

/** Dia local de um valor salvo: data pura (YYYY-MM-DD) já é dia; timestamp é convertido do UTC. */
function localDay(stored: string, tz: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(stored)) return stored;
  const d = new Date(normalizeStoredUtc(stored));
  return Number.isNaN(d.getTime()) ? stored.slice(0, 10) : dayKeyIn(d, tz);
}

/**
 * Status de ritmo (função pura, testada): compara o feito com o esperado
 * linear até hoje. Tolerância de ±10% conta como "no ritmo".
 */
export function paceFor(target: number, done: number, elapsedDays: number, totalDays: number, isCurrentYear: boolean): TargetProgress {
  const fraction = isCurrentYear ? Math.min(1, Math.max(0, elapsedDays / totalDays)) : 1;
  const expectedByNow = Math.round(target * fraction * 10) / 10;
  const projected = isCurrentYear ? (done > 0 && elapsedDays > 0 ? Math.round((done / elapsedDays) * totalDays) : null) : done;
  let status: PaceStatus;
  if (isCurrentYear && done === 0 && elapsedDays < 7) status = "sem_dados";
  else if (done >= target) status = "adiantado";
  else if (expectedByNow <= 0) status = "no_ritmo";
  else {
    const ratio = done / expectedByNow;
    status = ratio >= 1.1 ? "adiantado" : ratio >= 0.9 ? "no_ritmo" : "atrasado";
  }
  const remainingDays = isCurrentYear ? Math.max(1, totalDays - elapsedDays + 1) : 0;
  const remainingPerDay = isCurrentYear && done < target ? Math.round(((target - done) / remainingDays) * 10) / 10 : null;
  return { target, done, pct: Math.min(100, Math.round((done / target) * 100)), expectedByNow, projected, status, remainingPerDay };
}

export async function getYearGoal(db: Client, ownerId: string, year: number) {
  const r = await db.execute({ sql: "SELECT books_target, pages_target FROM reading_year_goals WHERE owner_id = ? AND year = ?", args: [ownerId, year] });
  const row = r.rows[0] as unknown as Row | undefined;
  if (!row) return null;
  return {
    booksTarget: row.books_target == null ? null : Number(row.books_target),
    pagesTarget: row.pages_target == null ? null : Number(row.pages_target),
  };
}

export async function upsertYearGoal(db: Client, ownerId: string, year: number, input: { booksTarget: number | null; pagesTarget: number | null }) {
  if (input.booksTarget == null && input.pagesTarget == null) throw new ReadingYearError(400, "Defina ao menos uma meta: livros ou páginas.");
  await db.execute({
    sql: `INSERT INTO reading_year_goals (id, owner_id, year, books_target, pages_target) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (owner_id, year) DO UPDATE SET books_target = excluded.books_target, pages_target = excluded.pages_target, updated_at = datetime('now')`,
    args: [nanoid(), ownerId, year, input.booksTarget, input.pagesTarget],
  });
}

export async function deleteYearGoal(db: Client, ownerId: string, year: number) {
  const r = await db.execute({ sql: "DELETE FROM reading_year_goals WHERE owner_id = ? AND year = ?", args: [ownerId, year] });
  if (r.rowsAffected === 0) throw new ReadingYearError(404, "Meta não encontrada.");
}

export async function getReadingYearSummary(db: Client, ownerId: string, year: number | undefined, now = new Date()): Promise<ReadingYearSummary> {
  const tz = await userTimezone(db, ownerId);
  const today = dayKeyIn(now, tz);
  const currentYear = Number(today.slice(0, 4));
  const y = year ?? currentYear;
  const total = daysInYear(y);
  const isCurrentYear = y === currentYear;
  const elapsed = isCurrentYear ? dayIndex(today, y) : y < currentYear ? total : 0;

  // Pré-filtro textual com folga de 1 dia nas bordas; o corte exato é no fuso do usuário.
  const lo = `${y - 1}-12-31`;
  const hi = `${y + 1}-01-02`;
  const [goal, finished, sessions] = await Promise.all([
    getYearGoal(db, ownerId, y),
    // Livro sem finished_at preenchido: usamos a última atualização (quando foi marcado como concluído).
    db.execute({
      sql: `SELECT id, title, author, cover_url, COALESCE(finished_at, updated_at) AS fin FROM books
            WHERE owner_id = ? AND status = 'Concluído' AND COALESCE(finished_at, updated_at) >= ? AND COALESCE(finished_at, updated_at) < ?`,
      args: [ownerId, lo, hi],
    }),
    db.execute({
      sql: "SELECT started_at, pages_read FROM reading_sessions WHERE owner_id = ? AND started_at >= ? AND started_at < ? AND pages_read > 0",
      args: [ownerId, lo, hi],
    }),
  ]);

  const prefix = `${y}-`;
  const finishedList = (finished.rows as unknown as Row[])
    .map((r) => ({
      id: String(r.id),
      title: String(r.title),
      author: r.author == null ? null : String(r.author),
      coverUrl: r.cover_url == null ? null : String(r.cover_url),
      finishedDay: localDay(String(r.fin), tz),
    }))
    .filter((b) => b.finishedDay.startsWith(prefix))
    .sort((a, b) => b.finishedDay.localeCompare(a.finishedDay));
  const pagesRead = (sessions.rows as unknown as Row[])
    .filter((r) => localDay(String(r.started_at), tz).startsWith(prefix))
    .reduce((sum, r) => sum + Number(r.pages_read ?? 0), 0);

  return {
    year: y,
    today,
    timezone: tz,
    isCurrentYear,
    dayOfYear: elapsed,
    daysInYear: total,
    goal,
    booksFinished: finishedList.length,
    pagesRead,
    books: goal?.booksTarget ? paceFor(goal.booksTarget, finishedList.length, elapsed, total, isCurrentYear) : null,
    pages: goal?.pagesTarget ? paceFor(goal.pagesTarget, pagesRead, elapsed, total, isCurrentYear) : null,
    finishedList,
  };
}

// ------------------------------------------------------------
// Mural de citações (reaproveita book_notes)
// ------------------------------------------------------------

export type QuoteKind = "quote" | "insight" | "note" | "summary" | "idea";

export interface QuoteItem {
  id: string;
  bookId: string;
  bookTitle: string;
  bookAuthor: string | null;
  coverUrl: string | null;
  kind: QuoteKind;
  content: string;
  page: number | null;
  createdAt: string;
  /** Já virou cartão no Grimório. */
  cardCount: number;
}

export async function listQuotes(
  db: Client,
  ownerId: string,
  opts: { bookId?: string; q?: string; kinds?: QuoteKind[]; limit?: number } = {},
): Promise<QuoteItem[]> {
  const kinds = opts.kinds?.length ? opts.kinds : (["quote", "insight"] as QuoteKind[]);
  const cond = ["n.owner_id = ?", `n.kind IN (${kinds.map(() => "?").join(",")})`];
  const args: Array<string | number> = [ownerId, ...kinds];
  if (opts.bookId) {
    cond.push("n.book_id = ?");
    args.push(opts.bookId);
  }
  if (opts.q?.trim()) {
    cond.push("(n.content LIKE ? ESCAPE '\\' OR b.title LIKE ? ESCAPE '\\' OR COALESCE(b.author, '') LIKE ? ESCAPE '\\')");
    const like = `%${opts.q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    args.push(like, like, like);
  }
  args.push(Math.min(500, Math.max(1, opts.limit ?? 200)));
  const r = await db.execute({
    sql: `SELECT n.id, n.book_id, n.kind, n.content, n.page, n.created_at, b.title, b.author, b.cover_url,
            (SELECT COUNT(*) FROM flashcards f WHERE f.owner_id = n.owner_id AND f.source_note_id = n.id) AS card_count
          FROM book_notes n JOIN books b ON b.id = n.book_id AND b.owner_id = n.owner_id
          WHERE ${cond.join(" AND ")}
          ORDER BY n.created_at DESC LIMIT ?`,
    args,
  });
  return (r.rows as unknown as Row[]).map((row) => ({
    id: String(row.id),
    bookId: String(row.book_id),
    bookTitle: String(row.title),
    bookAuthor: row.author == null ? null : String(row.author),
    coverUrl: row.cover_url == null ? null : String(row.cover_url),
    kind: String(row.kind) as QuoteKind,
    content: String(row.content),
    page: row.page == null ? null : Number(row.page),
    createdAt: String(row.created_at),
    cardCount: Number(row.card_count ?? 0),
  }));
}
