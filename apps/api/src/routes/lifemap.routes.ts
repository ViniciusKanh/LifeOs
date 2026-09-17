import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import {
  getLifeMap,
  createLifeMapLink,
  deleteLifeMapLink,
  LifeMapError,
  LINKABLE_TYPES,
  RELATIONSHIP_TYPES,
} from "../services/lifeMapService.js";

export const lifemapRouter = Router();
lifemapRouter.use(requireAuth);

/**
 * GET /api/lifemap — grafo de conexões entre áreas da vida do usuário
 * (metas, projetos, hábitos, educação, leitura, saúde, profissional),
 * calculado a partir de relações reais no banco. Sem parâmetros:
 * sempre reflete o estado atual, nunca um snapshot cacheado.
 */
lifemapRouter.get("/", async (req, res) => {
  const data = await getLifeMap(req.user!.id);
  return res.json(data);
});

const createLinkSchema = z.object({
  sourceType: z.enum(LINKABLE_TYPES),
  sourceId: z.string().trim().min(1),
  targetType: z.enum(LINKABLE_TYPES),
  targetId: z.string().trim().min(1),
  relationshipType: z.enum(RELATIONSHIP_TYPES).default("supports"),
});

/**
 * POST /api/lifemap/links — cria um vínculo manual entre duas
 * entidades do usuário autenticado (ex.: hábito → meta). Nunca
 * substitui uma relação estrutural (chave estrangeira) já existente
 * — essas continuam sendo alteradas na entidade de origem.
 */
lifemapRouter.post("/links", async (req, res) => {
  const parsed = createLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos para criar o vínculo." });
  }

  try {
    const link = await createLifeMapLink(req.user!.id, parsed.data);
    return res.status(201).json(link);
  } catch (err) {
    if (err instanceof LifeMapError) {
      return res.status(err.status).json({ error: err.message });
    }
    throw err;
  }
});

/**
 * DELETE /api/lifemap/links/:id — remove um vínculo manual criado
 * pelo próprio usuário no Life Map. Só afeta linhas de
 * life_map_links; relações estruturais (ex.: task.project_id) não
 * podem ser removidas por aqui.
 */
lifemapRouter.delete("/links/:id", async (req, res) => {
  const removed = await deleteLifeMapLink(req.user!.id, req.params.id);
  if (!removed) {
    return res.status(404).json({ error: "Vínculo não encontrado." });
  }
  return res.status(204).send();
});
