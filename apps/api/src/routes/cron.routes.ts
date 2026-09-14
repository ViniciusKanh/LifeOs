import { Router } from "express";
import { mondayOf, sendWeeklySummariesToAllOptedIn } from "../services/weeklyEmailService.js";

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
