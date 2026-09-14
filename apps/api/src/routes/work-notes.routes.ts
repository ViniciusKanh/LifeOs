import { Router } from "express";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { createWorkNoteSchema } from "../validators/work-note.schema.js";

/**
 * Reuniões 1:1 e anotações recorrentes (Área Profissional) — log
 * cronológico simples, não um agendador (isso é o Calendário).
 */
export const workNotesRouter = Router();
workNotesRouter.use(requireAuth);

/** GET /api/work-notes?limit=20 */
workNotesRouter.get("/", async (req, res) => {
  const db = getDb();
  const rawLimit = Number(req.query.limit ?? 30);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100) : 30;

  const result = await db.execute({
    sql: "SELECT * FROM work_notes WHERE owner_id = ? ORDER BY occurred_at DESC, created_at DESC LIMIT ?",
    args: [req.user!.id, limit],
  });
  return res.json(result.rows);
});

/** POST /api/work-notes */
workNotesRouter.post("/", async (req, res) => {
  const parsed = createWorkNoteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const id = nanoid();

  await db.execute({
    sql: "INSERT INTO work_notes (id, owner_id, title, content, occurred_at) VALUES (?, ?, ?, ?, ?)",
    args: [id, req.user!.id, parsed.data.title, parsed.data.content ?? null, parsed.data.occurredAt],
  });

  const created = await db.execute({ sql: "SELECT * FROM work_notes WHERE id = ? AND owner_id = ?", args: [id, req.user!.id] });
  return res.status(201).json(created.rows[0]);
});

/** DELETE /api/work-notes/:id */
workNotesRouter.delete("/:id", async (req, res) => {
  const db = getDb();
  const result = await db.execute({ sql: "DELETE FROM work_notes WHERE id = ? AND owner_id = ?", args: [req.params.id, req.user!.id] });
  if (result.rowsAffected === 0) return res.status(404).json({ error: "Anotação não encontrada." });
  return res.status(204).send();
});
