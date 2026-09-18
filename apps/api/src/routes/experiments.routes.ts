import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import {
  ExperimentError,
  listExperiments,
  getExperimentSummary,
  getExperimentInsights,
  getExperimentDetail,
  getExperimentSeries,
  getMetricCatalog,
  createExperiment,
  updateExperiment,
  deleteExperiment,
  transitionStatus,
  concludeExperiment,
  upsertLog,
} from "../services/experimentService.js";
import { analyzeExperiment, suggestExperiment } from "../services/experimentAIService.js";
import { METRIC_KEYS } from "../services/experimentMetricsService.js";
import { VERIFICATION_RULES } from "../services/experimentVerificationService.js";

export const experimentsRouter = Router();
experimentsRouter.use(requireAuth);

const metricKeyEnum = z.enum(METRIC_KEYS as [string, ...string[]]);
const verificationRuleEnum = z.enum(Object.keys(VERIFICATION_RULES) as [string, ...string[]]);
const categoryEnum = z.enum(["saude", "sono", "exercicio", "hidratacao", "produtividade", "focus", "educacao", "leitura", "habitos", "bem_estar", "personalizado"]);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato YYYY-MM-DD");

const createSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional().nullable(),
  category: categoryEnum,
  hypothesis: z.string().trim().max(500).optional().nullable(),
  motivation: z.string().trim().max(500).optional().nullable(),
  startDate: dateSchema,
  endDate: dateSchema,
  primaryMetric: metricKeyEnum,
  secondaryMetrics: z.array(metricKeyEnum).max(5).optional(),
  linkedHabitId: z.string().optional().nullable(),
  verificationType: z.enum(["automatic", "manual"]),
  verificationRule: verificationRuleEnum.optional().nullable(),
  verificationConfig: z.record(z.unknown()).optional().nullable(),
  successCriteriaType: z.enum(["consistency", "metric_change", "none"]).optional(),
  successCriteriaValue: z.number().optional().nullable(),
});

const updateSchema = createSchema.partial();

const statusSchema = z.object({ status: z.enum(["draft", "active", "paused", "completed", "cancelled"]) });

const logSchema = z.object({
  logDate: dateSchema,
  checkinStatus: z.enum(["done", "missed"]).optional().nullable(),
  perception: z.enum(["muito_ruim", "ruim", "neutro", "bom", "muito_bom"]).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

const concludeSchema = z.object({
  personalConclusion: z.string().trim().max(2000).optional().nullable(),
  worthContinuing: z.enum(["yes", "maybe", "no"]).optional().nullable(),
  perceivedResult: z.enum(["improved", "no_change", "worsened"]).optional().nullable(),
});

const analyzeSchema = z.object({ question: z.string().trim().max(500).optional() });

function handleError(res: import("express").Response, err: unknown) {
  if (err instanceof ExperimentError) return res.status(err.status).json({ error: err.message });
  throw err;
}

/** GET /api/experiments/metrics/catalog — métricas disponíveis para o wizard (com aviso de histórico insuficiente). */
experimentsRouter.get("/metrics/catalog", async (req, res) => {
  const db = getDb();
  const catalog = await getMetricCatalog(db, req.user!.id);
  return res.json(catalog);
});

/** GET /api/experiments/verification/rules — regras automáticas disponíveis para o wizard. */
experimentsRouter.get("/verification/rules", async (_req, res) => {
  return res.json(Object.values(VERIFICATION_RULES));
});

/** GET /api/experiments/summary — KPIs do topo da página. */
experimentsRouter.get("/summary", async (req, res) => {
  const db = getDb();
  const summary = await getExperimentSummary(db, req.user!.id);
  return res.json(summary);
});

/** GET /api/experiments/insights — cartão "Insights dos seus experimentos". */
experimentsRouter.get("/insights", async (req, res) => {
  const db = getDb();
  const insights = await getExperimentInsights(db, req.user!.id);
  return res.json(insights);
});

/** GET /api/experiments/suggestions/ai — sugestão de experimento via IA (nunca cria nada sozinho). */
experimentsRouter.get("/suggestions/ai", async (req, res) => {
  const db = getDb();
  const result = await suggestExperiment(db, req.user!.id);
  if (!result.ok) return res.status(422).json({ error: result.message });
  return res.json(result.suggestion);
});

/** GET /api/experiments — listagem com progresso/resultado já calculados. */
experimentsRouter.get("/", async (req, res) => {
  const db = getDb();
  const items = await listExperiments(db, req.user!.id);
  return res.json(items);
});

/** POST /api/experiments — cria (e já inicia, se a data inicial já chegou). */
experimentsRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  try {
    const db = getDb();
    const created = await createExperiment(db, req.user!.id, parsed.data as Parameters<typeof createExperiment>[2]);
    return res.status(201).json(created);
  } catch (err) {
    return handleError(res, err);
  }
});

/** GET /api/experiments/:id — detalhe completo (comparação, check-ins, observações, interpretação). */
experimentsRouter.get("/:id", async (req, res) => {
  try {
    const db = getDb();
    const detail = await getExperimentDetail(db, req.user!.id, req.params.id);
    return res.json(detail);
  } catch (err) {
    return handleError(res, err);
  }
});

/** GET /api/experiments/:id/series?metric=xxx — série diária (antes+durante) para o gráfico temporal (seção 21). */
experimentsRouter.get("/:id/series", async (req, res) => {
  const metric = metricKeyEnum.safeParse(req.query.metric);
  if (!metric.success) return res.status(400).json({ error: "Métrica inválida." });
  try {
    const db = getDb();
    const series = await getExperimentSeries(db, req.user!.id, req.params.id, metric.data as Parameters<typeof getExperimentSeries>[3]);
    return res.json(series);
  } catch (err) {
    return handleError(res, err);
  }
});

/** PATCH /api/experiments/:id — edição de campos do experimento. */
experimentsRouter.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  try {
    const db = getDb();
    const updated = await updateExperiment(db, req.user!.id, req.params.id, parsed.data as Parameters<typeof updateExperiment>[3]);
    return res.json(updated);
  } catch (err) {
    return handleError(res, err);
  }
});

/** DELETE /api/experiments/:id */
experimentsRouter.delete("/:id", async (req, res) => {
  try {
    const db = getDb();
    await deleteExperiment(db, req.user!.id, req.params.id);
    return res.status(204).end();
  } catch (err) {
    return handleError(res, err);
  }
});

/** POST /api/experiments/:id/status — pausar, retomar, encerrar (concluir sem fluxo de conclusão) ou cancelar. */
experimentsRouter.post("/:id/status", async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Status inválido." });
  try {
    const db = getDb();
    const updated = await transitionStatus(db, req.user!.id, req.params.id, parsed.data.status);
    return res.json(updated);
  } catch (err) {
    return handleError(res, err);
  }
});

/** POST /api/experiments/:id/conclude — fluxo de conclusão pessoal (seção 31). */
experimentsRouter.post("/:id/conclude", async (req, res) => {
  const parsed = concludeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados inválidos." });
  try {
    const db = getDb();
    const updated = await concludeExperiment(db, req.user!.id, req.params.id, parsed.data);
    return res.json(updated);
  } catch (err) {
    return handleError(res, err);
  }
});

/** POST /api/experiments/:id/logs — upsert de check-in manual e/ou observação do dia. */
experimentsRouter.post("/:id/logs", async (req, res) => {
  const parsed = logSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  try {
    const db = getDb();
    const log = await upsertLog(db, req.user!.id, req.params.id, parsed.data);
    return res.status(201).json(log);
  } catch (err) {
    return handleError(res, err);
  }
});

/** POST /api/experiments/:id/analyze — análise do LifeOS Copilot sobre o experimento. */
experimentsRouter.post("/:id/analyze", async (req, res) => {
  const parsed = analyzeSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Dados inválidos." });
  try {
    const db = getDb();
    const result = await analyzeExperiment(db, req.user!.id, req.params.id, parsed.data.question);
    if (!result.ok) return res.status(422).json({ error: result.message });
    return res.json({ text: result.text });
  } catch (err) {
    return handleError(res, err);
  }
});
