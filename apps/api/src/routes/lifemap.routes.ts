import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getLifeMap } from "../services/lifeMapService.js";

export const lifemapRouter = Router();
lifemapRouter.use(requireAuth);

/**
 * GET /api/lifemap — grafo de conexões entre áreas da vida do usuário
 * (metas, projetos, hábitos, educação, leitura, saúde), calculado a
 * partir de relações reais no banco. Sem parâmetros: sempre reflete o
 * estado atual, nunca um snapshot cacheado.
 */
lifemapRouter.get("/", async (req, res) => {
  const data = await getLifeMap(req.user!.id);
  return res.json(data);
});
