import { Router } from "express";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { createProjectSchema, updateProjectSchema } from "../validators/project.schema.js";
import {
  buildProjectColumnValues,
  getOwnedProject,
  getProjectOverview,
  listProjectDocuments,
  serializeProjectRow,
} from "../services/projectDetailsService.js";
import { getProjectWorkload, resolveClientToday } from "../services/workloadService.js";
import { awardProjectCompleted } from "../services/gamificationService.js";


/** goal_id só é aceito se a meta for do próprio usuário. */
async function goalBelongsTo(db: ReturnType<typeof getDb>, ownerId: string, goalId: string | null | undefined) {
  if (!goalId) return true;
  const r = await db.execute({ sql: "SELECT id FROM goals WHERE id = ? AND owner_id = ?", args: [goalId, ownerId] });
  return r.rows.length > 0;
}

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

/** GET /api/projects?includeArchived=true */
projectsRouter.get("/", async (req, res) => {
  const db = getDb();
  const includeArchived = req.query.includeArchived === "true";

  const result = await db.execute({
    sql: `SELECT p.*,
            (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.owner_id = p.owner_id) AS task_count,
            (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.owner_id = p.owner_id AND t.status = 'Concluído') AS done_count
          FROM projects p
          WHERE p.owner_id = ? ${includeArchived ? "" : "AND p.archived_at IS NULL"}
          ORDER BY p.created_at DESC`,
    args: [req.user!.id],
  });
  return res.json((result.rows as unknown as Array<Record<string, unknown>>).map(serializeProjectRow));
});

/**
 * GET /api/projects/workload?days=30&kind=professional&today=YYYY-MM-DD —
 * carga por projeto (status, horas estimadas/restantes/registradas, prazos e pressão).
 * Declarada antes de "/:id" para não ser capturada como id.
 */
projectsRouter.get("/workload", async (req, res) => {
  const days = Math.min(90, Math.max(7, Number(req.query.days) || 30));
  const kind = typeof req.query.kind === "string" && ["personal", "workspace", "professional", "academic"].includes(req.query.kind) ? req.query.kind : undefined;
  return res.json(await getProjectWorkload(getDb(), req.user!.id, { today: resolveClientToday(req.query.today), days, kind }));
});

/** POST /api/projects — cadastro completo (todos os campos de detalhe são opcionais). */
projectsRouter.post("/", async (req, res) => {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const d = parsed.data;
  const db = getDb();
  const ownerId = req.user!.id;

  // parent_id só é aceito se o projeto pai também for do usuário autenticado.
  if (d.parentId) {
    const parent = await db.execute({ sql: "SELECT id FROM projects WHERE id = ? AND owner_id = ?", args: [d.parentId, ownerId] });
    if (parent.rows.length === 0) return res.status(400).json({ error: "Projeto pai inválido." });
  }

  if (!(await goalBelongsTo(db, ownerId, d.goalId))) return res.status(400).json({ error: "Meta inválida." });

  const id = nanoid();
  const pairs = buildProjectColumnValues(d);
  const columns = ["id", "owner_id", "parent_id", ...pairs.map(([c]) => c)];
  const values = [id, ownerId, d.parentId ?? null, ...pairs.map(([, v]) => v)];

  await db.execute({
    sql: `INSERT INTO projects (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
    args: values,
  });

  return res.status(201).json(await getOwnedProject(db, ownerId, id));
});

/** GET /api/projects/:id — metadados completos do projeto. */
projectsRouter.get("/:id", async (req, res) => {
  const db = getDb();
  const project = await getOwnedProject(db, req.user!.id, req.params.id);
  if (!project) return res.status(404).json({ error: "Projeto não encontrado." });
  return res.json(project);
});

/** GET /api/projects/:id/overview — indicadores derivados das tarefas, anexos e Diário. */
projectsRouter.get("/:id/overview", async (req, res) => {
  const db = getDb();
  const ownerId = req.user!.id;
  const project = await getOwnedProject(db, ownerId, req.params.id);
  if (!project) return res.status(404).json({ error: "Projeto não encontrado." });
  const overview = await getProjectOverview(db, ownerId, req.params.id, (project as { due_date?: string | null }).due_date ?? null);
  return res.json(overview);
});

/** GET /api/projects/:id/tasks — tarefas do projeto (inclui contagem de anexos de cada uma). */
projectsRouter.get("/:id/tasks", async (req, res) => {
  const db = getDb();
  const ownerId = req.user!.id;
  const project = await db.execute({ sql: "SELECT id FROM projects WHERE id = ? AND owner_id = ?", args: [req.params.id, ownerId] });
  if (project.rows.length === 0) return res.status(404).json({ error: "Projeto não encontrado." });

  const result = await db.execute({
    sql: `SELECT t.*,
            (SELECT COUNT(*) FROM task_attachments a WHERE a.task_id = t.id AND a.owner_id = t.owner_id) AS attachment_count
          FROM tasks t
          WHERE t.owner_id = ? AND t.project_id = ? AND t.parent_task_id IS NULL
          ORDER BY (t.status = 'Concluído') ASC, (t.due_date IS NULL) ASC, t.due_date ASC, t.created_at DESC`,
    args: [ownerId, req.params.id],
  });
  return res.json(result.rows);
});

/** GET /api/projects/:id/documents — anexos das tarefas vinculadas ao projeto. */
projectsRouter.get("/:id/documents", async (req, res) => {
  const db = getDb();
  const ownerId = req.user!.id;
  const project = await db.execute({ sql: "SELECT id FROM projects WHERE id = ? AND owner_id = ?", args: [req.params.id, ownerId] });
  if (project.rows.length === 0) return res.status(404).json({ error: "Projeto não encontrado." });
  return res.json(await listProjectDocuments(db, ownerId, req.params.id));
});

/** PATCH /api/projects/:id */
projectsRouter.patch("/:id", async (req, res) => {
  const parsed = updateProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const ownerId = req.user!.id;
  const existing = await db.execute({ sql: "SELECT id FROM projects WHERE id = ? AND owner_id = ?", args: [req.params.id, ownerId] });
  if (existing.rows.length === 0) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!(await goalBelongsTo(db, ownerId, parsed.data.goalId))) return res.status(400).json({ error: "Meta inválida." });

  const pairs = buildProjectColumnValues(parsed.data);
  const sets = pairs.map(([c]) => `${c} = ?`);
  const args: Array<string | number | null> = pairs.map(([, v]) => v);
  if (parsed.data.archived !== undefined) {
    sets.push("archived_at = ?");
    args.push(parsed.data.archived ? new Date().toISOString() : null);
  }
  sets.push("updated_at = datetime('now')");
  args.push(req.params.id, ownerId);

  await db.execute({ sql: `UPDATE projects SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`, args });
  if (parsed.data.status === "completed") await awardProjectCompleted(db, ownerId, req.params.id);
  return res.json(await getOwnedProject(db, ownerId, req.params.id));
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

/**
 * GET /api/projects/:id/forecast — projeção matemática (ritmo real de
 * conclusão de tarefas) de quando o projeto deve terminar. Usa
 * completed_at quando preenchido; como o fluxo de arrastar no Kanban
 * (PATCH /tasks/:id/move) não grava completed_at, cai para updated_at
 * nas tarefas com status "Concluído". Nunca inventa número: sem
 * histórico suficiente, devolve forecast: null com motivo em PT-BR
 * (sempre 200 — é um estado normal, não um erro).
 */
projectsRouter.get("/:id/forecast", async (req, res) => {
  const db = getDb();
  const project = await db.execute({ sql: "SELECT id FROM projects WHERE id = ? AND owner_id = ?", args: [req.params.id, req.user!.id] });
  if (project.rows.length === 0) return res.status(404).json({ error: "Projeto não encontrado." });

  const tasksResult = await db.execute({
    sql: "SELECT id, status, completed_at, updated_at FROM tasks WHERE owner_id = ? AND project_id = ?",
    args: [req.user!.id, req.params.id],
  });
  const tasks = tasksResult.rows as unknown as Array<{
    id: string; status: string; completed_at: string | null; updated_at: string;
  }>;

  const completed = tasks.filter((t) => t.status === "Concluído");
  const open = tasks.filter((t) => t.status !== "Concluído");

  if (open.length === 0) {
    return res.json({
      forecast: null,
      reason: completed.length > 0 ? "Projeto já concluído — nada para projetar." : "Projeto sem tarefas — nada para projetar.",
    });
  }
  if (completed.length === 0) {
    return res.json({ forecast: null, reason: "Nenhuma tarefa concluída ainda — sem histórico para projetar." });
  }

  const completionTimes = completed.map((t) => new Date(t.completed_at ?? t.updated_at).getTime());
  const earliest = Math.min(...completionTimes);
  const latest = Math.max(...completionTimes);
  const weeksSpan = (latest - earliest) / (7 * 86_400_000);

  if (weeksSpan < 2) {
    return res.json({ forecast: null, reason: "Ainda não há pelo menos 2 semanas de histórico de conclusões para projetar." });
  }

  const completionsPerWeek = completed.length / weeksSpan;
  if (completionsPerWeek <= 0) {
    return res.json({ forecast: null, reason: "O ritmo atual não indica avanço — sem projeção possível." });
  }

  const weeksRemaining = open.length / completionsPerWeek;
  const forecastDateObj = new Date();
  forecastDateObj.setUTCHours(0, 0, 0, 0);
  forecastDateObj.setUTCDate(forecastDateObj.getUTCDate() + Math.ceil(weeksRemaining * 7));
  const forecastDate = forecastDateObj.toISOString().slice(0, 10);

  return res.json({
    forecast: {
      date: forecastDate,
      completionsPerWeek: Math.round(completionsPerWeek * 100) / 100,
      remainingTasks: open.length,
    },
    reason: null,
  });
});
