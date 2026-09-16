import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { lifeOsEmailShell, sendMail } from "./emailService.js";
import { changePct, computeLifeScore, computeRangeMetrics } from "./metricsService.js";

/**
 * Resumo semanal por e-mail — reaproveita as mesmas métricas do Weekly
 * Review (computeRangeMetrics/computeLifeScore, ver reviews.routes.ts)
 * e manda por e-mail via a infraestrutura de SMTP já existente
 * (emailService.ts). Opt-in por usuário (user_settings.weekly_email_enabled,
 * desligado por padrão) e com log de envio (weekly_email_log) pra nunca
 * duplicar o mesmo resumo pro mesmo usuário/semana.
 */

type Db = ReturnType<typeof getDb>;

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Segunda-feira da semana que contém `date` (formato YYYY-MM-DD). */
export function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay(); // 0 = domingo
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(date, diff);
}

function fmtDateBR(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

function fmtChange(pct: number | null) {
  if (pct === null) return "";
  const sign = pct > 0 ? "+" : "";
  const color = pct > 0 ? "#3FAE6A" : pct < 0 ? "#E0554F" : "#6B7280";
  return `<span style="color:${color};font-size:12px;"> (${sign}${pct}% vs. semana anterior)</span>`;
}

function row(label: string, value: string, change = "") {
  return `
    <tr>
      <td style="padding:6px 0;color:#374151;font-size:13px;">${label}</td>
      <td style="padding:6px 0;text-align:right;font-weight:600;font-size:13px;">${value}${change}</td>
    </tr>`;
}

export function weeklySummaryEmail(input: {
  weekStartDate: string;
  weekEndDate: string; // inclusive, só pra exibição
  metrics: Awaited<ReturnType<typeof computeRangeMetrics>>;
  lifeScore: Awaited<ReturnType<typeof computeLifeScore>>;
  changePctByMetric: {
    tasksCompleted: number | null;
    studyMinutes: number | null;
    pagesRead: number | null;
    focusMinutes: number | null;
    productivity: number;
    health: number;
  };
}) {
  const { weekStartDate, weekEndDate, metrics, lifeScore, changePctByMetric } = input;
  const periodLabel = `${fmtDateBR(weekStartDate)} a ${fmtDateBR(weekEndDate)}`;

  return {
    subject: `Seu resumo semanal — ${periodLabel}`,
    html: lifeOsEmailShell({
      preheader: `Seu Life Score da semana foi ${lifeScore.overall}/100.`,
      eyebrow: periodLabel,
      title: "Resumo da sua semana",
      bodyHtml: `
        <div style="background:linear-gradient(135deg,#F8F6FF,#FFF2E9);border:1px solid #EEE6DA;border-radius:18px;padding:18px;margin:4px 0 18px;">
          <p style="margin:0;color:#6B7280;font-size:12px;font-weight:700;">Life Score</p>
          <p style="margin:4px 0 0;font-size:34px;font-weight:800;color:#1E2537;letter-spacing:-.04em;">${lifeScore.overall}<span style="font-size:15px;color:#6B7280;font-weight:600;"> / 100</span></p>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          ${row("Tarefas concluídas", `${metrics.tasksCompleted}`, fmtChange(changePctByMetric.tasksCompleted))}
          ${row("Minutos de estudo", `${metrics.studyMinutes}min`, fmtChange(changePctByMetric.studyMinutes))}
          ${row("Páginas lidas", `${metrics.pagesRead}`, fmtChange(changePctByMetric.pagesRead))}
          ${row("Minutos de foco", `${metrics.focusMinutes}min`, fmtChange(changePctByMetric.focusMinutes))}
          ${row("Hábitos concluídos", `${metrics.habitsDoneCount}/${metrics.habitsPossibleCount}`)}
          ${row("Produtividade", `${lifeScore.productivity}%`)}
          ${row("Saúde", `${lifeScore.health}%`)}
        </table>
        <p style="color:#6B7280;font-size:12px;margin:20px 0 0;">
          Continue registrando seus dados para esse resumo ficar cada vez mais preciso.
        </p>`,
      ctaLabel: "Abrir Weekly Review",
      ctaUrl: process.env.WEB_ORIGIN ? `${process.env.WEB_ORIGIN.replace(/\/$/, "")}/weekly-review` : undefined,
    }),
  };
}

/** Envia (ou não, se desativado) o resumo semanal pra um usuário específico. Usado tanto pelo botão manual quanto pelo cron. */
export async function sendWeeklySummaryForUser(
  db: Db,
  ownerId: string,
  weekStartDate: string,
  options: { skipDedup?: boolean; requirePreference?: boolean } = {}
): Promise<{ sent: boolean; reason?: string }> {
  const settingsResult = await db.execute({
    sql: "SELECT weekly_email_enabled FROM user_settings WHERE user_id = ?",
    args: [ownerId],
  });
  const enabled = Number(settingsResult.rows[0]?.weekly_email_enabled ?? 0) === 1;
  if (options.requirePreference && !enabled) {
    return { sent: false, reason: "Resumo semanal por e-mail está desativado." };
  }

  const userResult = await db.execute({
    sql: "SELECT email, email_verified FROM users WHERE id = ?",
    args: [ownerId],
  });
  const user = userResult.rows[0] as { email?: string; email_verified?: number } | undefined;
  if (!user?.email || Number(user.email_verified) !== 1) {
    return { sent: false, reason: "E-mail não confirmado." };
  }

  if (!options.skipDedup) {
    const already = await db.execute({
      sql: "SELECT id FROM weekly_email_log WHERE owner_id = ? AND week_start_date = ?",
      args: [ownerId, weekStartDate],
    });
    if (already.rows.length > 0) {
      return { sent: false, reason: "Já enviado para essa semana." };
    }
  }

  const weekEndExclusive = addDays(weekStartDate, 7);
  const weekEndDate = addDays(weekEndExclusive, -1);
  const prevWeekStartDate = addDays(weekStartDate, -7);

  const [metrics, lifeScore, prevMetrics, prevLifeScore] = await Promise.all([
    computeRangeMetrics(ownerId, weekStartDate, weekEndExclusive),
    computeLifeScore(ownerId, weekEndDate),
    computeRangeMetrics(ownerId, prevWeekStartDate, weekStartDate),
    computeLifeScore(ownerId, addDays(weekStartDate, -1)),
  ]);

  const { subject, html } = weeklySummaryEmail({
    weekStartDate,
    weekEndDate,
    metrics,
    lifeScore,
    changePctByMetric: {
      tasksCompleted: changePct(metrics.tasksCompleted, prevMetrics.tasksCompleted),
      studyMinutes: changePct(metrics.studyMinutes, prevMetrics.studyMinutes),
      pagesRead: changePct(metrics.pagesRead, prevMetrics.pagesRead),
      focusMinutes: changePct(metrics.focusMinutes, prevMetrics.focusMinutes),
      productivity: lifeScore.productivity - prevLifeScore.productivity,
      health: lifeScore.health - prevLifeScore.health,
    },
  });

  const delivered = await sendMail({ to: user.email, subject, html });
  if (!delivered) {
    return { sent: false, reason: "SMTP não configurado." };
  }

  await db.execute({
    sql: `INSERT INTO weekly_email_log (id, owner_id, week_start_date) VALUES (?, ?, ?)
          ON CONFLICT (owner_id, week_start_date) DO UPDATE SET sent_at = datetime('now')`,
    args: [nanoid(), ownerId, weekStartDate],
  });

  return { sent: true };
}

/** Usado pelo endpoint de cron: envia o resumo da última semana completa pra todo usuário com a preferência ativada. */
export async function sendWeeklySummariesToAllOptedIn(weekStartDate: string) {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT u.id AS owner_id FROM users u
          JOIN user_settings s ON s.user_id = u.id
          WHERE s.weekly_email_enabled = 1 AND u.email_verified = 1`,
    args: [],
  });

  const owners = (result.rows as unknown as Array<{ owner_id: string }>).map((r) => r.owner_id);
  let sent = 0;
  let skipped = 0;
  for (const ownerId of owners) {
    const outcome = await sendWeeklySummaryForUser(db, ownerId, weekStartDate, { requirePreference: true });
    if (outcome.sent) sent++;
    else skipped++;
  }
  return { totalCandidates: owners.length, sent, skipped };
}
