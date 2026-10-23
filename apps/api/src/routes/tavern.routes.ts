import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { TavernError, getTavernSummary, pinTomorrowMission } from "../services/tavernService.js";

/**
 * Taverna — ritual de fim de dia. O resumo só lê dados reais; a única
 * escrita (fixar a missão principal de amanhã) acontece depois que o
 * usuário confirma na interface.
 */
export const tavernRouter = Router();
tavernRouter.use(requireAuth);

const pinSchema = z.object({
  taskId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Tarefa inválida."),
  /** Mover o prazo da tarefa para amanhã — só com confirmação explícita. */
  setDueTomorrow: z.boolean().optional(),
});

/** GET /api/tavern/summary — balanço do dia, profecia de amanhã e primeira missão. */
tavernRouter.get("/summary", async (req, res) => {
  res.json(await getTavernSummary(getDb(), req.user!.id));
});

/** POST /api/tavern/pin-tomorrow — fixa a missão principal de amanhã no diário de amanhã. */
tavernRouter.post("/pin-tomorrow", async (req, res) => {
  const parsed = pinSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  try {
    return res.json(await pinTomorrowMission(getDb(), req.user!.id, parsed.data.taskId, { setDueTomorrow: parsed.data.setDueTomorrow }));
  } catch (e) {
    if (e instanceof TavernError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});
