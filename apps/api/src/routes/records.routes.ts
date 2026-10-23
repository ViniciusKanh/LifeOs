import { Router } from "express";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { getWeeklyRecords } from "../services/recordsService.js";

/** Recordes pessoais — o usuário só se compara consigo mesmo. */
export const recordsRouter = Router();
recordsRouter.use(requireAuth);

/** GET /api/records/weekly — esta semana × semana passada × melhor semana anterior. */
recordsRouter.get("/weekly", async (req, res) => {
  try {
    return res.json(await getWeeklyRecords(getDb(), req.user!.id));
  } catch (err) {
    console.error("[recordes] erro:", err instanceof Error ? err.message : "desconhecido");
    return res.status(500).json({ error: "Não foi possível calcular seus recordes." });
  }
});
