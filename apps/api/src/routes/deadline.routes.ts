import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import {
  getAllDeadlineItems,
  filterByPeriod,
  computeSummary,
  computeOnTimeRate,
  computeAreaDistribution,
  computeTrend,
  getProjectRisks,
  type DeadlinePeriodFilter,
  type DeadlineItem,
} from "../services/deadlineRadarService.js";

export const deadlineRouter = Router();

deadlineRouter.use(requireAuth);

const querySchema = z.object({
  period: z.enum(["today", "7d", "30d", "all"]).catch("all"),
  today: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/** Ordenação padrão dos itens críticos: atrasados > vence hoje > menor prazo > prioridade > progresso. */
function sortCritical(items: DeadlineItem[]): DeadlineItem[] {
  const statusRank: Record<string, number> = { atrasado: 0, vence_hoje: 1, vence_7d: 2, vence_30d: 3, no_prazo: 4, concluido: 5 };
  const priorityRank: Record<string, number> = { Alta: 0, Média: 1, Baixa: 2 };
  return [...items].sort((a, b) => {
    if (statusRank[a.status] !== statusRank[b.status]) return statusRank[a.status] - statusRank[b.status];
    if (a.daysRemaining !== b.daysRemaining) return a.daysRemaining - b.daysRemaining;
    const pa = a.priority ? priorityRank[a.priority] : 3;
    const pb = b.priority ? priorityRank[b.priority] : 3;
    return pa - pb;
  });
}

/** GET /api/deadline-radar?period=&today= — dashboard completo. */
deadlineRouter.get("/", async (req, res) => {
  const parsed = querySchema.parse({ period: req.query.period, today: req.query.today });
  const db = getDb();
  const ownerId = req.user!.id;

  const [items, onTimeRate, risks] = await Promise.all([
    getAllDeadlineItems(db, ownerId, parsed.today),
    computeOnTimeRate(db, ownerId),
    getProjectRisks(db, ownerId, parsed.today),
  ]);

  const filtered = filterByPeriod(items, parsed.period as DeadlinePeriodFilter);
  const summary = computeSummary(items, onTimeRate);
  const areas = computeAreaDistribution(items);
  const trend = computeTrend(items, parsed.today);
  const critical = sortCritical(filtered).slice(0, 8);
  const upcomingMilestones = [...items]
    .filter((i) => !i.done && i.daysRemaining >= 0)
    .sort((a, b) => a.daysRemaining - b.daysRemaining)
    .slice(0, 5);

  const suggestions: string[] = [];
  const dueThisWeek = summary.dueToday + summary.due7d;
  if (dueThisWeek > 0) suggestions.push(`Você tem ${dueThisWeek} item${dueThisWeek > 1 ? "s" : ""} vencendo nos próximos 7 dias.`);
  const highRisk = risks.filter((r) => r.risk === "high" || r.risk === "critical");
  if (highRisk.length > 0) {
    suggestions.push(`Seu ritmo de conclusão está abaixo do necessário para ${highRisk[0].projectName}.`);
  }
  if (summary.overdue > 0) suggestions.push(`Você possui ${summary.overdue} item${summary.overdue > 1 ? "s" : ""} atrasado${summary.overdue > 1 ? "s" : ""} — priorize antes de assumir novos compromissos.`);

  const insights: string[] = [];
  if (onTimeRate && onTimeRate.completedWithDeadline >= 5) {
    insights.push(`Nos seus dados, ${onTimeRate.pct}% das tarefas com prazo foram concluídas no prazo (${onTimeRate.completedOnTime} de ${onTimeRate.completedWithDeadline}).`);
  }
  const busiestMonth = [...trend].sort((a, b) => b.count - a.count)[0];
  if (busiestMonth && busiestMonth.count >= 3) {
    insights.push(`Nos seus dados, ${busiestMonth.label} concentra a maior quantidade de prazos (${busiestMonth.count}).`);
  }

  res.json({
    summary,
    items: filtered,
    critical,
    areas,
    upcomingMilestones,
    statusBars: { atrasados: summary.overdue, vence7d: summary.due7d, em8a30: summary.due8to30, noPrazo: summary.onTrack },
    risks: risks.slice(0, 6),
    trend,
    suggestions,
    insights,
  });
});
