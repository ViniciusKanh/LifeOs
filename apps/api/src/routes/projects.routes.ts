import { Router } from "express";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { createProjectSchema, updateProjectSchema } from "../validators/project.schema.js";

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

/** GET /api/projects?includeArchived=true */
projectsRouter.get("/", async (req, res) => {
  const db = getDb();
  const includeArchived = req.query.includeArchived === "true";

  const result = await db.execute({
    sql: `SELECT p.*,
            (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count,
            (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'Concluído') AS done_count
          FROM projects p
          WHERE p.owner_id = ? ${includeArchived ? "" : "AND p.archived_at IS NULL"}
          ORDER BY p.created_at DESC`,
    args: [req.user!.id],
  });
  return res.json(result.rows);
});

/** POST /api/projects */
projectsRouter.post("/", async (req, res) => {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const d = parsed.data;
  const db = getDb();
  const id = nanoid();

  await db.execute({
    sql: `INSERT INTO projects (id, owner_id, parent_id, name, description, kind, color)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, req.user!.id, d.parentId ?? null, d.name, d.description ?? null, d.kind, d.color ?? null],
  });

  const created = await db.execute({ sql: "SELECT * FROM projects WHERE id = ? AND owner_id = ?", args: [id, req.user!.id] });
  return res.status(201).json(created.rows[0]);
});

/** PATCH /api/projects/:id */
projectsRouter.patch("/:id", async (req, res) => {
  const parsed = updateProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const existing = await db.execute({ sql: "SELECT id FROM projects WHERE id = ? AND owner_id = ?", args: [req.params.id, req.user!.id] });
  if (existing.rows.length === 0) return res.status(404).json({ error: "Projeto não encontrado." });

  const { name, description, color, archived } = parsed.data;
  const sets: string[] = [];
  const args: Array<string | number | null> = [];
  if (name !== undefined) { sets.push("name = ?"); args.push(name); }
  if (description !== undefined) { sets.push("description = ?"); args.push(description); }
  if (color !== undefined) { sets.push("color = ?"); args.push(color); }
  if (archived !== undefined) { sets.push("archived_at = ?"); args.push(archived ? new Date().toISOString() : null); }
  sets.push("updated_at = datetime('now')");
  args.push(req.params.id, req.user!.id);

  await db.execute({ sql: `UPDATE projects SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`, args });
  const updated = await db.execute({ sql: "SELECT * FROM projects WHERE id = ? AND owner_id = ?", args: [req.params.id, req.user!.id] });
  return res.json(updated.rows[0]);
});

/** DELETE /api/projects/:id — as tarefas do projeto continuam existindo, só perdem o vínculo (project_id vira NULL). */
projectsRouter.delete("/:id", async (req, res) => {
  const db = getDb();
  const result = await db.execute({ sql: "DELETE FROM projects WHERE id = ? AND owner_id = ?", args: [req.params.id, req.user!.id] });
  if (result.rowsAffected === 0) return res.status(404).json({ error: "Projeto não encontrado." });
  return res.status(204).send();
});

/**
 * GET /api/projects/:id/gantt — todas as tarefas do projeto que têm
 * ao menos uma data (início ou prazo), já com as dependências
 * (task_dependencies) resolvidas. Tarefa sem nenhuma data não aparece
 * no Gantt (não daria pra desenhar uma barra sem início nem fim) mas
 * continua existindo normalmente no Kanban/lista de Tarefas.
 */
projectsRouter.get("/:id/gantt", async (req, res) => {
  const db = getDb();
  const project = await db.execute({ sql: "SELECT id, name FROM projects WHERE id = ? AND owner_id = ?", args: [req.params.id, req.user!.id] });
  if (project.rows.length === 0) return res.status(404).json({ error: "Projeto não encontrado." });

  const tasks = await db.execute({
    sql: `SELECT id, title, status, priority, start_date, due_date, completed_at
          FROM tasks
          WHERE owner_id = ? AND project_id = ? AND (start_date IS NOT NULL OR due_date IS NOT NULL)
          ORDER BY COALESCE(start_date, due_date) ASC`,
    args: [req.user!.id, req.params.id],
  });

  const taskIds = (tasks.rows as unknown as Array<{ id: string }>).map((t) => t.id);
  let dependenciesByTask = new Map<string, string[]>();
  if (taskIds.length > 0) {
    const placeholders = taskIds.map(() => "?").join(", ");
    const deps = await db.execute({
      sql: `SELECT task_id, depends_on_id FROM task_dependencies WHERE task_id IN (${placeholders})`,
      args: taskIds,
    });
    dependenciesByTask = new Map();
    for (const row of deps.rows as unknown as Array<{ task_id: string; depends_on_id: string }>) {
      const list = dependenciesByTask.get(row.task_id) ?? [];
      list.push(row.depends_on_id);
      dependenciesByTask.set(row.task_id, list);
    }
  }

  const ganttTasks = (tasks.rows as unknown as Array<{
    id: string; title: string; status: string; priority: string; start_date: string | null; due_date: string | null; completed_at: string | null;
  }>).map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    startDate: t.start_date,
    dueDate: t.due_date,
    completedAt: t.completed_at,
    dependsOn: dependenciesByTask.get(t.id) ?? [],
  }));

  return res.json({ project: project.rows[0], tasks: ganttTasks });
});
