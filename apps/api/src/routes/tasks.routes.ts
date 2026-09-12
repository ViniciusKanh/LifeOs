import { Router } from "express";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { createTaskSchema, updateTaskSchema, moveTaskSchema } from "../validators/task.schema.js";

export const tasksRouter = Router();

// Toda rota deste arquivo exige sessão — req.user.id é a única fonte
// de verdade sobre "de quem" são os dados. NUNCA aceitar um owner_id
// vindo do corpo da requisição.
tasksRouter.use(requireAuth);

/** GET /api/tasks?status=&projectId= */
tasksRouter.get("/", async (req, res) => {
  const db = getDb();
  const { status, projectId } = req.query as { status?: string; projectId?: string };

  const conditions = ["owner_id = ?"];
  const args: Array<string | number> = [req.user!.id];

  if (status) {
    conditions.push("status = ?");
    args.push(status);
  }
  if (projectId) {
    conditions.push("project_id = ?");
    args.push(projectId);
  }

  const result = await db.execute({
    sql: `SELECT * FROM tasks WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`,
    args,
  });

  return res.json(result.rows);
});

/** GET /api/tasks/:id */
tasksRouter.get("/:id", async (req, res) => {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM tasks WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  const task = result.rows[0];
  if (!task) return res.status(404).json({ error: "Tarefa não encontrada." });
  return res.json(task);
});

/** POST /api/tasks */
tasksRouter.post("/", async (req, res) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const d = parsed.data;
  const db = getDb();
  const id = nanoid();

  await db.execute({
    sql: `INSERT INTO tasks (id, owner_id, project_id, title, description, status, priority, due_date, start_date, estimate_minutes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      req.user!.id,
      d.projectId ?? null,
      d.title,
      d.description ?? null,
      d.status ?? "Backlog",
      d.priority,
      d.dueDate ?? null,
      d.startDate ?? null,
      d.estimateMinutes ?? null,
    ],
  });

  const created = await db.execute({
    sql: "SELECT * FROM tasks WHERE id = ? AND owner_id = ?",
    args: [id, req.user!.id],
  });

  return res.status(201).json(created.rows[0]);
});

/** PATCH /api/tasks/:id */
tasksRouter.patch("/:id", async (req, res) => {
  const parsed = updateTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();

  const existing = await db.execute({
    sql: "SELECT id FROM tasks WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  if (existing.rows.length === 0) {
    return res.status(404).json({ error: "Tarefa não encontrada." });
  }

  const fieldMap: Record<string, string> = {
    title: "title",
    description: "description",
    projectId: "project_id",
    status: "status",
    priority: "priority",
    dueDate: "due_date",
    startDate: "start_date",
    estimateMinutes: "estimate_minutes",
    timeSpentMinutes: "time_spent_minutes",
    completedAt: "completed_at",
  };

  const sets: string[] = [];
  const args: Array<string | number | null> = [];
  for (const [key, column] of Object.entries(fieldMap)) {
    if (key in parsed.data) {
      sets.push(`${column} = ?`);
      args.push((parsed.data as Record<string, string | number | null>)[key]);
    }
  }
  sets.push("updated_at = datetime('now')");

  args.push(req.params.id, req.user!.id);

  await db.execute({
    sql: `UPDATE tasks SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`,
    args,
  });

  const updated = await db.execute({
    sql: "SELECT * FROM tasks WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });

  return res.json(updated.rows[0]);
});

/** PATCH /api/tasks/:id/move — usado pelo drag and drop do Kanban */
tasksRouter.patch("/:id/move", async (req, res) => {
  const parsed = moveTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Status inválido." });
  }
  const db = getDb();
  const result = await db.execute({
    sql: `UPDATE tasks SET status = ?, updated_at = datetime('now')
          WHERE id = ? AND owner_id = ?`,
    args: [parsed.data.status, req.params.id, req.user!.id],
  });
  if (result.rowsAffected === 0) {
    return res.status(404).json({ error: "Tarefa não encontrada." });
  }
  return res.status(204).send();
});

/** DELETE /api/tasks/:id */
tasksRouter.delete("/:id", async (req, res) => {
  const db = getDb();
  const result = await db.execute({
    sql: "DELETE FROM tasks WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  if (result.rowsAffected === 0) {
    return res.status(404).json({ error: "Tarefa não encontrada." });
  }
  return res.status(204).send();
});
