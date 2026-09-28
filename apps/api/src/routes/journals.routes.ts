import { Router } from "express";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";

/**
 * "Diários" — coleções nomeadas (Pessoal, Viagens, Estudos...) que o
 * usuário cria pra organizar as entradas do Diário. Um dia (journal_entries)
 * pode pertencer a vários diários ao mesmo tempo (journal_entry_journals).
 * CRUD simples, sempre isolado por owner_id; "excluir" é soft delete
 * (archived_at) — nunca apaga a associação com entradas já escritas.
 */
export const journalsRouter = Router();
journalsRouter.use(requireAuth);

const upsertJournalSchema = z.object({
  name: z.string().trim().min(1).max(60),
  icon: z.string().trim().max(8).optional().nullable(),
  color: z.enum(["pink", "blue", "purple", "green", "teal"]).optional().nullable(),
  description: z.string().trim().max(300).optional().nullable(),
});

journalsRouter.get("/", async (req, res) => {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM journals WHERE owner_id = ? AND archived_at IS NULL ORDER BY sort_order ASC, created_at ASC",
    args: [req.user!.id],
  });
  return res.json(result.rows);
});

journalsRouter.post("/", async (req, res) => {
  const parsed = upsertJournalSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const ownerId = req.user!.id;
  const id = nanoid();

  const countRes = await db.execute({
    sql: "SELECT COUNT(*) AS total FROM journals WHERE owner_id = ? AND archived_at IS NULL",
    args: [ownerId],
  });
  const sortOrder = Number((countRes.rows[0] as unknown as { total: number }).total);

  await db.execute({
    sql: "INSERT INTO journals (id, owner_id, name, icon, color, description, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [id, ownerId, parsed.data.name, parsed.data.icon ?? null, parsed.data.color ?? "pink", parsed.data.description ?? null, sortOrder],
  });

  const created = await db.execute({ sql: "SELECT * FROM journals WHERE id = ?", args: [id] });
  return res.status(201).json(created.rows[0]);
});

journalsRouter.patch("/:id", async (req, res) => {
  const parsed = upsertJournalSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const ownerId = req.user!.id;
  const { id } = req.params;

  const existing = await db.execute({ sql: "SELECT id FROM journals WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  if (existing.rows.length === 0) return res.status(404).json({ error: "Diário não encontrado." });

  const data = parsed.data;
  await db.execute({
    sql: `UPDATE journals SET
            name = COALESCE(?, name),
            icon = CASE WHEN ? THEN ? ELSE icon END,
            color = COALESCE(?, color),
            description = CASE WHEN ? THEN ? ELSE description END,
            updated_at = datetime('now')
          WHERE id = ? AND owner_id = ?`,
    args: [
      data.name ?? null,
      "icon" in data ? 1 : 0,
      data.icon ?? null,
      data.color ?? null,
      "description" in data ? 1 : 0,
      data.description ?? null,
      id,
      ownerId,
    ],
  });

  const updated = await db.execute({ sql: "SELECT * FROM journals WHERE id = ?", args: [id] });
  return res.json(updated.rows[0]);
});

/** DELETE = soft delete (archived_at). As entradas já vinculadas continuam existindo e aparecem em "Todos". */
journalsRouter.delete("/:id", async (req, res) => {
  const db = getDb();
  const result = await db.execute({
    sql: "UPDATE journals SET archived_at = datetime('now') WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  if (result.rowsAffected === 0) return res.status(404).json({ error: "Diário não encontrado." });
  return res.status(204).send();
});
