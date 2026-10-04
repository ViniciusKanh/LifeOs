import { Router } from "express";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { getDifficultyRewards, getLevelHistory, getPlayerProfile, getPriorityRewards, getProjectsXp, getWalletSummary, getXpHistory, publicRules, saveDifficultyRewards, savePriorityRewards } from "../services/gamificationService.js";
import { addStarterRewards, suggestRewards } from "../services/rewardsAIService.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { difficultySettingsSchema, prioritySettingsSchema } from "../validators/contracts.schema.js";
import { z } from "zod";
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

/** GET /api/gamification/levels — datas reais de cada subida de nível (derivadas do ledger) */
gamificationRouter.get("/levels", async (req, res) => {
  return res.json({ levels: await getLevelHistory(getDb(), req.user!.id) });
});

/** GET /api/gamification/projects — XP conquistado/disponível por projeto */
gamificationRouter.get("/projects", async (req, res) => {
  return res.json(await getProjectsXp(getDb(), req.user!.id));
});

/** GET /api/gamification/rules — valores públicos das regras (para prévia na UI) */
gamificationRouter.get("/rules", (_req, res) => {
  return res.json(publicRules());
});

/** GET /api/gamification/settings — XP/moedas por dificuldade do próprio usuário */
gamificationRouter.get("/settings", async (req, res) => {
  const db = getDb();
  const [difficulty, priority] = await Promise.all([getDifficultyRewards(db, req.user!.id), getPriorityRewards(db, req.user!.id)]);
  return res.json({ difficulty, priority });
});

/**
 * PUT /api/gamification/settings — o usuário ajusta as SUAS recompensas por
 * dificuldade. Valores são limitados no serviço e valem só para o futuro
 * (XP já concedido nunca muda).
 */
gamificationRouter.put("/settings", async (req, res) => {
  // Aceita só as partes enviadas (dificuldade e/ou prioridade); limites finos no serviço.
  const body = (req.body ?? {}) as { difficulty?: unknown; priority?: unknown };
  const db = getDb();
  if (body.difficulty === undefined && body.priority === undefined) return res.status(400).json({ error: "Nada para salvar." });
  if (body.difficulty !== undefined) {
    const parsed = difficultySettingsSchema.safeParse(body.difficulty);
    if (!parsed.success) return res.status(400).json({ error: "Valores de recompensa inválidos." });
    await saveDifficultyRewards(db, req.user!.id, parsed.data);
  }
  if (body.priority !== undefined) {
    const parsed = prioritySettingsSchema.safeParse(body.priority);
    if (!parsed.success) return res.status(400).json({ error: "Valores por prioridade inválidos." });
    await savePriorityRewards(db, req.user!.id, parsed.data);
  }
  const [difficulty, priority] = await Promise.all([getDifficultyRewards(db, req.user!.id), getPriorityRewards(db, req.user!.id)]);
  return res.json({ difficulty, priority });
});

/** GET /api/gamification/wallet — ganho e gasto reais (loja) */
gamificationRouter.get("/wallet", async (req, res) => {
  return res.json(await getWalletSummary(getDb(), req.user!.id));
});

/** POST /api/gamification/rewards/starter — adiciona o pacote inicial (sem duplicar por nome) */
gamificationRouter.post("/rewards/starter", async (req, res) => {
  return res.status(201).json(await addStarterRewards(getDb(), req.user!.id));
});

const aiLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 20 });
const suggestSchema = z.object({ wish: z.string().trim().max(600).optional() });

/** POST /api/gamification/rewards/ai/suggest — o Gemini propõe recompensas (nada é salvo) */
gamificationRouter.post("/rewards/ai/suggest", aiLimit, async (req, res) => {
  const parsed = suggestSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Dados inválidos." });
  const result = await suggestRewards(getDb(), req.user!.id, parsed.data.wish);
  if (!result.ok) return res.status(422).json({ error: result.message });
  return res.json(result.data);
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
