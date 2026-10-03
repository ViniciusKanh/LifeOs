import { Router } from "express";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { getPlayerProfile, getProjectsXp, getXpHistory, publicRules } from "../services/gamificationService.js";
import {
  createReward,
  deleteReward,
  listRedemptions,
  listRewards,
  redeemReward,
  updateReward,
} from "../services/rewardsService.js";
import { createRewardSchema, historyQuerySchema, updateRewardSchema } from "../validators/gamification.schema.js";

/**
 * Rotas do motor de gamificação. Nenhuma rota permite conceder XP ou
 * moedas diretamente: eles só nascem das ações reais (hooks nos módulos).
 */
export const gamificationRouter = Router();
gamificationRouter.use(requireAuth);

/** GET /api/gamification/profile — nível, XP, moedas, sequência e eventos recentes */
gamificationRouter.get("/profile", async (req, res) => {
  return res.json(await getPlayerProfile(getDb(), req.user!.id));
});

/** GET /api/gamification/history?days=30 — XP por dia e por origem */
gamificationRouter.get("/history", async (req, res) => {
  const parsed = historyQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Período inválido." });
  return res.json({ days: await getXpHistory(getDb(), req.user!.id, parsed.data.days) });
});

/** GET /api/gamification/projects — XP conquistado/disponível por projeto */
gamificationRouter.get("/projects", async (req, res) => {
  return res.json(await getProjectsXp(getDb(), req.user!.id));
});

/** GET /api/gamification/rules — valores públicos das regras (para prévia na UI) */
gamificationRouter.get("/rules", (_req, res) => {
  return res.json(publicRules());
});

/** GET /api/gamification/rewards?all=1 */
gamificationRouter.get("/rewards", async (req, res) => {
  return res.json(await listRewards(getDb(), req.user!.id, req.query.all === "1"));
});

/** POST /api/gamification/rewards */
gamificationRouter.post("/rewards", async (req, res) => {
  const parsed = createRewardSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  return res.status(201).json(await createReward(getDb(), req.user!.id, parsed.data));
});

/** PATCH /api/gamification/rewards/:id */
gamificationRouter.patch("/rewards/:id", async (req, res) => {
  const parsed = updateRewardSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  const updated = await updateReward(getDb(), req.user!.id, req.params.id, parsed.data);
  if (!updated) return res.status(404).json({ error: "Recompensa não encontrada." });
  return res.json(updated);
});

/** DELETE /api/gamification/rewards/:id — desativa se já tiver resgates */
gamificationRouter.delete("/rewards/:id", async (req, res) => {
  const ok = await deleteReward(getDb(), req.user!.id, req.params.id);
  if (!ok) return res.status(404).json({ error: "Recompensa não encontrada." });
  return res.status(204).send();
});

/** POST /api/gamification/rewards/:id/redeem — debita moedas e registra o resgate */
gamificationRouter.post("/rewards/:id/redeem", async (req, res) => {
  const result = await redeemReward(getDb(), req.user!.id, req.params.id);
  if (!result.ok) {
    const status = result.code === "not_found" ? 404 : 409;
    return res.status(status).json({ error: result.message, code: result.code, balance: result.balance, availableAt: result.availableAt });
  }
  return res.status(201).json(result);
});

/** GET /api/gamification/redemptions */
gamificationRouter.get("/redemptions", async (req, res) => {
  return res.json(await listRedemptions(getDb(), req.user!.id));
});
