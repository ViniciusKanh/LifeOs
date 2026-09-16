import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  listAchievements,
  evaluateAchievements,
  listCustomAchievements,
  createCustomAchievement,
  removeCustomAchievement,
  evaluateCustomAchievements,
  CUSTOM_ACHIEVEMENT_METRICS,
  type CustomAchievementMetric,
} from "../services/achievementsService.js";
import { createCustomAchievementSchema } from "../validators/custom-achievement.schema.js";
import { dispatchTriggerNotification } from "../services/notificationTriggersService.js";

export const achievementsRouter = Router();
achievementsRouter.use(requireAuth);

/** GET /api/achievements — catálogo completo com o progresso real do usuário em cada uma. */
achievementsRouter.get("/", async (req, res) => {
  const achievements = await listAchievements(req.user!.id);
  return res.json(achievements);
});

/** GET /api/achievements/custom/metrics — lista fixa de métricas disponíveis para criar um troféu. */
achievementsRouter.get("/custom/metrics", async (_req, res) => {
  return res.json(CUSTOM_ACHIEVEMENT_METRICS);
});

/** GET /api/achievements/custom — troféus que o próprio usuário cadastrou, com progresso real. */
achievementsRouter.get("/custom", async (req, res) => {
  const custom = await listCustomAchievements(req.user!.id);
  return res.json(custom);
});

/** POST /api/achievements/custom — cria um troféu customizado (o "desafio" no estilo PlayStation/Xbox). */
achievementsRouter.post("/custom", async (req, res) => {
  const parsed = createCustomAchievementSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const created = await createCustomAchievement(req.user!.id, {
    ...parsed.data,
    metric: parsed.data.metric as CustomAchievementMetric,
  });
  if (created.unlockedAt) {
    dispatchTriggerNotification(req.user!.id, "achievement_unlocked", {
      title: "Conquista desbloqueada!",
      body: created.title,
      url: "/conquistas",
      sourceId: `achievement_${created.id}`,
      ctaLabel: "Ver conquista",
    }).catch((err) => console.error("[trigger] falha ao notificar conquista customizada:", err));
  }
  return res.status(201).json(created);
});

/** DELETE /api/achievements/custom/:id */
achievementsRouter.delete("/custom/:id", async (req, res) => {
  const removed = await removeCustomAchievement(req.user!.id, req.params.id);
  if (!removed) return res.status(404).json({ error: "Troféu não encontrado." });
  return res.status(204).send();
});

/**
 * POST /api/achievements/check — recalcula as métricas reais e
 * desbloqueia qualquer conquista já atingida. O frontend chama isso
 * depois de ações que podem destravar uma (concluir tarefa, marcar
 * hábito, terminar livro, fechar weekly review...) e mostra as que
 * vierem na resposta como "nova conquista".
 */
achievementsRouter.post("/check", async (req, res) => {
  const [newlyUnlockedCatalog, newlyUnlockedCustom] = await Promise.all([
    evaluateAchievements(req.user!.id),
    evaluateCustomAchievements(req.user!.id),
  ]);
  const newlyUnlocked = [...newlyUnlockedCatalog, ...newlyUnlockedCustom];

  // Gatilhos são "melhor esforço": nunca devem atrasar nem quebrar a resposta
  // do /check (o desbloqueio em si já foi gravado no banco acima).
  for (const achievement of newlyUnlocked) {
    dispatchTriggerNotification(req.user!.id, "achievement_unlocked", {
      title: "Conquista desbloqueada!",
      body: achievement.title,
      url: "/conquistas",
      sourceId: `achievement_${achievement.id}`,
      ctaLabel: "Ver conquista",
    }).catch((err) => console.error("[trigger] falha ao notificar conquista:", err));
  }

  return res.json({ newlyUnlocked });
});
