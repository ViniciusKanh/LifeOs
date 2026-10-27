import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { inviteRateLimit } from "../middleware/rateLimit.js";
import { createProjectSchema, updateProjectSchema } from "../validators/project.schema.js";
import {
  buildProjectColumnValues,
  getAccessibleProjectDetail,
  getProjectOverview,
  insertProject,
  listProjectDocuments,
  serializeProjectRow,
} from "../services/projectDetailsService.js";
import { getAccessibleProject, sharedProjectIds } from "../services/projectAccessService.js";
import {
  ProjectSharingError,
  createProjectInvite,
  leaveProject,
  listProjectMembers,
  removeProjectMember,
  revokeProjectInvite,
} from "../services/projectSharingService.js";
import { getProjectWorkload, resolveClientToday } from "../services/workloadService.js";
import { awardProjectCompleted } from "../services/gamificationService.js";


/** goal_id só é aceito se a meta for do próprio usuário. */
async function goalBelongsTo(db: ReturnType<typeof getDb>, ownerId: string, goalId: string | null | undefined) {
  if (!goalId) return true;
  const r = await db.execute({ sql: "SELECT id FROM goals WHERE id = ? AND owner_id = ?", args: [goalId, ownerId] });
  return r.rows.length > 0;
}

function handleSharingError(res: import("express").Response, e: unknown) {
  if (e instanceof ProjectSharingError) return res.status(e.status).json({ error: e.message });
  throw e;
}

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

/**
 * GET /api/projects?includeArchived=true — projetos do próprio usuário
 * MAIS os projetos compartilhados com ele ("Colaboração total" — ver
 * projectSharingService.ts). `isOwner`/`role` dizem ao frontend como
 * exibir cada um (ex.: badge "Compartilhado").
 */
projectsRouter.get("/", async (req, res) => {
  const db = getDb();
  const ownerId = req.user!.id;
  const includeArchived = req.query.includeArchived === "true";
  const archivedFilter = includeArchived ? "" : "AND p.archived_at IS NULL";

  const [ownedResult, sharedIds] = await Promise.all([
    db.execute({
      sql: `SELECT p.*, 1 AS is_owner, 'owner' AS role,
              (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count,
              (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'Concluído') AS done_count
            FROM projects p
            WHERE p.owner_id = ? ${archivedFilter}
            ORDER BY p.created_at DESC`,
      args: [ownerId],
    }),
    sharedProjectIds(db, ownerId),
  ]);

  let sharedRows: Array<Record<string, unknown>> = [];
  if (sharedIds.length > 0) {
    const placeholders = sharedIds.map(() => "?").join(", ");
    const sharedResult = await db.execute({
      sql: `SELECT p.*, 0 AS is_owner, 'member' AS role,
              (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count,
              (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'Concluído') AS done_count
            FROM projects p
            WHERE p.id IN (${placeholders}) ${archivedFilter}
            ORDER BY p.created_at DESC`,
      args: sharedIds,
    });
    sharedRows = sharedResult.rows as unknown as Array<Record<string, unknown>>;
  }

  const all = [...(ownedResult.rows as unknown as Array<Record<string, unknown>>), ...sharedRows];
  return res.json(
    all.map((row) => ({
      ...serializeProjectRow(row),
      isOwner: Number(row.is_owner) === 1,
      role: String(row.role),
    })),
  );
});

/**
 * GET /api/projects/workload?days=30&kind=professional&today=YYYY-MM-DD —
 * carga por projeto (status, horas estimadas/restantes/registradas, prazos e pressão).
 * Declarada antes de "/:id" para não ser capturada como id.
 * Fica restrita aos próprios projetos: é uma visão de carga PESSOAL do
 * usuário, não uma métrica agregada do time num projeto compartilhado.
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

  return res.status(201).json(await insertProject(db, ownerId, d));
});

/** GET /api/projects/:id — metadados completos do projeto (dono ou membro compartilhado). */
projectsRouter.get("/:id", async (req, res) => {
  const db = getDb();
  const project = await getAccessibleProjectDetail(db, req.user!.id, req.params.id);
  if (!project) return res.status(404).json({ error: "Projeto não encontrado." });
  return res.json(project);
});

/** GET /api/projects/:id/overview — indicadores derivados das tarefas, anexos e Diário. */
projectsRouter.get("/:id/overview", async (req, res) => {
  const db = getDb();
  const project = await getAccessibleProjectDetail(db, req.user!.id, req.params.id);
  if (!project) return res.status(404).json({ error: "Projeto não encontrado." });
  // Usa o owner_id REAL do projeto — as tarefas de um projeto compartilhado
  // podem ter sido criadas por qualquer membro, não só pelo dono.
  const realOwnerId = String(project.owner_id);
  const overview = await getProjectOverview(db, realOwnerId, req.params.id, (project as { due_date?: string | null }).due_date ?? null);
  return res.json(overview);
});

/** GET /api/projects/:id/tasks — tarefas do projeto (inclui contagem de anexos de cada uma), de QUALQUER membro. */
projectsRouter.get("/:id/tasks", async (req, res) => {
  const db = getDb();
  const project = await getAccessibleProject(db, req.user!.id, req.params.id);
  if (!project) return res.status(404).json({ error: "Projeto não encontrado." });

  const result = await db.execute({
    sql: `SELECT t.*,
            (SELECT COUNT(*) FROM task_attachments a WHERE a.task_id = t.id AND a.owner_id = t.owner_id) AS attachment_count
          FROM tasks t
          WHERE t.project_id = ? AND t.parent_task_id IS NULL
          ORDER BY (t.status = 'Concluído') ASC, (t.due_date IS NULL) ASC, t.due_date ASC, t.created_at DESC`,
    args: [req.params.id],
  });
  return res.json(result.rows);
});

/** GET /api/projects/:id/documents — anexos das tarefas vinculadas ao projeto. */
projectsRouter.get("/:id/documents", async (req, res) => {
  const db = getDb();
  const project = await getAccessibleProject(db, req.user!.id, req.params.id);
  if (!project) return res.status(404).json({ error: "Projeto não encontrado." });
  return res.json(await listProjectDocuments(db, String(project.owner_id), req.params.id));
});

// ---------------------------------------------------------------------
// Compartilhamento ("Colaboração total") — convidar, listar membros,
// remover e sair. Gerenciar QUEM está no projeto continua exclusivo do
// dono; qualquer membro pode ver a lista e sair por conta própria.
// ---------------------------------------------------------------------

const inviteBodySchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido.").max(254),
  message: z.string().max(280, "Mensagem de até 280 caracteres.").nullish(),
});

/** GET /api/projects/:id/members — membros aceitos + convites pendentes (dono ou membro). */
projectsRouter.get("/:id/members", async (req, res) => {
  const db = getDb();
  const project = await getAccessibleProject(db, req.user!.id, req.params.id);
  if (!project) return res.status(404).json({ error: "Projeto não encontrado." });
  return res.json(await listProjectMembers(db, req.params.id));
});

/** POST /api/projects/:id/invites — convida alguém por e-mail (só o dono). */
projectsRouter.post("/:id/invites", inviteRateLimit(), async (req, res) => {
  const parsed = inviteBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  try {
    const result = await createProjectInvite(getDb(), req.user!.id, req.params.id, parsed.data);
    return res.status(201).json(result);
  } catch (e) {
    return handleSharingError(res, e);
  }
});

/** DELETE /api/projects/:id/invites/:inviteId — revoga um convite pendente (só o dono). */
projectsRouter.delete("/:id/invites/:inviteId", async (req, res) => {
  try {
    await revokeProjectInvite(getDb(), req.user!.id, req.params.id, req.params.inviteId);
    return res.status(204).send();
  } catch (e) {
    return handleSharingError(res, e);
  }
});

/** DELETE /api/projects/:id/members/:userId — remove um membro já aceito (só o dono). */
projectsRouter.delete("/:id/members/:userId", async (req, res) => {
  try {
    await removeProjectMember(getDb(), req.user!.id, req.params.id, req.params.userId);
    return res.status(204).send();
  } catch (e) {
    return handleSharingError(res, e);
  }
});

/** POST /api/projects/:id/leave — o próprio membro sai do projeto (o dono não pode "sair" do próprio projeto). */
projectsRouter.post("/:id/leave", async (req, res) => {
  try {
    await leaveProject(getDb(), req.user!.id, req.params.id);
    return res.status(204).send();
  } catch (e) {
    return handleSharingError(res, e);
  }
});

/**
 * PATCH /api/projects/:id — dono OU membro pode editar os detalhes
 * (nome, descrição, datas, status...). A exclusão continua exclusiva
 * do dono (ver DELETE abaixo).
 */
projectsRouter.patch("/:id", async (req, res) => {
  const parsed = updateProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const existing = await getAccessibleProject(db, req.user!.id, req.params.id);
  if (!existing) return res.status(404).json({ error: "Projeto não encontrado." });
  const realOwnerId = String(existing.owner_id);
  if (!(await goalBelongsTo(db, realOwnerId, parsed.data.goalId))) return res.status(400).json({ error: "Meta inválida." });

  const pairs = buildProjectColumnValues(parsed.data);
  const sets = pairs.map(([c]) => `${c} = ?`);
  const args: Array<string | number | null> = pairs.map(([, v]) => v);
  if (parsed.data.archived !== undefined) {
    sets.push("archived_at = ?");
    args.push(parsed.data.archived ? new Date().toISOString() : null);
  }
  sets.push("updated_at = datetime('now')");
  args.push(req.params.id);

  await db.execute({ sql: `UPDATE projects SET ${sets.join(", ")} WHERE id = ?`, args });
  // XP de "projeto concluído" sempre credita o DONO real do projeto,
  // não necessariamente quem marcou como concluído.
  if (parsed.data.status === "completed") await awardProjectCompleted(db, realOwnerId, req.params.id);
  return res.json(await getAccessibleProjectDetail(db, req.user!.id, req.params.id));
});

/** DELETE /api/projects/:id — exclusivo do dono; as tarefas do projeto continuam existindo, só perdem o vínculo (project_id vira NULL). */
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
  const project = await getAccessibleProject(db, req.user!.id, req.params.id);
  if (!project) return res.status(404).json({ error: "Projeto não encontrado." });

  const tasks = await db.execute({
    sql: `SELECT id, title, status, priority, start_date, due_date, completed_at
          FROM tasks
          WHERE project_id = ? AND (start_date IS NOT NULL OR due_date IS NOT NULL)
          ORDER BY COALESCE(start_date, due_date) ASC`,
    args: [req.params.id],
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

  return res.json({ project: { id: project.id, name: project.name }, tasks: ganttTasks });
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
  const project = await getAccessibleProject(db, req.user!.id, req.params.id);
  if (!project) return res.status(404).json({ error: "Projeto não encontrado." });

  const tasksResult = await db.execute({
    sql: "SELECT id, status, completed_at, updated_at FROM tasks WHERE project_id = ?",
    args: [req.params.id],
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
