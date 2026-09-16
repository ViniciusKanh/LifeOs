import { Router } from "express";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { dailyReviewSchema, weeklyReviewSchema } from "../validators/reviews.schema.js";
import { changePct, computeLifeScore, computeRangeMetrics } from "../services/metricsService.js";
import { generateWeeklyReviewDraft } from "../services/copilotService.js";
import { mondayOf, sendWeeklySummaryForUser } from "../services/weeklyEmailService.js";
import { updateNotificationTrigger } from "../services/notificationTriggersService.js";

export const reviewsRouter = Router();
reviewsRouter.use(requireAuth);

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/* ---------------------------- Diária ---------------------------- */

/** GET /api/reviews/daily?date=YYYY-MM-DD */
reviewsRouter.get("/daily", async (req, res) => {
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM daily_reviews WHERE owner_id = ? AND review_date = ?",
    args: [req.user!.id, date],
  });
  return res.json(result.rows[0] ?? null);
});

/** PUT /api/reviews/daily — upsert */
reviewsRouter.put("/daily", async (req, res) => {
  const parsed = dailyReviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const d = parsed.data;
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO daily_reviews (id, owner_id, review_date, completion_pct, highlights, notes)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (owner_id, review_date) DO UPDATE SET
            completion_pct = excluded.completion_pct, highlights = excluded.highlights, notes = excluded.notes`,
    args: [nanoid(), req.user!.id, d.reviewDate, d.completionPct ?? null, d.highlights ?? null, d.notes ?? null],
  });
  const saved = await db.execute({
    sql: "SELECT * FROM daily_reviews WHERE owner_id = ? AND review_date = ?",
    args: [req.user!.id, d.reviewDate],
  });
  return res.json(saved.rows[0]);
});

/* --------------------------- Semanal --------------------------- */

/**
 * GET /api/reviews/weekly/compute?weekStartDate=YYYY-MM-DD — métricas reais
 * da semana, sem salvar nada ainda, incluindo a variação real contra a
 * semana anterior (nunca inventada: sem base na semana anterior, o campo
 * volta null e o front mostra "—").
 */
reviewsRouter.get("/weekly/compute", async (req, res) => {
  const weekStartDate = (req.query.weekStartDate as string) || new Date().toISOString().slice(0, 10);
  const weekEndExclusive = addDays(weekStartDate, 7);
  const prevWeekStartDate = addDays(weekStartDate, -7);

  const [metrics, lifeScore, prevMetrics, prevLifeScore] = await Promise.all([
    computeRangeMetrics(req.user!.id, weekStartDate, weekEndExclusive),
    computeLifeScore(req.user!.id, addDays(weekEndExclusive, -1)),
    computeRangeMetrics(req.user!.id, prevWeekStartDate, weekStartDate),
    computeLifeScore(req.user!.id, addDays(weekStartDate, -1)),
  ]);

  return res.json({
    ...metrics,
    lifeScore,
    changePct: {
      tasksCompleted: changePct(metrics.tasksCompleted, prevMetrics.tasksCompleted),
      studyMinutes: changePct(metrics.studyMinutes, prevMetrics.studyMinutes),
      pagesRead: changePct(metrics.pagesRead, prevMetrics.pagesRead),
      focusMinutes: changePct(metrics.focusMinutes, prevMetrics.focusMinutes),
      // Diferença em pontos percentuais (não variação relativa) — mesma
      // convenção usada em Analytics: evita um "+925%" absurdo quando a
      // semana anterior tinha uma base perto de zero.
      productivity: lifeScore.productivity - prevLifeScore.productivity,
      health: lifeScore.health - prevLifeScore.health,
      education: lifeScore.education - prevLifeScore.education,
      reading: lifeScore.reading - prevLifeScore.reading,
      habits: lifeScore.habits - prevLifeScore.habits,
    },
  });
});

/**
 * POST /api/reviews/weekly/draft?weekStartDate=YYYY-MM-DD — pede ao
 * LifeOS Copilot um rascunho das três reflexões, baseado só nas
 * métricas reais da semana (mesmas de /weekly/compute). O front nunca
 * salva isso sozinho: só preenche os campos para o usuário revisar.
 * Rate limit igual ao dos outros insights do Copilot (custo de API).
 */
reviewsRouter.post("/weekly/draft", rateLimit({ windowMs: 10 * 60 * 1000, max: 10 }), async (req, res) => {
  const weekStartDate = (req.query.weekStartDate as string) || new Date().toISOString().slice(0, 10);
  const result = await generateWeeklyReviewDraft(req.user!.id, weekStartDate);
  if (!result.ok) {
    return res.status(400).json({ error: result.message });
  }
  return res.json({ draft: result.draft });
});

/** GET /api/reviews/weekly?weekStartDate=YYYY-MM-DD */
reviewsRouter.get("/weekly", async (req, res) => {
  const weekStartDate = (req.query.weekStartDate as string) || new Date().toISOString().slice(0, 10);
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM weekly_reviews WHERE owner_id = ? AND week_start_date = ?",
    args: [req.user!.id, weekStartDate],
  });
  return res.json(result.rows[0] ?? null);
});

/** GET /api/reviews/weekly/history?limit=12 */
reviewsRouter.get("/weekly/history", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 12, 52);
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM weekly_reviews WHERE owner_id = ? ORDER BY week_start_date DESC LIMIT ?",
    args: [req.user!.id, limit],
  });
  return res.json(result.rows);
});

/** PUT /api/reviews/weekly — recalcula as métricas reais da semana e salva junto com a parte qualitativa */
reviewsRouter.put("/weekly", async (req, res) => {
  const parsed = weeklyReviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const d = parsed.data;
  const weekEndExclusive = addDays(d.weekStartDate, 7);
  const [metrics, lifeScore] = await Promise.all([
    computeRangeMetrics(req.user!.id, d.weekStartDate, weekEndExclusive),
    computeLifeScore(req.user!.id, addDays(weekEndExclusive, -1)),
  ]);

  const db = getDb();
  await db.execute({
    sql: `INSERT INTO weekly_reviews (
            id, owner_id, week_start_date, productivity_pct, health_pct, education_pct, reading_pct, habits_pct,
            tasks_completed, study_minutes, pages_read, focus_minutes,
            what_worked, what_didnt_work, what_to_improve, next_priorities
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (owner_id, week_start_date) DO UPDATE SET
            productivity_pct = excluded.productivity_pct, health_pct = excluded.health_pct,
            education_pct = excluded.education_pct, reading_pct = excluded.reading_pct, habits_pct = excluded.habits_pct,
            tasks_completed = excluded.tasks_completed, study_minutes = excluded.study_minutes,
            pages_read = excluded.pages_read, focus_minutes = excluded.focus_minutes,
            what_worked = excluded.what_worked, what_didnt_work = excluded.what_didnt_work,
            what_to_improve = excluded.what_to_improve, next_priorities = excluded.next_priorities`,
    args: [
      nanoid(),
      req.user!.id,
      d.weekStartDate,
      lifeScore.productivity,
      lifeScore.health,
      lifeScore.education,
      lifeScore.reading,
      lifeScore.habits,
      metrics.tasksCompleted,
      metrics.studyMinutes,
      metrics.pagesRead,
      metrics.focusMinutes,
      d.whatWorked ?? null,
      d.whatDidntWork ?? null,
      d.whatToImprove ?? null,
      d.nextPriorities ?? null,
    ],
  });

  const saved = await db.execute({
    sql: "SELECT * FROM weekly_reviews WHERE owner_id = ? AND week_start_date = ?",
    args: [req.user!.id, d.weekStartDate],
  });
  return res.json(saved.rows[0]);
});

/* ---------------------- Resumo semanal por e-mail ---------------------- */

/** GET /api/reviews/weekly/email-settings — preferência atual do usuário (desligada por padrão). */
reviewsRouter.get("/weekly/email-settings", async (req, res) => {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT weekly_email_enabled FROM user_settings WHERE user_id = ?",
    args: [req.user!.id],
  });
  const enabled = Number(result.rows[0]?.weekly_email_enabled ?? 0) === 1;
  return res.json({ enabled });
});

/** PATCH /api/reviews/weekly/email-settings — liga/desliga o recebimento do resumo semanal por e-mail. */
reviewsRouter.patch("/weekly/email-settings", async (req, res) => {
  const enabled = req.body?.enabled === true;
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO user_settings (user_id, weekly_email_enabled)
          VALUES (?, ?)
          ON CONFLICT (user_id) DO UPDATE SET weekly_email_enabled = excluded.weekly_email_enabled, updated_at = datetime('now')`,
    args: [req.user!.id, enabled ? 1 : 0],
  });
  await updateNotificationTrigger(req.user!.id, "weekly_summary", { active: enabled, channelEmail: enabled });
  return res.json({ enabled });
});

/**
 * POST /api/reviews/weekly/send-email — "me envie agora": manda o
 * resumo da última semana completa pro próprio e-mail do usuário,
 * na hora, independente da preferência acima e sem checar o log de
 * duplicidade (o log só existe pra evitar reenvio automático pelo
 * cron — um pedido explícito do usuário sempre é atendido).
 */
reviewsRouter.post("/weekly/send-email", rateLimit({ windowMs: 10 * 60 * 1000, max: 10 }), async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const thisMonday = mondayOf(today);
  const lastWeekStart = new Date(`${thisMonday}T00:00:00Z`);
  lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);
  const weekStartDate = lastWeekStart.toISOString().slice(0, 10);

  const db = getDb();
  const result = await sendWeeklySummaryForUser(db, req.user!.id, weekStartDate, { skipDedup: true });
  if (!result.sent) {
    return res.status(400).json({ error: result.reason ?? "Não foi possível enviar o e-mail." });
  }
  return res.json({ sent: true, weekStartDate });
});
