import { Router } from "express";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { createTaskSchema, updateTaskSchema, moveTaskSchema } from "../validators/task.schema.js";
import { addDependencySchema } from "../validators/project.schema.js";
import { getFocusTasks } from "../services/priorityService.js";
import { awardFocusSession, awardTaskCompletion, syncContractStatus } from "../services/gamificationService.js";
import { insertTask, maybeCheckInLinkedHabit, maybeSpawnNextOccurrence, moveTaskStatus, recomputePriorityScore } from "../services/taskWriteService.js";
import { syncAutoHabitsAfterWrite } from "../services/habitAutoService.js";
import { taskAttachmentCreateSchema, taskAttachmentUpdateSchema } from "../validators/attachment.schema.js";
import {
  addTaskAttachment,
  deleteTaskAttachment,
  listTaskAttachments,
  taskBelongsToOwner,
  updateTaskAttachmentCaption,
} from "../services/taskAttachmentsService.js";

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

/**
 * GET /api/tasks/focus?limit=5 — Priorização automática ("Foque
 * nisso agora" / Missão Principal): as N tarefas em aberto do usuário
 * mais urgentes, em camadas simples (atrasada > vence hoje > vence essa
 * semana > sem urgência de prazo; prioridade decide empate dentro de
 * cada camada; bloqueada por dependência sempre por último) — ver
 * priorityService.ts para a ordem completa. Precisa vir ANTES de "/:id"
 * nesta rota, senão "focus" seria capturado como id.
 */
tasksRouter.get("/focus", async (req, res) => {
  const db = getDb();
  const rawLimit = Number(req.query.limit ?? 5);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 20) : 5;

  const tasks = await getFocusTasks(db, req.user!.id, limit);
  return res.json({
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate,
      priority: t.priority,
      status: t.status,
      score: t.score,
      reasons: t.reasons,
    })),
  });
});

/**
 * GET /api/tasks/professional — Área Profissional: tarefas em aberto
 * vinculadas a um projeto kind='professional', ordenadas pelo
 * Priority Score (impacto*urgência/esforço) — quando ele não existe
 * (campos não preenchidos), a tarefa cai pro fim da lista, ordenada
 * só por prazo. Precisa vir ANTES de "/:id" nesta rota.
 */
tasksRouter.get("/professional", async (req, res) => {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT t.* FROM tasks t
          JOIN projects p ON p.id = t.project_id
          WHERE t.owner_id = ? AND p.kind = 'professional' AND t.status != 'Concluído'
          ORDER BY (t.priority_score IS NULL) ASC, t.priority_score DESC, t.due_date ASC`,
    args: [req.user!.id],
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


/**
 * project_id / goal_id só podem apontar para registros do próprio usuário —
 * sem isso, um id de outro usuário poderia ser gravado na tarefa.
 */
async function validateTaskLinks(
  db: ReturnType<typeof getDb>,
  ownerId: string,
  d: { projectId?: string | null; goalId?: string | null; contractId?: string | null },
): Promise<string | null> {
  if (d.contractId) {
    const r = await db.execute({ sql: "SELECT id FROM contracts WHERE id = ? AND owner_id = ?", args: [d.contractId, ownerId] });
    if (r.rows.length === 0) return "Contrato inválido.";
  }
  if (d.projectId) {
    const r = await db.execute({ sql: "SELECT id FROM projects WHERE id = ? AND owner_id = ?", args: [d.projectId, ownerId] });
    if (r.rows.length === 0) return "Projeto inválido.";
  }
  if (d.goalId) {
    const r = await db.execute({ sql: "SELECT id FROM goals WHERE id = ? AND owner_id = ?", args: [d.goalId, ownerId] });
    if (r.rows.length === 0) return "Meta inválida.";
  }
  return null;
}

/** POST /api/tasks */
tasksRouter.post("/", async (req, res) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const d = parsed.data;
  const db = getDb();
  const linkError = await validateTaskLinks(db, req.user!.id, d);
  if (linkError) return res.status(400).json({ error: linkError });
  const created = await insertTask(db, req.user!.id, d);
  return res.status(201).json(created);
});

/** PATCH /api/tasks/:id */
tasksRouter.patch("/:id", async (req, res) => {
  const parsed = updateTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();

  const existing = await db.execute({
    sql: "SELECT id, contract_id FROM tasks WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  if (existing.rows.length === 0) {
    return res.status(404).json({ error: "Tarefa não encontrada." });
  }
  const previousContract = existing.rows[0].contract_id == null ? null : String(existing.rows[0].contract_id);
  const linkError = await validateTaskLinks(db, req.user!.id, parsed.data);
  if (linkError) return res.status(400).json({ error: linkError });

  const fieldMap: Record<string, string> = {
    title: "title",
    description: "description",
    projectId: "project_id",
    goalId: "goal_id",
    status: "status",
    priority: "priority",
    dueDate: "due_date",
    startDate: "start_date",
    estimateMinutes: "estimate_minutes",
    timeSpentMinutes: "time_spent_minutes",
    completedAt: "completed_at",
    impact: "impact",
    urgency: "urgency",
    effort: "effort",
    recurrenceRule: "recurrence_rule",
    difficulty: "difficulty",
    contractId: "contract_id",
  };

  const dataForUpdate: Record<string, string | number | null> = { ...(parsed.data as Record<string, string | number | null>) };
  if ("status" in dataForUpdate && !("completedAt" in dataForUpdate)) {
    dataForUpdate.completedAt = dataForUpdate.status === "Concluído" ? new Date().toISOString() : null;
  }

  const sets: string[] = [];
  const args: Array<string | number | null> = [];
  for (const [key, column] of Object.entries(fieldMap)) {
    if (key in dataForUpdate) {
      sets.push(`${column} = ?`);
      args.push(dataForUpdate[key]);
    }
  }
  sets.push("updated_at = datetime('now')");

  args.push(req.params.id, req.user!.id);

  await db.execute({
    sql: `UPDATE tasks SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`,
    args,
  });
  await recomputePriorityScore(db, req.params.id, req.user!.id);
  if (dataForUpdate.status === "Concluído") {
    await maybeSpawnNextOccurrence(db, req.params.id, req.user!.id);
    await maybeCheckInLinkedHabit(db, req.params.id, req.user!.id);
    await awardTaskCompletion(db, req.user!.id, req.params.id);
  }
  // Hábito automático "concluir N tarefas" acompanha conclusão e reabertura.
  if ("status" in dataForUpdate) await syncAutoHabitsAfterWrite(db, req.user!.id);
  // Contrato acompanha reabertura/troca de vínculo (o bônus pago nunca se repete).
  if ("contractId" in parsed.data && previousContract && previousContract !== parsed.data.contractId) {
    await syncContractStatus(db, req.user!.id, previousContract);
  }
  const currentContract = "contractId" in parsed.data ? parsed.data.contractId ?? null : previousContract;
  if (currentContract && parsed.data.status !== "Concluído") await syncContractStatus(db, req.user!.id, currentContract);

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
  const moved = await moveTaskStatus(getDb(), req.user!.id, req.params.id, parsed.data.status);
  if (!moved) {
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
  await awardFocusSession(db, req.user!.id, String(entry.id), minutes, entry.project_id == null ? null : String(entry.project_id));
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

/** GET /api/tasks/:id/attachments — imagens e PDFs anexados à tarefa. */
tasksRouter.get("/:id/attachments", async (req, res) => {
  const db = getDb();
  if (!(await taskBelongsToOwner(db, req.user!.id, req.params.id))) {
    return res.status(404).json({ error: "Tarefa não encontrada." });
  }
  return res.json(await listTaskAttachments(db, req.user!.id, req.params.id));
});

/** POST /api/tasks/:id/attachments — anexa uma imagem (já comprimida no cliente) ou um PDF. */
tasksRouter.post("/:id/attachments", async (req, res) => {
  const parsed = taskAttachmentCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Arquivo inválido." });
  }
  const db = getDb();
  if (!(await taskBelongsToOwner(db, req.user!.id, req.params.id))) {
    return res.status(404).json({ error: "Tarefa não encontrada." });
  }
  const created = await addTaskAttachment(db, req.user!.id, req.params.id, parsed.data);
  if (!created) return res.status(400).json({ error: "Limite de anexos desta tarefa atingido." });
  return res.status(201).json(created);
});

/** PATCH /api/tasks/:id/attachments/:attachmentId — edita a legenda do anexo. */
tasksRouter.patch("/:id/attachments/:attachmentId", async (req, res) => {
  const parsed = taskAttachmentUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const ok = await updateTaskAttachmentCaption(db, req.user!.id, req.params.id, req.params.attachmentId, parsed.data.caption ?? null);
  if (!ok) return res.status(404).json({ error: "Anexo não encontrado." });
  return res.json({ ok: true });
});

/** DELETE /api/tasks/:id/attachments/:attachmentId */
tasksRouter.delete("/:id/attachments/:attachmentId", async (req, res) => {
  const db = getDb();
  const ok = await deleteTaskAttachment(db, req.user!.id, req.params.id, req.params.attachmentId);
  if (!ok) return res.status(404).json({ error: "Anexo não encontrado." });
  return res.status(204).send();
});

/** DELETE /api/tasks/:id */
tasksRouter.delete("/:id", async (req, res) => {
  const db = getDb();
  const linked = await db.execute({ sql: "SELECT contract_id FROM tasks WHERE id = ? AND owner_id = ?", args: [req.params.id, req.user!.id] });
  const contractId = linked.rows[0]?.contract_id;
  const result = await db.execute({
    sql: "DELETE FROM tasks WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  if (result.rowsAffected === 0) {
    return res.status(404).json({ error: "Tarefa não encontrada." });
  }
  if (typeof contractId === "string" && contractId) await syncContractStatus(db, req.user!.id, contractId);
  return res.status(204).send();
});
