import { Router } from "express";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { createInboxItemSchema, processInboxItemSchema } from "../validators/inbox.schema.js";

/**
 * Inbox / Notas rápidas — captura única estilo GTD (Getting Things
 * Done): o usuário joga qualquer ideia, lembrete ou tarefa solta aqui
 * sem escolher projeto/status/prioridade na hora (reduz o atrito que
 * normalmente faz esse tipo de coisa nunca ser anotado). Depois cada
 * item é "processado" — vira tarefa de verdade ou é descartado.
 */
export const inboxRouter = Router();
inboxRouter.use(requireAuth);

/** GET /api/inbox?includeProcessed=true — por padrão só os pendentes (processed_at IS NULL). */
inboxRouter.get("/", async (req, res) => {
  const db = getDb();
  const includeProcessed = req.query.includeProcessed === "true";
  const rawLimit = Number(req.query.limit ?? (includeProcessed ? 200 : 100));
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 500) : 100;

  const result = await db.execute({
    sql: `SELECT * FROM inbox_items WHERE owner_id = ? ${includeProcessed ? "" : "AND processed_at IS NULL"} ORDER BY created_at DESC LIMIT ?`,
    args: [req.user!.id, limit],
  });
  return res.json(result.rows);
});

/** GET /api/inbox/stats — contagens leves para a página de Inbox, sem puxar histórico inteiro. */
inboxRouter.get("/stats", async (req, res) => {
  const db = getDb();
  const [pending, processedLast7d, capturedLast7d] = await Promise.all([
    db.execute({
      sql: "SELECT COUNT(*) as n FROM inbox_items WHERE owner_id = ? AND processed_at IS NULL",
      args: [req.user!.id],
    }),
    db.execute({
      sql: "SELECT COUNT(*) as n FROM inbox_items WHERE owner_id = ? AND processed_at IS NOT NULL AND date(processed_at) >= date('now', '-6 days')",
      args: [req.user!.id],
    }),
    db.execute({
      sql: "SELECT COUNT(*) as n FROM inbox_items WHERE owner_id = ? AND date(created_at) >= date('now', '-6 days')",
      args: [req.user!.id],
    }),
  ]);

  const n = (row: unknown) => Number((row as { n?: number }).n ?? 0);
  return res.json({
    pending: n(pending.rows[0]),
    processedLast7d: n(processedLast7d.rows[0]),
    capturedLast7d: n(capturedLast7d.rows[0]),
  });
});

/** POST /api/inbox — captura rápida, sem nenhum campo além do texto. */
inboxRouter.post("/", async (req, res) => {
  const parsed = createInboxItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const id = nanoid();

  await db.execute({
    sql: "INSERT INTO inbox_items (id, owner_id, content) VALUES (?, ?, ?)",
    args: [id, req.user!.id, parsed.data.content],
  });

  const created = await db.execute({ sql: "SELECT * FROM inbox_items WHERE id = ? AND owner_id = ?", args: [id, req.user!.id] });
  return res.status(201).json(created.rows[0]);
});

/**
 * PATCH /api/inbox/:id/process — decide o destino de um item.
 * action "task" cria uma tarefa real (título default = conteúdo
 * capturado) e marca o item como processado; "discard" só marca como
 * processado, sem criar nada.
 */
inboxRouter.patch("/:id/process", async (req, res) => {
  const parsed = processInboxItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const existing = await db.execute({
    sql: "SELECT * FROM inbox_items WHERE id = ? AND owner_id = ? AND processed_at IS NULL",
    args: [req.params.id, req.user!.id],
  });
  if (existing.rows.length === 0) return res.status(404).json({ error: "Item do inbox não encontrado." });

  const item = existing.rows[0] as unknown as { content: string };
  const d = parsed.data;

  let createdTaskId: string | null = null;
  if (d.action === "task") {
    if (d.projectId) {
      const project = await db.execute({ sql: "SELECT id FROM projects WHERE id = ? AND owner_id = ?", args: [d.projectId, req.user!.id] });
      if (project.rows.length === 0) return res.status(400).json({ error: "Projeto vinculado não encontrado." });
    }
    createdTaskId = nanoid();
    await db.execute({
      sql: `INSERT INTO tasks (id, owner_id, project_id, title, status, priority, due_date)
            VALUES (?, ?, ?, ?, 'Backlog', ?, ?)`,
      args: [createdTaskId, req.user!.id, d.projectId ?? null, (d.title ?? item.content).slice(0, 200), d.priority ?? "Média", d.dueDate ?? null],
    });
  }

  await db.execute({
    sql: "UPDATE inbox_items SET processed_at = datetime('now') WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });

  return res.json({ processed: true, taskId: createdTaskId });
});

/** DELETE /api/inbox/:id — remove o item sem processar (ex.: capturado por engano). */
inboxRouter.delete("/:id", async (req, res) => {
  const db = getDb();
  const result = await db.execute({ sql: "DELETE FROM inbox_items WHERE id = ? AND owner_id = ?", args: [req.params.id, req.user!.id] });
  if (result.rowsAffected === 0) return res.status(404).json({ error: "Item do inbox não encontrado." });
  return res.status(204).send();
});
