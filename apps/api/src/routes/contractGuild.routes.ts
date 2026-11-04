import { Router, type Response } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { evaluateAchievements } from "../services/achievementsService.js";
import { activateDraft, ContractError } from "../services/contractsService.js";
import {
  cancelPact,
  completeStage,
  getGuildHub,
  getPactDetail,
  proposePact,
  replanPact,
  saveStages,
  sealPact,
  setFeatured,
  setPaused,
  setTaskStage,
} from "../services/contractGuildService.js";
import { DIFFICULTIES, stageSchema } from "../validators/contracts.schema.js";

/**
 * Contratos 3.0 — Guilda dos Pactos (/api/contract-guild). Isolado por owner_id
 * nos serviços. A IA só devolve propostas; criar/alterar exige ação explícita.
 */
export const contractGuildRouter = Router();
contractGuildRouter.use(requireAuth);

const aiLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 20 });
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

function fail(res: Response, err: unknown) {
  if (err instanceof ContractError) return res.status(err.status).json({ error: err.message });
  console.error("[guilda] erro:", err instanceof Error ? err.message : "desconhecido");
  return res.status(500).json({ error: "Não foi possível concluir a ação." });
}

function parse<T>(schema: z.ZodType<T>, body: unknown, res: Response): T | null {
  const p = schema.safeParse(body);
  if (!p.success) {
    res.status(400).json({ error: p.error.issues[0]?.message ?? "Dados inválidos." });
    return null;
  }
  return p.data;
}

contractGuildRouter.get("/", async (req, res) => {
  try {
    return res.json(await getGuildHub(getDb(), req.user!.id));
  } catch (err) {
    return fail(res, err);
  }
});

const proposeSchema = z.object({
  goal: z.string().trim().min(8, "Descreva o objetivo com um pouco mais de detalhe.").max(1200),
  why: z.string().trim().max(600).optional(),
  category: z.string().trim().max(30).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  startInDays: z.number().int().min(0).max(90).optional(),
  deadlineDays: z.number().int().min(1).max(365).optional(),
  weeklyHours: z.number().int().min(1).max(80).optional(),
  stageCount: z.number().int().min(3).max(5).optional(),
});

contractGuildRouter.post("/ai/scribe", aiLimit, async (req, res) => {
  const data = parse(proposeSchema, req.body, res);
  if (!data) return;
  try {
    const r = await proposePact(getDb(), req.user!.id, data);
    if (!r.ok) return res.status(422).json({ error: r.message });
    return res.json({ proposal: r.data });
  } catch (err) {
    return fail(res, err);
  }
});

contractGuildRouter.get("/:id", async (req, res) => {
  try {
    return res.json(await getPactDetail(getDb(), req.user!.id, req.params.id));
  } catch (err) {
    return fail(res, err);
  }
});

contractGuildRouter.post("/:id/pause", async (req, res) => {
  const data = parse(z.object({ pause: z.boolean() }), req.body, res);
  if (!data) return;
  try {
    return res.json(await setPaused(getDb(), req.user!.id, req.params.id, data.pause));
  } catch (err) {
    return fail(res, err);
  }
});

contractGuildRouter.post("/:id/cancel", async (req, res) => {
  const data = parse(z.object({ reason: z.string().trim().max(300).optional().nullable() }), req.body ?? {}, res);
  if (!data) return;
  try {
    return res.json(await cancelPact(getDb(), req.user!.id, req.params.id, data.reason ?? null));
  } catch (err) {
    return fail(res, err);
  }
});

contractGuildRouter.post("/:id/activate", async (req, res) => {
  try {
    return res.json(await activateDraft(getDb(), req.user!.id, req.params.id));
  } catch (err) {
    return fail(res, err);
  }
});

contractGuildRouter.post("/:id/replan", async (req, res) => {
  const data = parse(z.object({ dueDate: dateOnly, spreadOverdue: z.boolean().default(true), reason: z.string().trim().max(300).optional().nullable() }), req.body, res);
  if (!data) return;
  try {
    return res.json(await replanPact(getDb(), req.user!.id, req.params.id, { ...data, spreadOverdue: data.spreadOverdue ?? true }));
  } catch (err) {
    return fail(res, err);
  }
});

contractGuildRouter.post("/:id/feature", async (req, res) => {
  const data = parse(z.object({ featured: z.boolean() }), req.body, res);
  if (!data) return;
  try {
    await setFeatured(getDb(), req.user!.id, req.params.id, data.featured);
    return res.json({ ok: true });
  } catch (err) {
    return fail(res, err);
  }
});

contractGuildRouter.put("/:id/stages", async (req, res) => {
  const data = parse(z.object({ stages: z.array(stageSchema).max(10) }), req.body, res);
  if (!data) return;
  try {
    await saveStages(getDb(), req.user!.id, req.params.id, data.stages);
    return res.json(await getPactDetail(getDb(), req.user!.id, req.params.id));
  } catch (err) {
    return fail(res, err);
  }
});

contractGuildRouter.post("/:id/stages/:stageId/complete", async (req, res) => {
  const data = parse(z.object({ done: z.boolean() }), req.body, res);
  if (!data) return;
  try {
    await completeStage(getDb(), req.user!.id, req.params.id, req.params.stageId, data.done);
    void evaluateAchievements(req.user!.id).catch(() => undefined);
    return res.json(await getPactDetail(getDb(), req.user!.id, req.params.id));
  } catch (err) {
    return fail(res, err);
  }
});

contractGuildRouter.post("/:id/tasks/:taskId/stage", async (req, res) => {
  const data = parse(z.object({ stageId: z.string().trim().min(1).nullable() }), req.body, res);
  if (!data) return;
  try {
    await setTaskStage(getDb(), req.user!.id, req.params.id, req.params.taskId, data.stageId);
    return res.json(await getPactDetail(getDb(), req.user!.id, req.params.id));
  } catch (err) {
    return fail(res, err);
  }
});

/** POST /:id/seal — ritual de selamento (confirmado na interface). */
contractGuildRouter.post("/:id/seal", async (req, res) => {
  try {
    const result = await sealPact(getDb(), req.user!.id, req.params.id);
    // Conquistas por métrica (pactos selados, tipos de selo) — o próprio motor evita repetição.
    await evaluateAchievements(req.user!.id).catch(() => undefined);
    return res.json(result);
  } catch (err) {
    return fail(res, err);
  }
});
