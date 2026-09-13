import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { generateDashboardInsight, generateHealthInsight, generateEducationInsight, generateHabitsInsight, generateAnalyticsInsight } from "../services/copilotService.js";

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

/**
 * POST /api/copilot/education-insight — mesma ideia, focado em uma
 * única formação (disciplinas, prazos e horas de estudo x meta).
 * Body: { educationId }.
 */
copilotRouter.post("/education-insight", rateLimit({ windowMs: 10 * 60 * 1000, max: 10 }), async (req, res) => {
  const educationId = typeof req.body?.educationId === "string" ? req.body.educationId : null;
  if (!educationId) {
    return res.status(400).json({ error: "educationId é obrigatório." });
  }
  const result = await generateEducationInsight(req.user!.id, educationId);
  if (!result.ok) {
    return res.status(400).json({ error: result.message });
  }
  return res.json({ text: result.text });
});

/**
 * POST /api/copilot/habits-insight — mesma ideia, focado em sequências,
 * consistência de 30 dias, hábitos em risco de quebrar a sequência hoje
 * e horário de pico real dos check-ins.
 */
copilotRouter.post("/habits-insight", rateLimit({ windowMs: 10 * 60 * 1000, max: 10 }), async (req, res) => {
  const result = await generateHabitsInsight(req.user!.id);
  if (!result.ok) {
    return res.status(400).json({ error: result.message });
  }
  return res.json({ text: result.text });
});

/**
 * POST /api/copilot/analytics-insight — mesma ideia, com o período
 * selecionado em Analytics (7/30/90 dias): totais, variação e
 * correlações reais (sono x produtividade, humor x foco).
 * Body: { days? }.
 */
copilotRouter.post("/analytics-insight", rateLimit({ windowMs: 10 * 60 * 1000, max: 10 }), async (req, res) => {
  const days = Number(req.body?.days) || 30;
  const result = await generateAnalyticsInsight(req.user!.id, days);
  if (!result.ok) {
    return res.status(400).json({ error: result.message });
  }
  return res.json({ text: result.text });
});
