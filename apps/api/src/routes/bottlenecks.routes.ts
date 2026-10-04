import { Router } from "express";
import { z } from "zod";
import { bottleneckConfig } from "../config/bottlenecks.js";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { askOracle, oracleInputSchema, ORACLE_QUESTIONS } from "../services/bottleneckAIService.js";
import { analyzeBottlenecks, BottleneckError, getBottleneckDetail, getExpandedGraph, previewFocusSession, scheduleFocusSession, type AnalysisPeriod } from "../services/bottleneckService.js";

/**
 * Detector de Gargalos. Leitura determinística (cache por usuário) +
 * Oráculo (Gemini) sob demanda + agendamento de Focus só após confirmação.
 */
export const bottlenecksRouter = Router();
bottlenecksRouter.use(requireAuth);

const periodSchema = z.enum(["today", "7d", "30d"]).catch("7d");
const keySchema = z.string().regex(/^(task|project|campaign|milestone|habit|capacity|health):[A-Za-z0-9_-]{1,64}$/);
const focusSchema = z.object({
  taskId: z.string().trim().min(1).max(64),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  minutes: z.number().int().min(15).max(240),
});

const fail = (res: import("express").Response, err: unknown) => {
  if (err instanceof BottleneckError) return res.status(err.status).json({ error: err.message });
  throw err;
};

/** GET /api/bottlenecks?period=today|7d|30d&refresh=1 */
bottlenecksRouter.get("/", async (req, res) => {
  const period = periodSchema.parse(req.query.period) as AnalysisPeriod;
  const result = await analyzeBottlenecks(getDb(), req.user!.id, { period, refresh: req.query.refresh === "1" });
  res.json({ ...result, questions: ORACLE_QUESTIONS });
});

/** GET /api/bottlenecks/detail/:key — detalhe (score, causas, grafo, ações, simulação, histórico). */
bottlenecksRouter.get("/detail/:key", async (req, res) => {
  const key = keySchema.safeParse(req.params.key);
  if (!key.success) return res.status(400).json({ error: "Item inválido." });
  try {
    return res.json(await getBottleneckDetail(getDb(), req.user!.id, key.data, periodSchema.parse(req.query.period) as AnalysisPeriod));
  } catch (e) {
    return fail(res, e);
  }
});

/** GET /api/bottlenecks/graph/:key — mapa ampliado (até 4 níveis). */
bottlenecksRouter.get("/graph/:key", async (req, res) => {
  const key = keySchema.safeParse(req.params.key);
  if (!key.success) return res.status(400).json({ error: "Item inválido." });
  try {
    return res.json(await getExpandedGraph(getDb(), req.user!.id, key.data, periodSchema.parse(req.query.period) as AnalysisPeriod));
  } catch (e) {
    return fail(res, e);
  }
});

/** POST /api/bottlenecks/focus/preview — mostra data, horário, conflitos e carga (nada é salvo). */
bottlenecksRouter.post("/focus/preview", async (req, res) => {
  const parsed = focusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados inválidos." });
  try {
    return res.json(await previewFocusSession(getDb(), req.user!.id, parsed.data));
  } catch (e) {
    return fail(res, e);
  }
});

/** POST /api/bottlenecks/focus/schedule — cria o bloco confirmado no Capacity Planner. */
bottlenecksRouter.post("/focus/schedule", async (req, res) => {
  const parsed = focusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados inválidos." });
  try {
    const r = await scheduleFocusSession(getDb(), req.user!.id, parsed.data);
    return res.status(r.created ? 201 : 200).json(r);
  } catch (e) {
    return fail(res, e);
  }
});

const aiLimit = rateLimit({ ...bottleneckConfig.ai.rateLimit, key: (req) => `bottleneck-ai:${req.user?.id ?? req.ip}` });

/** POST /api/bottlenecks/oracle — explicação do Gemini sobre o resultado da engine. */
bottlenecksRouter.post("/oracle", aiLimit, async (req, res) => {
  const parsed = oracleInputSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Dados inválidos." });
  if (parsed.data.key && !keySchema.safeParse(parsed.data.key).success) return res.status(400).json({ error: "Item inválido." });
  const r = await askOracle(getDb(), req.user!.id, parsed.data);
  if (!r.ok) return res.status(r.status).json({ error: r.message, code: r.code });
  return res.json(r.data);
});
