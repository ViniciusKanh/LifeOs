import { Router, type Response } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { CodexError, buyKnowledge, getAttributeDetail, getCodex, getMilestones, getTitles, markSeen } from "../services/codexService.js";

/** Códex da Jornada — leitura e desbloqueios cosméticos, sempre do próprio usuário. */
export const codexRouter = Router();
codexRouter.use(requireAuth);

function fail(res: Response, err: unknown) {
  if (err instanceof CodexError) return res.status(err.status).json({ error: err.message });
  console.error("[códex] erro:", err instanceof Error ? err.message : "desconhecido");
  return res.status(500).json({ error: "Não foi possível carregar o Códex." });
}

codexRouter.get("/", async (req, res) => {
  try {
    return res.json(await getCodex(getDb(), req.user!.id));
  } catch (err) {
    return fail(res, err);
  }
});

codexRouter.get("/titles", async (req, res) => {
  try {
    return res.json(await getTitles(getDb(), req.user!.id));
  } catch (err) {
    return fail(res, err);
  }
});

codexRouter.get("/milestones", async (req, res) => {
  try {
    return res.json(await getMilestones(getDb(), req.user!.id));
  } catch (err) {
    return fail(res, err);
  }
});

codexRouter.get("/attributes/:key", async (req, res) => {
  try {
    return res.json(await getAttributeDetail(getDb(), req.user!.id, req.params.key));
  } catch (err) {
    return fail(res, err);
  }
});

const seenSchema = z.object({ kind: z.enum(["relic", "title", "knowledge", "discovery"]), ids: z.array(z.string().min(1).max(64)).min(1).max(50) });
codexRouter.post("/seen", async (req, res) => {
  const parsed = seenSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados inválidos." });
  await markSeen(getDb(), req.user!.id, parsed.data.kind, parsed.data.ids);
  return res.status(204).send();
});

/** POST /api/codex/knowledge/:id/unlock — compra opcional com MOEDAS (XP nunca é gasto). */
codexRouter.post("/knowledge/:id/unlock", async (req, res) => {
  try {
    return res.json(await buyKnowledge(getDb(), req.user!.id, req.params.id));
  } catch (err) {
    return fail(res, err);
  }
});
