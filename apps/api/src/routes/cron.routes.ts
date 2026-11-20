import { getDb } from "../db/client.js";
import { runDueAutomationsForAll } from "../services/automationRunner.js";
import { Router } from "express";

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
// Resumo semanal por e-mail removido (só há e-mail de cadastro e de senha).
cronRouter.get("/weekly-emails", (req, res) => {
  if (!isAuthorized(req)) return res.status(401).json({ error: "Não autorizado." });
  return res.json({ disabled: true });
});

cronRouter.get("/notification-triggers", async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Não autorizado." });
  }
  // Notificações (prazos, administração da vida, banco) foram removidas: o cron diário
  // só roda as automações agendadas que gravam dados (Grimório, Metas…), idempotentes.
  // Automações do Grimório e de Metas agendadas (diárias/semanais), idempotentes por dia/semana.
  const automations = await runDueAutomationsForAll(getDb()).catch((err) => {
    console.error("[cron] automações falharam:", err);
    return { ran: 0, skipped: 0, errors: 1 };
  });
  return res.json({ automations });
});

// Lembrete do Diário removido junto com as notificações.
cronRouter.get("/journal-reminder", (req, res) => {
  if (!isAuthorized(req)) return res.status(401).json({ error: "Não autorizado." });
  return res.json({ disabled: true });
});
