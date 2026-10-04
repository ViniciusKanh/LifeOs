import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { applyEvolutionPlan, getBuildEvolution, getBuildOverview, resetDesiredBuild, saveDesiredBuild } from "../services/characterBuildService.js";
import { desiredBuildSchema } from "../validators/protocols.schema.js";

/** Build do Personagem — leitura do XP real por atributo; tudo isolado por usuário. */
export const buildRouter = Router();
buildRouter.use(requireAuth);

/** GET /api/build — atributos, arquétipo, build desejada, gaps, insights, plano e comparações */
buildRouter.get("/", async (req, res) => res.json(await getBuildOverview(getDb(), req.user!.id)));

/** GET /api/build/evolution?period=30d|90d|180d|365d */
buildRouter.get("/evolution", async (req, res) => {
  const p = z.enum(["30d", "90d", "180d", "365d"]).catch("90d").parse(req.query.period);
  return res.json(await getBuildEvolution(getDb(), req.user!.id, p));
});

/** PUT /api/build/desired — salva a build desejada (não altera nenhum dado real) */
buildRouter.put("/desired", async (req, res) => {
  const parsed = desiredBuildSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Valores inválidos." });
  return res.json(await saveDesiredBuild(getDb(), req.user!.id, parsed.data));
});

/** DELETE /api/build/desired — volta ao padrão */
buildRouter.delete("/desired", async (req, res) => res.json(await resetDesiredBuild(getDb(), req.user!.id)));

/** POST /api/build/plan/apply — cria SÓ os itens confirmados no preview */
buildRouter.post("/plan/apply", async (req, res) => {
  const parsed = z.object({ itemIds: z.array(z.string().max(60)).min(1).max(20) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Selecione pelo menos um item do plano." });
  return res.json(await applyEvolutionPlan(getDb(), req.user!.id, parsed.data.itemIds));
});
