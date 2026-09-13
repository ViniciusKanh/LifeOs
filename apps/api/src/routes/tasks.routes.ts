import { Router } from "express";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { createTaskSchema, updateTaskSchema, moveTaskSchema } from "../validators/task.schema.js";
import { addDependencySchema } from "../validators/project.schema.js";

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

/** GET /api/tasks/:id/time/active — apontamento de tempo em aberto para esta tarefa, se houver */
tasksRouter.get("/:id/time/active", async (req, res) => {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM time_entries WHERE task_id = ? AND owner_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1",
    args: [req.params.id, req.user!.id],
  });
  return res.json(result.rows[0] ?? null);
});

/** POST /api/tasks/:id/time/start — inicia o cronômetro de uma tarefa (monitora o tempo gasto nela) */
tasksRouter.post("/:id/time/start", async (req, res) => {
  const db = getDb();
  const task = await db.execute({
    sql: "SELECT id, project_id FROM tasks WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  if (task.rows.length === 0) return res.status(404).json({ error: "Tarefa não encontrada." });

  // Só um apontamento aberto por vez — fecha qualquer um pendurado antes de abrir outro.
  await db.execute({
    sql: "UPDATE time_entries SET ended_at = datetime('now') WHERE owner_id = ? AND ended_at IS NULL",
    args: [req.user!.id],
  });

  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO time_entries (id, owner_id, task_id, project_id, started_at, kind)
          VALUES (?, ?, ?, ?, datetime('now'), 'manual')`,
    args: [id, req.user!.id, req.params.id, task.rows[0].project_id ?? null],
  });
  const created = await db.execute({ sql: "SELECT * FROM time_entries WHERE id = ?", args: [id] });
  return res.status(201).json(created.rows[0]);
});

/** PATCH /api/tasks/:id/time/stop — encerra o cronômetro e soma o tempo em tasks.time_spent_minutes */
tasksRouter.patch("/:id/time/stop", async (req, res) => {
  const db = getDb();
  const open = await db.execute({
    sql: "SELECT * FROM time_entries WHERE task_id = ? AND owner_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1",
    args: [req.params.id, req.user!.id],
  });
  const entry = open.rows[0];
  if (!entry) return res.status(404).json({ error: "Nenhum apontamento de tempo em aberto para esta tarefa." });

  await db.execute({
    sql: `UPDATE time_entries
          SET ended_at = datetime('now'),
              duration_minutes = CAST((julianday(datetime('now')) - julianday(started_at)) * 24 * 60 AS INTEGER)
          WHERE id = ?`,
    args: [entry.id],
  });
  const updatedEntry = await db.execute({ sql: "SELECT * FROM time_entries WHERE id = ?", args: [entry.id] });
  const minutes = Number(updatedEntry.rows[0]?.duration_minutes ?? 0);

  await db.execute({
    sql: "UPDATE tasks SET time_spent_minutes = time_spent_minutes + ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?",
    args: [minutes, req.params.id, req.user!.id],
  });
  const task = await db.execute({ sql: "SELECT * FROM tasks WHERE id = ? AND owner_id = ?", args: [req.params.id, req.user!.id] });
  return res.json(task.rows[0]);
});

/** GET /api/tasks/:id/dependencies — ids das tarefas das quais esta depende. */
tasksRouter.get("/:id/dependencies", async (req, res) => {
  const db = getDb();
  const owned = await db.execute({ sql: "SELECT id FROM tasks WHERE id = ? AND owner_id = ?", args: [req.params.id, req.user!.id] });
  if (owned.rows.length === 0) return res.status(404).json({ error: "Tarefa não encontrada." });

  const result = await db.execute({ sql: "SELECT depends_on_id FROM task_dependencies WHERE task_id = ?", args: [req.params.id] });
  return res.json((result.rows as unknown as Array<{ depends_on_id: string }>).map((r) => r.depends_on_id));
});

/**
 * POST /api/tasks/:id/dependencies — marca que esta tarefa só pode
 * avançar depois de outra (usado pelo Gantt de projetos). Ambas as
 * tarefas precisam pertencer ao usuário logado, e uma tarefa nunca
 * pode depender dela mesma.
 */
tasksRouter.post("/:id/dependencies", async (req, res) => {
  const parsed = addDependencySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  if (parsed.data.dependsOnId === req.params.id) {
    return res.status(400).json({ error: "Uma tarefa não pode depender dela mesma." });
  }
  const db = getDb();

  const [task, dependsOn] = await Promise.all([
    db.execute({ sql: "SELECT id FROM tasks WHERE id = ? AND owner_id = ?", args: [req.params.id, req.user!.id] }),
    db.execute({ sql: "SELECT id FROM tasks WHERE id = ? AND owner_id = ?", args: [parsed.data.dependsOnId, req.user!.id] }),
  ]);
  if (task.rows.length === 0) return res.status(404).json({ error: "Tarefa não encontrada." });
  if (dependsOn.rows.length === 0) return res.status(404).json({ error: "Tarefa da qual depende não encontrada." });

  await db.execute({
    sql: "INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)",
    args: [req.params.id, parsed.data.dependsOnId],
  });
  return res.status(201).json({ ok: true });
});

/** DELETE /api/tasks/:id/dependencies/:dependsOnId */
tasksRouter.delete("/:id/dependencies/:dependsOnId", async (req, res) => {
  const db = getDb();
  const owned = await db.execute({ sql: "SELECT id FROM tasks WHERE id = ? AND owner_id = ?", args: [req.params.id, req.user!.id] });
  if (owned.rows.length === 0) return res.status(404).json({ error: "Tarefa não encontrada." });

  await db.execute({
    sql: "DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_id = ?",
    args: [req.params.id, req.params.dependsOnId],
  });
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
