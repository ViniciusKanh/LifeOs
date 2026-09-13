import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { listAchievements, evaluateAchievements } from "../services/achievementsService.js";

export const achievementsRouter = Router();
achievementsRouter.use(requireAuth);

/** GET /api/achievements — catálogo completo com o progresso real do usuário em cada uma. */
achievementsRouter.get("/", async (req, res) => {
  const achievements = await listAchievements(req.user!.id);
  return res.json(achievements);
});

/**
 * POST /api/achievements/check — recalcula as métricas reais e
 * desbloqueia qualquer conquista já atingida. O frontend chama isso
 * depois de ações que podem destravar uma (concluir tarefa, marcar
 * hábito, terminar livro, fechar weekly review...) e mostra as que
 * vierem na resposta como "nova conquista".
 */
achievementsRouter.post("/check", async (req, res) => {
  const newlyUnlocked = await evaluateAchievements(req.user!.id);
  return res.json({ newlyUnlocked });
});
