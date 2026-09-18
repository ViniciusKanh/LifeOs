import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getDataHealth, recheckDataHealth } from "../services/dataHealthService.js";

export const dataHealthRouter = Router();
dataHealthRouter.use(requireAuth);

/**
 * GET /api/data-health — visão completa (score, dimensões, cobertura
 * por módulo, alertas, prontidão, integridade, distribuição,
 * recomendações, diagnóstico e histórico), sempre calculada a partir
 * dos dados reais do usuário autenticado. Um único endpoint agregado,
 * no mesmo padrão já usado por /api/lifemap e /api/goal-forecast.
 */
dataHealthRouter.get("/", async (req, res) => {
  const data = await getDataHealth(req.user!.id);
  return res.json(data);
});

/**
 * POST /api/data-health/recheck — força uma nova avaliação e salva
 * um snapshot do score do dia (no máximo um por dia). Nunca gera
 * dado artificial — só recalcula em cima do que já existe no banco.
 */
dataHealthRouter.post("/recheck", async (req, res) => {
  const data = await recheckDataHealth(req.user!.id);
  return res.json(data);
});
