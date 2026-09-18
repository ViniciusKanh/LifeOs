import { Router } from "express";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import {
  computeCapacitySummary,
  getDayTasks,
  getPlannedBlocks,
  getFreeWindows,
  getScheduleConflicts,
  getAreaDistribution,
  getEnergyForecast,
  getFocusForecast,
  getContextForPlanner,
  formatDuration,
} from "../services/capacityPlannerService.js";
import { buildPlanningSuggestion } from "../services/capacityPlanningEngine.js";

export const capacityRouter = Router();

capacityRouter.use(requireAuth);

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .catch(() => new Date().toISOString().slice(0, 10));

/** GET /api/capacity/day?date=YYYY-MM-DD — dashboard completo do Capacity Planner para o dia. */
capacityRouter.get("/day", async (req, res) => {
  const db = getDb();
  const ownerId = req.user!.id;
  const date = dateSchema.parse(req.query.date ?? new Date().toISOString().slice(0, 10));

  const [summary, tasks, blocks, freeWindows, conflicts, areas, energy, focus, context] = await Promise.all([
    computeCapacitySummary(db, ownerId, date),
    getDayTasks(db, ownerId, date),
    getPlannedBlocks(db, ownerId, date),
    getFreeWindows(db, ownerId, date),
    getScheduleConflicts(db, ownerId, date),
    getAreaDistribution(db, ownerId, date),
    getEnergyForecast(db, ownerId),
    getFocusForecast(db, ownerId),
    getContextForPlanner(db, ownerId),
  ]);

  const overloadMessage =
    summary.overloadMinutes > 0
      ? `Você está com ${formatDuration(summary.overloadMinutes)} de carga acima da sua capacidade estimada.`
      : null;

  res.json({ summary, overloadMessage, tasks, blocks, freeWindows, conflicts, areas, energy, focus, context });
});

/** GET /api/capacity/plan/preview?date= — gera sugestão de reorganização SEM salvar (regra: sem alteração automática). */
capacityRouter.get("/plan/preview", async (req, res) => {
  const db = getDb();
  const date = dateSchema.parse(req.query.date ?? new Date().toISOString().slice(0, 10));
  const suggestion = await buildPlanningSuggestion(db, req.user!.id, date);
  res.json(suggestion);
});

const applySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  blocks: z.array(z.object({ taskId: z.string(), startTime: z.string(), endTime: z.string(), blockType: z.enum(["deep_work", "normal", "light"]) })),
});

/** POST /api/capacity/plan/apply — persiste os blocos do preview só depois da confirmação explícita do usuário. */
capacityRouter.post("/plan/apply", async (req, res) => {
  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados inválidos.", details: parsed.error.flatten() });
  const db = getDb();
  const ownerId = req.user!.id;
  const { date, blocks } = parsed.data;

  for (const block of blocks) {
    // Verifica ownership da task antes de gravar (nunca confiar em id vindo do corpo sem checar dono).
    const task = await db.execute({ sql: "SELECT id FROM tasks WHERE id = ? AND owner_id = ?", args: [block.taskId, ownerId] });
    if (task.rows.length === 0) continue;
    await db.execute({
      sql: `DELETE FROM planned_time_blocks WHERE owner_id = ? AND date = ? AND entity_type = 'task' AND entity_id = ?`,
      args: [ownerId, date, block.taskId],
    });
    await db.execute({
      sql: `INSERT INTO planned_time_blocks (id, owner_id, date, start_time, end_time, entity_type, entity_id, block_type)
            VALUES (?, ?, ?, ?, ?, 'task', ?, ?)`,
      args: [nanoid(), ownerId, date, block.startTime, block.endTime, block.taskId, block.blockType],
    });
  }
  res.status(201).json({ applied: blocks.length });
});

const createBlockSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  entityType: z.enum(["task", "free_block"]),
  entityId: z.string().nullable().optional(),
  title: z.string().max(120).nullable().optional(),
  blockType: z.enum(["deep_work", "normal", "light"]).default("normal"),
});

/** POST /api/capacity/blocks — cria um bloco manual (tarefa ou livre) no dia. */
capacityRouter.post("/blocks", async (req, res) => {
  const parsed = createBlockSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados inválidos.", details: parsed.error.flatten() });
  const db = getDb();
  const d = parsed.data;
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO planned_time_blocks (id, owner_id, date, start_time, end_time, entity_type, entity_id, title, block_type)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, req.user!.id, d.date, d.startTime, d.endTime, d.entityType, d.entityId ?? null, d.title ?? null, d.blockType],
  });
  res.status(201).json({ id });
});

const updateBlockSchema = z.object({
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

/** PATCH /api/capacity/blocks/:id — move um bloco (usado por drag-and-drop futuro ou edição manual). */
capacityRouter.patch("/blocks/:id", async (req, res) => {
  const parsed = updateBlockSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados inválidos." });
  const db = getDb();
  const existing = await db.execute({ sql: "SELECT id FROM planned_time_blocks WHERE id = ? AND owner_id = ?", args: [req.params.id, req.user!.id] });
  if (existing.rows.length === 0) return res.status(404).json({ error: "Bloco não encontrado." });
  const updates: string[] = [];
  const args: (string | number)[] = [];
  if (parsed.data.startTime) {
    updates.push("start_time = ?");
    args.push(parsed.data.startTime);
  }
  if (parsed.data.endTime) {
    updates.push("end_time = ?");
    args.push(parsed.data.endTime);
  }
  if (updates.length === 0) return res.json({ ok: true });
  updates.push("updated_at = datetime('now')");
  args.push(req.params.id, req.user!.id);
  await db.execute({ sql: `UPDATE planned_time_blocks SET ${updates.join(", ")} WHERE id = ? AND owner_id = ?`, args });
  res.json({ ok: true });
});

/** DELETE /api/capacity/blocks/:id */
capacityRouter.delete("/blocks/:id", async (req, res) => {
  const db = getDb();
  await db.execute({ sql: "DELETE FROM planned_time_blocks WHERE id = ? AND owner_id = ?", args: [req.params.id, req.user!.id] });
  res.status(204).end();
});
