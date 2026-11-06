import { Router, type Response } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { evaluateAchievements } from "../services/achievementsService.js";
import { STEPS, Tavern3Error, closeRitual, getTavern3, rememberTomorrowTask, reserveFocusBlock, saveJournalFields, saveRitual, setRequiredSteps } from "../services/tavern3Service.js";
import {
  ForgeError,
  activateVersion,
  analyzeData,
  archiveRun,
  archiveVersion,
  backtestModel,
  createFromTemplate,
  createModel,
  deactivate,
  deleteModel,
  dictionary,
  generatePredictions,
  getForgeOverview,
  getModelReport,
  markExplanationViewed,
  monitorModel,
  reportCsv,
  resolveActuals,
  setArchived,
  trainModel,
  updateModel,
} from "../services/forgeService.js";
import { ALGS_FOR } from "../services/forgeEngine.js";

/**
 * Taverna 3.0 (/api/tavern3) e Forja da Inteligência 3.0 (/api/forge).
 * Todas as consultas são isoladas por owner_id nos serviços. Treinos e
 * escritas só acontecem por ação explícita do usuário.
 */
export const tavern3Router = Router();
export const forgeRouter = Router();
tavern3Router.use(requireAuth);
forgeRouter.use(requireAuth);

const heavy = rateLimit({ windowMs: 10 * 60 * 1000, max: 30 });

function fail(res: Response, err: unknown) {
  if (err instanceof Tavern3Error || err instanceof ForgeError) return res.status(err.status).json({ error: err.message });
  console.error("[taverna/forja] erro:", err instanceof Error ? err.message : "desconhecido");
  return res.status(500).json({ error: "Não foi possível concluir a ação." });
}
function parse<T>(schema: z.ZodType<T>, body: unknown, res: Response): T | null {
  const p = schema.safeParse(body ?? {});
  if (!p.success) {
    res.status(400).json({ error: p.error.issues[0]?.message ?? "Dados inválidos." });
    return null;
  }
  return p.data;
}
const text = z.string().max(4000).optional();
const stepEnum = z.enum(STEPS);

/* ───────────────────────────── Taverna ───────────────────────────── */

tavern3Router.get("/", async (req, res) => {
  try {
    return res.json(await getTavern3(getDb(), req.user!.id));
  } catch (e) {
    return fail(res, e);
  }
});

tavern3Router.put("/ritual", async (req, res) => {
  const d = parse(z.object({ highlights: text, challenges: text, decisions: text, learned: text, worked: text, improve: text, repeatThis: text, avoidTomorrow: text, selfCare: text, steps: z.array(stepEnum).max(5).optional(), priorities: z.array(z.string().min(1).max(64)).max(5).optional() }), req.body, res);
  if (!d) return;
  try {
    return res.json(await saveRitual(getDb(), req.user!.id, d));
  } catch (e) {
    return fail(res, e);
  }
});

tavern3Router.put("/journal", async (req, res) => {
  const d = parse(
    z.object({ thoughts: z.string().max(40000).optional(), reflection: text, learning: text, pending: z.string().max(2000).optional(), intention: text, gratitude: z.array(z.string().max(300)).max(10).optional(), baseUpdatedAt: z.string().max(40).nullable().optional() }),
    req.body,
    res,
  );
  if (!d) return;
  try {
    return res.json(await saveJournalFields(getDb(), req.user!.id, d));
  } catch (e) {
    return fail(res, e);
  }
});

tavern3Router.put("/settings", async (req, res) => {
  const d = parse(z.object({ required: z.array(stepEnum).min(1).max(5) }), req.body, res);
  if (!d) return;
  try {
    await setRequiredSteps(getDb(), req.user!.id, d.required);
    return res.json({ ok: true });
  } catch (e) {
    return fail(res, e);
  }
});

tavern3Router.post("/focus-block", async (req, res) => {
  const d = parse(z.object({ start: z.string(), end: z.string(), title: z.string().trim().min(1).max(200), taskId: z.string().max(64).nullable().optional() }), req.body, res);
  if (!d) return;
  try {
    return res.json(await reserveFocusBlock(getDb(), req.user!.id, d));
  } catch (e) {
    return fail(res, e);
  }
});

tavern3Router.post("/tomorrow-task", async (req, res) => {
  const d = parse(z.object({ taskId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) }), req.body, res);
  if (!d) return;
  try {
    await rememberTomorrowTask(getDb(), req.user!.id, d.taskId);
    return res.json({ ok: true });
  } catch (e) {
    return fail(res, e);
  }
});

tavern3Router.post("/close", async (req, res) => {
  try {
    const r = await closeRitual(getDb(), req.user!.id);
    if (r.granted) await evaluateAchievements(req.user!.id).catch(() => undefined);
    return res.json(r);
  } catch (e) {
    return fail(res, e);
  }
});

/* ───────────────────────────── Forja ───────────────────────────── */

forgeRouter.get("/overview", async (req, res) => {
  try {
    return res.json(await getForgeOverview(getDb(), req.user!.id));
  } catch (e) {
    return fail(res, e);
  }
});
forgeRouter.get("/dictionary", (_req, res) => res.json(dictionary()));

forgeRouter.post("/data/analyze", heavy, async (req, res) => {
  try {
    return res.json(await analyzeData(getDb(), req.user!.id));
  } catch (e) {
    return fail(res, e);
  }
});

const alg = z.enum(["baseline", "persistence", "logistic", "naive_bayes", "knn", "tree", "random_forest", "gradient_boosting", "linear", "ridge"]);
const modelSchema = z.object({
  name: z.string().trim().min(2, "Dê um nome ao modelo.").max(80),
  problem: z.enum(["classification", "regression"]),
  target: z.string().min(1).max(40),
  horizon: z.number().int().min(1).max(7),
  features: z.array(z.string().max(60)).min(2).max(40),
  algorithms: z.array(alg).min(1).max(10),
  validation: z.object({
    folds: z.number().int().min(3).max(6),
    holdoutPct: z.number().min(0.1).max(0.3),
    search: z.enum(["grid", "random", "none"]),
    searchBudget: z.number().int().min(1).max(8),
    primary: z.enum(["balanced_accuracy", "brier", "log_loss", "mae", "rmse"]),
    margin: z.number().min(0).max(0.5),
  }),
  schedule: z.enum(["manual", "weekly", "monthly"]),
});

forgeRouter.post("/models", async (req, res) => {
  const d = parse(modelSchema, req.body, res);
  if (!d) return;
  try {
    return res.status(201).json(await createModel(getDb(), req.user!.id, d));
  } catch (e) {
    return fail(res, e);
  }
});
forgeRouter.post("/templates/:key", async (req, res) => {
  try {
    const m = await createFromTemplate(getDb(), req.user!.id, req.params.key);
    void evaluateAchievements(req.user!.id).catch(() => undefined);
    return res.status(201).json(m);
  } catch (e) {
    return fail(res, e);
  }
});
forgeRouter.put("/models/:id", async (req, res) => {
  const d = parse(modelSchema.partial(), req.body, res);
  if (!d) return;
  try {
    return res.json(await updateModel(getDb(), req.user!.id, req.params.id, d));
  } catch (e) {
    return fail(res, e);
  }
});
forgeRouter.post("/models/:id/archive", async (req, res) => {
  const d = parse(z.object({ archived: z.boolean() }), req.body, res);
  if (!d) return;
  try {
    return res.json(await setArchived(getDb(), req.user!.id, req.params.id, d.archived));
  } catch (e) {
    return fail(res, e);
  }
});
forgeRouter.delete("/models/:id", async (req, res) => {
  try {
    await deleteModel(getDb(), req.user!.id, req.params.id);
    return res.status(204).end();
  } catch (e) {
    return fail(res, e);
  }
});
forgeRouter.post("/models/:id/train", heavy, async (req, res) => {
  try {
    const r = await trainModel(getDb(), req.user!.id, req.params.id);
    void evaluateAchievements(req.user!.id).catch(() => undefined);
    return res.json(r);
  } catch (e) {
    return fail(res, e);
  }
});
forgeRouter.post("/models/:id/backtest", heavy, async (req, res) => {
  try {
    return res.json(await backtestModel(getDb(), req.user!.id, req.params.id));
  } catch (e) {
    return fail(res, e);
  }
});
forgeRouter.post("/models/:id/monitor", heavy, async (req, res) => {
  try {
    await resolveActuals(getDb(), req.user!.id);
    return res.json(await monitorModel(getDb(), req.user!.id, req.params.id));
  } catch (e) {
    return fail(res, e);
  }
});
forgeRouter.post("/models/:id/versions/:vid/activate", async (req, res) => {
  try {
    await activateVersion(getDb(), req.user!.id, req.params.id, req.params.vid);
    return res.json({ ok: true });
  } catch (e) {
    return fail(res, e);
  }
});
forgeRouter.post("/models/:id/versions/:vid/archive", async (req, res) => {
  try {
    await archiveVersion(getDb(), req.user!.id, req.params.id, req.params.vid);
    return res.json({ ok: true });
  } catch (e) {
    return fail(res, e);
  }
});
forgeRouter.post("/models/:id/deactivate", async (req, res) => {
  try {
    await deactivate(getDb(), req.user!.id, req.params.id);
    return res.json({ ok: true });
  } catch (e) {
    return fail(res, e);
  }
});
forgeRouter.post("/predictions/refresh", heavy, async (req, res) => {
  try {
    const resolved = await resolveActuals(getDb(), req.user!.id);
    const generated = await generatePredictions(getDb(), req.user!.id);
    return res.json({ resolved, generated });
  } catch (e) {
    return fail(res, e);
  }
});
forgeRouter.post("/explanations/viewed", async (req, res) => {
  await markExplanationViewed(getDb(), req.user!.id).catch(() => undefined);
  return res.json({ ok: true });
});
forgeRouter.post("/runs/:id/archive", async (req, res) => {
  await archiveRun(getDb(), req.user!.id, req.params.id);
  return res.json({ ok: true });
});
forgeRouter.get("/models/:id/report", async (req, res) => {
  try {
    const r = await getModelReport(getDb(), req.user!.id, req.params.id);
    if (req.query.format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="forja-modelo-${req.params.id}.csv"`);
      return res.send(`﻿${reportCsv(r)}`);
    }
    return res.json(r);
  } catch (e) {
    return fail(res, e);
  }
});
forgeRouter.get("/algorithms", (_req, res) => res.json(ALGS_FOR));
