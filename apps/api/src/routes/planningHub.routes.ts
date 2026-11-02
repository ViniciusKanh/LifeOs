import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { aiRateLimit } from "../middleware/rateLimit.js";
import { getDb } from "../db/client.js";
import {
  EVENT_CATEGORIES,
  PlanningError,
  addSubtasks,
  createAgendaBlock,
  decideAgendaSuggestion,
  deleteSubtask,
  getAgendaHub,
  getCouncilHub,
  getGuildHub,
  getMissionsHub,
  listSubtasks,
  proposeBreakdown,
  rescheduleBlock,
  setTaskPlannedDate,
  runAutoPlan,
  runReplan,
  toggleSubtask,
  updateEventMeta,
} from "../services/planningHubService.js";
import { automationConfig } from "../services/automationService.js";

/**
 * /api/planning — camada RPG de Agenda, Conselho de Guerra, Missões e
 * Quadro de Avisos. Tudo por usuário autenticado; nenhuma rota concede XP
 * ou moedas (recompensas seguem nas rotas de origem, idempotentes).
 */
export const planningHubRouter = Router();
planningHubRouter.use(requireAuth);

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

function fail(res: Response, err: unknown) {
  if (err instanceof PlanningError) return res.status(err.status).json({ error: err.message });
  throw err;
}

planningHubRouter.get("/agenda", async (req, res) => res.json(await getAgendaHub(getDb(), req.user!.id)));
planningHubRouter.get("/council", async (req, res) => res.json(await getCouncilHub(getDb(), req.user!.id)));
planningHubRouter.get("/missions", async (req, res) => res.json(await getMissionsHub(getDb(), req.user!.id)));
planningHubRouter.get("/guild", async (req, res) => res.json(await getGuildHub(getDb(), req.user!.id)));

// ---------------- Agenda ----------------
const blockSchema = z.object({
  title: z.string().trim().min(1).max(200),
  date: day,
  start: hm,
  durationMinutes: z.number().int().min(10).max(600),
  category: z.enum(EVENT_CATEGORIES),
  taskId: id.nullable().optional(),
  goalId: id.nullable().optional(),
  reminderMinutes: z.number().int().min(0).max(1440).nullable().optional(),
});
planningHubRouter.post("/agenda/blocks", async (req, res) => {
  const b = blockSchema.safeParse(req.body ?? {});
  if (!b.success) return res.status(400).json({ error: b.error.issues[0]?.message ?? "Bloco inválido." });
  try {
    return res.status(201).json(await createAgendaBlock(getDb(), req.user!.id, b.data));
  } catch (e) {
    return fail(res, e);
  }
});

const metaSchema = z.object({
  category: z.enum(EVENT_CATEGORIES).optional(),
  reminderMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  goalId: id.nullable().optional(),
});
planningHubRouter.patch("/agenda/events/:id/meta", async (req, res) => {
  const i = id.safeParse(req.params.id);
  const b = metaSchema.safeParse(req.body ?? {});
  if (!i.success || !b.success) return res.status(400).json({ error: "Dados inválidos." });
  try {
    const ok = await updateEventMeta(getDb(), req.user!.id, i.data, b.data);
    return ok ? res.json({ ok: true }) : res.status(404).json({ error: "Evento não encontrado." });
  } catch (e) {
    return fail(res, e);
  }
});

const rescheduleSchema = z.object({ date: day, start: hm.nullable(), durationMinutes: z.number().int().min(10).max(600).optional() });
planningHubRouter.patch("/agenda/events/:id/reschedule", async (req, res) => {
  const i = id.safeParse(req.params.id);
  const b = rescheduleSchema.safeParse(req.body ?? {});
  if (!i.success || !b.success) return res.status(400).json({ error: "Dados inválidos." });
  try {
    await rescheduleBlock(getDb(), req.user!.id, i.data, b.data);
    return res.json({ ok: true });
  } catch (e) {
    return fail(res, e);
  }
});

planningHubRouter.post("/agenda/suggestions/:kind(auto_plan|replan)/generate", async (req, res) => {
  const kind = req.params.kind as "auto_plan" | "replan";
  const a = await automationConfig(getDb(), req.user!.id, "agenda", kind);
  return res.json(kind === "auto_plan" ? await runAutoPlan(getDb(), req.user!.id, a.config) : await runReplan(getDb(), req.user!.id, a.config));
});

const decideSchema = z.object({ decision: z.enum(["apply", "reject"]), payload: z.record(z.unknown()).optional() });
planningHubRouter.post("/agenda/suggestions/:id/decide", async (req, res) => {
  const i = id.safeParse(req.params.id);
  const b = decideSchema.safeParse(req.body ?? {});
  if (!i.success || !b.success) return res.status(400).json({ error: "Decisão inválida." });
  try {
    return res.json(await decideAgendaSuggestion(getDb(), req.user!.id, i.data, b.data.decision, b.data.payload));
  } catch (e) {
    return fail(res, e);
  }
});

// ---------------- Missões: subtarefas e Mestre de Missões ----------------
planningHubRouter.get("/missions/tasks/:id/subtasks", async (req, res) => {
  const i = id.safeParse(req.params.id);
  if (!i.success) return res.status(400).json({ error: "Missão inválida." });
  return res.json(await listSubtasks(getDb(), req.user!.id, i.data));
});
const addSubSchema = z.object({ titles: z.array(z.string().trim().min(1).max(200)).min(1).max(30) });
planningHubRouter.post("/missions/tasks/:id/subtasks", async (req, res) => {
  const i = id.safeParse(req.params.id);
  const b = addSubSchema.safeParse(req.body ?? {});
  if (!i.success || !b.success) return res.status(400).json({ error: "Subtarefas inválidas." });
  try {
    return res.status(201).json(await addSubtasks(getDb(), req.user!.id, i.data, b.data.titles));
  } catch (e) {
    return fail(res, e);
  }
});
planningHubRouter.patch("/missions/subtasks/:id", async (req, res) => {
  const i = id.safeParse(req.params.id);
  const b = z.object({ done: z.boolean() }).safeParse(req.body ?? {});
  if (!i.success || !b.success) return res.status(400).json({ error: "Dados inválidos." });
  try {
    return res.json(await toggleSubtask(getDb(), req.user!.id, i.data, b.data.done));
  } catch (e) {
    return fail(res, e);
  }
});
planningHubRouter.delete("/missions/subtasks/:id", async (req, res) => {
  const i = id.safeParse(req.params.id);
  if (!i.success) return res.status(400).json({ error: "Subtarefa inválida." });
  return (await deleteSubtask(getDb(), req.user!.id, i.data)) ? res.status(204).end() : res.status(404).json({ error: "Subtarefa não encontrada." });
});
planningHubRouter.post("/missions/tasks/:id/breakdown", aiRateLimit(), async (req, res) => {
  const i = id.safeParse(req.params.id);
  if (!i.success) return res.status(400).json({ error: "Missão inválida." });
  try {
    return res.json(await proposeBreakdown(getDb(), req.user!.id, i.data));
  } catch (e) {
    return fail(res, e);
  }
});

planningHubRouter.patch("/missions/tasks/:id/plan", async (req, res) => {
  const i = id.safeParse(req.params.id);
  const b = z.object({ plannedDate: day.nullable() }).safeParse(req.body ?? {});
  if (!i.success || !b.success) return res.status(400).json({ error: "Data inválida." });
  try {
    await setTaskPlannedDate(getDb(), req.user!.id, i.data, b.data.plannedDate);
    return res.json({ ok: true });
  } catch (e) {
    return fail(res, e);
  }
});
