import { Router } from "express";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { getProfessionalOverview } from "../services/professionalService.js";
import { resolveClientToday } from "../services/workloadService.js";

export const professionalRouter = Router();
professionalRouter.use(requireAuth);

/** GET /api/professional/overview?today=YYYY-MM-DD — visão cruzada da área Profissional. */
professionalRouter.get("/overview", async (req, res) => {
  const today = resolveClientToday(req.query.today);
  return res.json(await getProfessionalOverview(getDb(), req.user!.id, today));
});
