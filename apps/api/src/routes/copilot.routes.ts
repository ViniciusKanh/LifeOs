import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { generateDashboardInsight, generateHealthInsight } from "../services/copilotService.js";

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

/**
 * POST /api/copilot/health-insight — mesma ideia, mas com um contexto
 * bem mais estreito (só água, sono, exercício e humor dos últimos 7
 * dias) para o Gemini analisar essas métricas com mais precisão do
 * que no insight geral do Dashboard.
 */
copilotRouter.post("/health-insight", rateLimit({ windowMs: 10 * 60 * 1000, max: 10 }), async (req, res) => {
  const result = await generateHealthInsight(req.user!.id);
  if (!result.ok) {
    return res.status(400).json({ error: result.message });
  }
  return res.json({ text: result.text });
});
