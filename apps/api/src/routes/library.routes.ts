import { Router } from "express";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { lookupIsbn } from "../services/bookLookupService.js";
import {
  createBookSchema,
  updateBookSchema,
  bookNoteSchema,
  readingSessionSchema,
} from "../validators/library.schema.js";

export const libraryRouter = Router();

// Como em tasks/habits: toda rota exige sessão, e req.user.id é a
// única fonte de verdade sobre o dono dos dados.
libraryRouter.use(requireAuth);

async function getOwnedBook(bookId: string, ownerId: string) {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM books WHERE id = ? AND owner_id = ?",
    args: [bookId, ownerId],
  });
  return result.rows[0] ?? null;
}

/** GET /api/books?status=&search= */
libraryRouter.get("/books", async (req, res) => {
  const db = getDb();
  const { status, search } = req.query as { status?: string; search?: string };

  const conditions = ["owner_id = ?"];
  const args: Array<string | number> = [req.user!.id];

  if (status) {
    conditions.push("status = ?");
    args.push(status);
  }
  if (search) {
    conditions.push("(title LIKE ? OR author LIKE ?)");
    args.push(`%${search}%`, `%${search}%`);
  }

  const result = await db.execute({
    sql: `SELECT * FROM books WHERE ${conditions.join(" AND ")} ORDER BY updated_at DESC`,
    args,
  });
  return res.json(result.rows);
});

/** GET /api/books/lookup/:isbn — preview de metadados, não grava nada */
libraryRouter.get("/books/lookup/:isbn", async (req, res) => {
  const found = await lookupIsbn(req.params.isbn);
  if (!found) {
    return res.status(404).json({ error: "Nenhum livro encontrado para este ISBN." });
  }
  return res.json(found);
});

/** GET /api/books/:id */
libraryRouter.get("/books/:id", async (req, res) => {
  const book = await getOwnedBook(req.params.id, req.user!.id);
  if (!book) return res.status(404).json({ error: "Livro não encontrado." });
  return res.json(book);
});

/** POST /api/books */
libraryRouter.post("/books", async (req, res) => {
  const parsed = createBookSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const d = parsed.data;
  const db = getDb();
  const id = nanoid();

  await db.execute({
    sql: `INSERT INTO books (id, owner_id, isbn, title, author, publisher, cover_url, published_year, total_pages, categories, description, status, source)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      req.user!.id,
      d.isbn ?? null,
      d.title,
      d.author ?? null,
      d.publisher ?? null,
      d.coverUrl ?? null,
      d.publishedYear ?? null,
      d.totalPages ?? null,
      d.categories ? JSON.stringify(d.categories) : null,
      d.description ?? null,
      d.status ?? "Quero Ler",
      d.source ?? "manual",
    ],
  });

  const created = await getOwnedBook(id, req.user!.id);
  return res.status(201).json(created);
});

const BOOK_FIELD_MAP: Record<string, string> = {
  isbn: "isbn",
  title: "title",
  author: "author",
  publisher: "publisher",
  coverUrl: "cover_url",
  publishedYear: "published_year",
  totalPages: "total_pages",
  description: "description",
  status: "status",
  source: "source",
  currentPage: "current_page",
  rating: "rating",
  personalNote: "personal_note",
  startedAt: "started_at",
  finishedAt: "finished_at",
};

/** PATCH /api/books/:id */
libraryRouter.patch("/books/:id", async (req, res) => {
  const parsed = updateBookSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const existing = await getOwnedBook(req.params.id, req.user!.id);
  if (!existing) return res.status(404).json({ error: "Livro não encontrado." });

  const data = parsed.data as Record<string, unknown>;
  const sets: string[] = [];
  const args: Array<string | number | null> = [];

  for (const [key, column] of Object.entries(BOOK_FIELD_MAP)) {
    if (key in data) {
      const value = key === "categories" ? undefined : data[key];
      sets.push(`${column} = ?`);
      args.push(value === undefined ? null : (value as string | number | null));
    }
  }
  if ("categories" in data && Array.isArray(data.categories)) {
    sets.push("categories = ?");
    args.push(JSON.stringify(data.categories));
  }
  if (sets.length === 0) {
    return res.status(400).json({ error: "Nenhum campo para atualizar." });
  }
  sets.push("updated_at = datetime('now')");
  args.push(req.params.id, req.user!.id);

  const db = getDb();
  await db.execute({
    sql: `UPDATE books SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`,
    args,
  });

  const updated = await getOwnedBook(req.params.id, req.user!.id);
  return res.json(updated);
});

/** DELETE /api/books/:id — cascata apaga notas e sessões (FK ON DELETE CASCADE) */
libraryRouter.delete("/books/:id", async (req, res) => {
  const db = getDb();
  const result = await db.execute({
    sql: "DELETE FROM books WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  if (result.rowsAffected === 0) {
    return res.status(404).json({ error: "Livro não encontrado." });
  }
  return res.status(204).send();
});

/** GET /api/books/:id/notes */
libraryRouter.get("/books/:id/notes", async (req, res) => {
  const book = await getOwnedBook(req.params.id, req.user!.id);
  if (!book) return res.status(404).json({ error: "Livro não encontrado." });

  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM book_notes WHERE book_id = ? AND owner_id = ? ORDER BY created_at DESC",
    args: [req.params.id, req.user!.id],
  });
  return res.json(result.rows);
});

/** POST /api/books/:id/notes */
libraryRouter.post("/books/:id/notes", async (req, res) => {
  const parsed = bookNoteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const book = await getOwnedBook(req.params.id, req.user!.id);
  if (!book) return res.status(404).json({ error: "Livro não encontrado." });

  const db = getDb();
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO book_notes (id, book_id, owner_id, kind, content, page)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, req.params.id, req.user!.id, parsed.data.kind ?? "note", parsed.data.content, parsed.data.page ?? null],
  });
  const created = await db.execute({ sql: "SELECT * FROM book_notes WHERE id = ?", args: [id] });
  return res.status(201).json(created.rows[0]);
});

/** DELETE /api/books/:id/notes/:noteId */
libraryRouter.delete("/books/:id/notes/:noteId", async (req, res) => {
  const db = getDb();
  const result = await db.execute({
    sql: "DELETE FROM book_notes WHERE id = ? AND book_id = ? AND owner_id = ?",
    args: [req.params.noteId, req.params.id, req.user!.id],
  });
  if (result.rowsAffected === 0) {
    return res.status(404).json({ error: "Nota não encontrada." });
  }
  return res.status(204).send();
});

/** GET /api/books/:id/sessions */
libraryRouter.get("/books/:id/sessions", async (req, res) => {
  const book = await getOwnedBook(req.params.id, req.user!.id);
  if (!book) return res.status(404).json({ error: "Livro não encontrado." });

  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM reading_sessions WHERE book_id = ? AND owner_id = ? ORDER BY started_at DESC",
    args: [req.params.id, req.user!.id],
  });
  return res.json(result.rows);
});

/** POST /api/books/:id/sessions — registra uma sessão de leitura já concluída */
libraryRouter.post("/books/:id/sessions", async (req, res) => {
  const parsed = readingSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const book = await getOwnedBook(req.params.id, req.user!.id);
  if (!book) return res.status(404).json({ error: "Livro não encontrado." });

  const d = parsed.data;
  const db = getDb();
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO reading_sessions (id, book_id, owner_id, started_at, ended_at, duration_minutes, pages_read)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, req.params.id, req.user!.id, d.startedAt, d.endedAt ?? null, d.durationMinutes ?? null, d.pagesRead ?? 0],
  });

  // Atualiza o progresso de páginas do livro somando as páginas lidas
  // na sessão — mesma lógica de "estado avança conforme o registro real".
  if (d.pagesRead) {
    await db.execute({
      sql: `UPDATE books SET current_page = current_page + ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?`,
      args: [d.pagesRead, req.params.id, req.user!.id],
    });
  }

  const created = await db.execute({ sql: "SELECT * FROM reading_sessions WHERE id = ?", args: [id] });
  return res.status(201).json(created.rows[0]);
});
