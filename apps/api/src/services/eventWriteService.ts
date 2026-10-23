import { nanoid } from "nanoid";
import type { getDb } from "../db/client.js";
import type { CreateEventInput } from "../validators/event.schema.js";

type Db = ReturnType<typeof getDb>;

/** Cria um evento manual no calendário — extraído de POST /api/events (reutilizado pelo Copilot). */
export async function insertManualEvent(db: Db, ownerId: string, d: CreateEventInput) {
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO events (id, owner_id, title, description, starts_at, ends_at, all_day, source_type)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'manual')`,
    args: [id, ownerId, d.title, d.description ?? null, d.startsAt, d.endsAt ?? null, d.allDay ? 1 : 0],
  });
  const created = await db.execute({ sql: "SELECT * FROM events WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  return created.rows[0];
}
