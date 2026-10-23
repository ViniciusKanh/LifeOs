import { nanoid } from "nanoid";
import type { getDb } from "../db/client.js";

type Db = ReturnType<typeof getDb>;

/** Captura rápida na Inbox — extraído de POST /api/inbox (reutilizado pelo Copilot). */
export async function insertInboxItem(db: Db, ownerId: string, content: string) {
  const id = nanoid();
  await db.execute({
    sql: "INSERT INTO inbox_items (id, owner_id, content) VALUES (?, ?, ?)",
    args: [id, ownerId, content],
  });
  const created = await db.execute({ sql: "SELECT * FROM inbox_items WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  return created.rows[0];
}
