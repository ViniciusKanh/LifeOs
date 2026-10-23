import { Router } from "express";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { getRhythm, RHYTHM_DEFAULT_DAYS } from "../services/rhythmService.js";

/** Ritmo do herói — mapa de calor hora × dia da semana a partir de registros reais. */
export const rhythmRouter = Router();
rhythmRouter.use(requireAuth);

/** GET /api/rhythm?days=60..90 */
rhythmRouter.get("/", async (req, res) => {
  const raw = Number(req.query.days);
  const days = Number.isFinite(raw) && raw > 0 ? raw : RHYTHM_DEFAULT_DAYS;
  try {
    return res.json(await getRhythm(getDb(), req.user!.id, days));
  } catch (err) {
    console.error("[ritmo] erro:", err instanceof Error ? err.message : "desconhecido");
    return res.status(500).json({ error: "Não foi possível calcular seu ritmo." });
  }
});
