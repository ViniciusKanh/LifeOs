import { nanoid } from "nanoid";
import type { getDb } from "../db/client.js";
import { syncAutoHabitsAfterWrite } from "./habitAutoService.js";

type Db = ReturnType<typeof getDb>;

export interface ReadingSessionInsert {
  startedAt: string;
  endedAt?: string | null;
  durationMinutes?: number | null;
  pagesRead?: number;
}

/**
 * Registra uma sessão de leitura já concluída e avança o progresso do
 * livro (current_page) — extraído de POST /api/books/:id/sessions para o
 * Copilot gravar do mesmo jeito. Quem chama deve garantir antes que o
 * livro pertence a `ownerId` (o UPDATE também filtra owner_id).
 */
export async function insertReadingSession(db: Db, ownerId: string, bookId: string, d: ReadingSessionInsert) {
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO reading_sessions (id, book_id, owner_id, started_at, ended_at, duration_minutes, pages_read)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, bookId, ownerId, d.startedAt, d.endedAt ?? null, d.durationMinutes ?? null, d.pagesRead ?? 0],
  });

  // Atualiza o progresso de páginas do livro somando as páginas lidas
  // na sessão — mesma lógica de "estado avança conforme o registro real".
  if (d.pagesRead) {
    await db.execute({
      sql: `UPDATE books SET current_page = current_page + ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?`,
      args: [d.pagesRead, bookId, ownerId],
    });
  }

  await syncAutoHabitsAfterWrite(db, ownerId, d.startedAt);
  const created = await db.execute({ sql: "SELECT * FROM reading_sessions WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  return created.rows[0];
}
