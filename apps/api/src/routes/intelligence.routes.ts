import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { IntelligenceError, forgeArtifact, getArtifactDetail, getOverview, listExperiments, refreshGrimoire } from "../services/intelligenceService.js";

/**
 * Forja da Inteligência. A visão geral só lê resultados já calculados;
 * forjar e atualizar o grimório (que leem o histórico) são ações explícitas
 * do usuário, com limite de frequência.
 */
export const intelligenceRouter = Router();
intelligenceRouter.use(requireAuth);

const heavyLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, key: (req) => `intelligence:${req.user?.id ?? req.ip}` });
const forgeSchema = z.object({ objective: z.enum(["productivity", "habits", "focus", "energy", "study"]) });
const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

const fail = (res: import("express").Response, err: unknown) => {
  if (err instanceof IntelligenceError) return res.status(err.status).json({ error: err.message });
  throw err;
};

/** GET /api/intelligence/overview */
intelligenceRouter.get("/overview", async (req, res) => {
  res.json(await getOverview(getDb(), req.user!.id));
});

/** GET /api/intelligence/experiments — histórico da Arena. */
intelligenceRouter.get("/experiments", async (req, res) => {
  res.json(await listExperiments(getDb(), req.user!.id));
});

/** GET /api/intelligence/artifacts/:id — detalhe (modo aventureiro e cientista). */
intelligenceRouter.get("/artifacts/:id", async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: "Artefato inválido." });
  try {
    return res.json(await getArtifactDetail(getDb(), req.user!.id, id.data));
  } catch (e) {
    return fail(res, e);
  }
});

/** POST /api/intelligence/grimoire/refresh — recalcula o resumo do dataset e a prontidão. */
intelligenceRouter.post("/grimoire/refresh", heavyLimit, async (req, res) => {
  res.json(await refreshGrimoire(getDb(), req.user!.id));
});

/** POST /api/intelligence/forge — forja ou reforja (confirmado na UI). */
intelligenceRouter.post("/forge", heavyLimit, async (req, res) => {
  const body = forgeSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Objetivo inválido." });
  try {
    return res.status(201).json(await forgeArtifact(getDb(), req.user!.id, body.data.objective));
  } catch (e) {
    return fail(res, e);
  }
});
