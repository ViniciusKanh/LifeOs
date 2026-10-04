import { Router, type Response } from "express";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { PROTOCOL_CATEGORIES, TRIGGER_METRICS, ACTION_LABEL, ACTION_MODE, OPEN_SCREEN_PATHS } from "../config/protocols.js";
import {
  ProtocolError,
  cancelRun,
  cloneTemplate,
  createProtocol,
  deleteProtocol,
  executeProtocol,
  getDailyPriority,
  getProtocolSuggestions,
  getProtocolUsageStats,
  listProtocols,
  listRuns,
  loadProtocolContext,
  pickFeatured,
  previewProtocolExecution,
  setFavorite,
  updateProtocol,
  updateRunStep,
  type ProtocolInput,
} from "../services/protocolService.js";
import { executeSchema, protocolSchema, runStepSchema } from "../validators/protocols.schema.js";
import { z } from "zod";

/** Protocolos — nenhuma rota executa ação sem confirmação explícita (preview → execute). */
export const protocolsRouter = Router();
protocolsRouter.use(requireAuth);

const ref = z.string().regex(/^(t|p):[A-Za-z0-9_-]{1,64}$/);
const fail = (res: Response, err: unknown) => {
  if (err instanceof ProtocolError) return res.status(err.status).json({ error: err.message });
  throw err;
};

/** GET /api/protocols — lista (mine + templates), destaque, contexto real e catálogo */
protocolsRouter.get("/", async (req, res) => {
  const db = getDb();
  const context = await loadProtocolContext(db, req.user!.id);
  const list = await listProtocols(db, req.user!.id, context);
  const cloned = new Set(list.filter((p) => p.kind === "mine" && p.sourceTemplate).map((p) => `t:${p.sourceTemplate}`));
  return res.json({
    protocols: list,
    featured: pickFeatured(list.filter((p) => !cloned.has(p.ref)))?.ref ?? null,
    context,
    catalog: {
      categories: PROTOCOL_CATEGORIES,
      metrics: TRIGGER_METRICS,
      actions: Object.keys(ACTION_LABEL).map((k) => ({ id: k, label: ACTION_LABEL[k as keyof typeof ACTION_LABEL], mode: ACTION_MODE[k as keyof typeof ACTION_MODE] })),
      screens: OPEN_SCREEN_PATHS,
    },
  });
});

/** GET /api/protocols/suggestions — gatilhos ativos (só sugestão) + missão principal do dia */
protocolsRouter.get("/suggestions", async (req, res) => {
  const db = getDb();
  const [suggestions, daily] = await Promise.all([getProtocolSuggestions(db, req.user!.id), getDailyPriority(db, req.user!.id)]);
  return res.json({ suggestions, daily });
});

/** GET /api/protocols/stats — uso e taxa de conclusão reais */
protocolsRouter.get("/stats", async (req, res) => res.json(await getProtocolUsageStats(getDb(), req.user!.id)));

/** GET /api/protocols/runs?status= */
protocolsRouter.get("/runs", async (req, res) => {
  const status = z.enum(["started", "partial", "completed", "canceled"]).optional().catch(undefined).parse(req.query.status);
  return res.json(await listRuns(getDb(), req.user!.id, { status, limit: 30 }));
});

/** POST /api/protocols — cria protocolo pessoal */
protocolsRouter.post("/", async (req, res) => {
  const parsed = protocolSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  try {
    return res.status(201).json(await createProtocol(getDb(), req.user!.id, parsed.data as ProtocolInput));
  } catch (err) {
    return fail(res, err);
  }
});

/** POST /api/protocols/templates/:key/clone — adiciona uma cópia do template à conta */
protocolsRouter.post("/templates/:key/clone", async (req, res) => {
  try {
    return res.status(201).json(await cloneTemplate(getDb(), req.user!.id, req.params.key));
  } catch (err) {
    return fail(res, err);
  }
});

protocolsRouter.put("/:ref", async (req, res) => {
  const r = ref.safeParse(req.params.ref);
  const parsed = protocolSchema.safeParse(req.body);
  if (!r.success || !parsed.success) return res.status(400).json({ error: parsed.success ? "Protocolo inválido." : parsed.error.issues[0]?.message ?? "Dados inválidos." });
  try {
    return res.json(await updateProtocol(getDb(), req.user!.id, r.data, parsed.data as ProtocolInput));
  } catch (err) {
    return fail(res, err);
  }
});

protocolsRouter.delete("/:ref", async (req, res) => {
  const r = ref.safeParse(req.params.ref);
  if (!r.success) return res.status(400).json({ error: "Protocolo inválido." });
  try {
    await deleteProtocol(getDb(), req.user!.id, r.data);
    return res.status(204).send();
  } catch (err) {
    return fail(res, err);
  }
});

protocolsRouter.post("/:ref/favorite", async (req, res) => {
  const r = ref.safeParse(req.params.ref);
  const f = z.object({ favorite: z.boolean() }).safeParse(req.body);
  if (!r.success || !f.success) return res.status(400).json({ error: "Requisição inválida." });
  try {
    await setFavorite(getDb(), req.user!.id, r.data, f.data.favorite);
    return res.json({ ok: true });
  } catch (err) {
    return fail(res, err);
  }
});

/** POST /api/protocols/:ref/preview — mostra o que cada passo faria (nada é gravado) */
protocolsRouter.post("/:ref/preview", async (req, res) => {
  const r = ref.safeParse(req.params.ref);
  if (!r.success) return res.status(400).json({ error: "Protocolo inválido." });
  try {
    return res.json(await previewProtocolExecution(getDb(), req.user!.id, r.data));
  } catch (err) {
    return fail(res, err);
  }
});

/** POST /api/protocols/:ref/execute — executa só os passos confirmados (idempotente por requestId) */
protocolsRouter.post("/:ref/execute", async (req, res) => {
  const r = ref.safeParse(req.params.ref);
  const parsed = executeSchema.safeParse(req.body);
  if (!r.success || !parsed.success) return res.status(400).json({ error: "Requisição inválida." });
  try {
    const run = await executeProtocol(getDb(), req.user!.id, r.data, parsed.data);
    return res.status(run.replayed ? 200 : 201).json(run);
  } catch (err) {
    return fail(res, err);
  }
});

/** PATCH /api/protocols/runs/:id/steps — marca passo manual como feito/pulado */
protocolsRouter.patch("/runs/:id/steps", async (req, res) => {
  const parsed = runStepSchema.extend({ stepRef: z.string().min(1).max(120) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Requisição inválida." });
  try {
    return res.json(await updateRunStep(getDb(), req.user!.id, req.params.id, parsed.data.stepRef, parsed.data.status));
  } catch (err) {
    return fail(res, err);
  }
});

/** POST /api/protocols/runs/:id/cancel */
protocolsRouter.post("/runs/:id/cancel", async (req, res) => {
  try {
    return res.json(await cancelRun(getDb(), req.user!.id, req.params.id));
  } catch (err) {
    return fail(res, err);
  }
});
