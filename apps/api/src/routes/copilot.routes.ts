import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { generateDashboardInsight } from "../services/copilotService.js";

export const copilotRouter = Router();

copilotRouter.use(requireAuth);

/**
 * POST /api/copilot/insight — gera um insight do LifeOS Copilot com
 * base nos dados reais do próprio usuário logado. Limitado por IP+rota
 * (a chamada à API do Gemini tem custo/cota) — 10 gerações a cada 10
 * minutos é generoso para uso humano normal e barra abuso acidental.
 */
copilotRouter.post("/insight", rateLimit({ windowMs: 10 * 60 * 1000, max: 10 }), async (req, res) => {
  const result = await generateDashboardInsight(req.user!.id);
  if (!result.ok) {
    return res.status(400).json({ error: result.message });
  }
  return res.json({ text: result.text });
});
