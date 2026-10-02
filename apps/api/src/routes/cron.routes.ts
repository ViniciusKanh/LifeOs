import { getDb } from "../db/client.js";
import { runLifeAdminRemindersForAll } from "../services/lifeAdminService.js";
import { Router } from "express";
import { mondayOf, sendWeeklySummariesToAllOptedIn } from "../services/weeklyEmailService.js";
import { runTaskDeadlineTriggersForAll, runJournalReminderTriggersForAll } from "../services/notificationTriggersService.js";

/**
 * Endpoints de cron — chamados por um agendador externo (Vercel Cron,
 * ver "crons" no vercel.json da raiz), nunca por um usuário logado:
 * não usam requireAuth, e sim um segredo compartilhado (CRON_SECRET)
 * no header Authorization, no mesmo formato que a Vercel já injeta
 * automaticamente em cron jobs (`Authorization: Bearer <CRON_SECRET>`).
 */
export const cronRouter = Router();

function isAuthorized(req: import("express").Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // sem segredo configurado, o endpoint fica sempre fechado
  const header = req.headers.authorization ?? "";
  return header === `Bearer ${secret}`;
}

/**
 * GET /api/cron/weekly-emails — dispara o resumo semanal por e-mail
 * pra todo usuário com a preferência ativada, referente à última
 * semana completa (segunda a domingo) antes de hoje. Pensado pra
 * rodar uma vez por semana (ex.: toda segunda de manhã).
 */
cronRouter.get("/weekly-emails", async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Não autorizado." });
  }
  const today = new Date().toISOString().slice(0, 10);
  const thisMonday = mondayOf(today);
  const lastWeekStart = new Date(`${thisMonday}T00:00:00Z`);
  lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);
  const weekStartDate = lastWeekStart.toISOString().slice(0, 10);

  const result = await sendWeeklySummariesToAllOptedIn(weekStartDate);
  return res.json({ weekStartDate, ...result });
});

cronRouter.get("/notification-triggers", async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Não autorizado." });
  }
  const result = await runTaskDeadlineTriggersForAll();
  // Administração da vida: lembretes de vencimento (antes / hoje / atrasado), no mesmo cron diário.
  const lifeAdmin = await runLifeAdminRemindersForAll(getDb());
  return res.json({ ...result, lifeAdmin });
});

/**
 * GET /api/cron/journal-reminder — lembrete inteligente de escrever no
 * diário (Fase 11, horário aprendido na Fase 15): pensado pra rodar a
 * cada hora (ver "crons" no vercel.json); só notifica quem ainda não
 * escreveu nada real no Diário hoje E cuja hora atual (UTC) bate com o
 * horário que o próprio usuário costuma escrever de verdade — aprendido
 * a partir do histórico real de journal_entries, com um horário padrão
 * de fim de dia pra quem ainda não tem histórico suficiente.
 */
cronRouter.get("/journal-reminder", async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Não autorizado." });
  }
  const result = await runJournalReminderTriggersForAll();
  return res.json(result);
});
