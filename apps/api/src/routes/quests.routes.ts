import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { QuestError, claimQuest, getQuestBoard, rerollQuest } from "../services/questsService.js";

/**
 * Quadro de Quests + Temporada do mês. Toda leitura/escrita é do usuário
 * autenticado; o progresso vem sempre das fontes originais.
 */
export const questsRouter = Router();
questsRouter.use(requireAuth);

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Quest inválida.");

function handle(err: unknown, res: import("express").Response) {
  if (err instanceof QuestError) return res.status(err.status).json({ error: err.message });
  console.error("[quests] erro:", err instanceof Error ? err.message : "desconhecido");
  return res.status(500).json({ error: "Não foi possível processar o Quadro de Quests." });
}

/** GET /api/quests — {daily, weekly, season} com progresso ao vivo. */
questsRouter.get("/", async (req, res) => {
  try {
    return res.json(await getQuestBoard(getDb(), req.user!.id));
  } catch (err) {
    return handle(err, res);
  }
});

/** POST /api/quests/:id/claim — resgata o XP de uma quest concluída (idempotente). */
questsRouter.post("/:id/claim", async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: "Quest inválida." });
  try {
    return res.json(await claimQuest(getDb(), req.user!.id, id.data));
  } catch (err) {
    return handle(err, res);
  }
});

/** POST /api/quests/:id/reroll — troca uma quest diária não concluída (1 por dia). */
questsRouter.post("/:id/reroll", async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: "Quest inválida." });
  try {
    return res.json({ quest: await rerollQuest(getDb(), req.user!.id, id.data) });
  } catch (err) {
    return handle(err, res);
  }
});
