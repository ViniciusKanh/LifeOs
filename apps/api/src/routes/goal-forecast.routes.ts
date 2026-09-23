import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import {
  computeGoalForecast,
  classifyGoalForecastStatus,
  computeRequiredPace,
  computeExpectedProgressPct,
  GOAL_FORECAST_STATUS_LABEL,
  type GoalForecastStatus,
} from "../services/goalForecastService.js";
import { computeGoalRiskScore, classifyGoalRisk } from "../services/goalRiskService.js";

export const goalForecastRouter = Router();
goalForecastRouter.use(requireAuth);

type Db = ReturnType<typeof getDb>;

const AREAS = ["Educação", "Saúde", "Profissional", "Pessoal", "Financeira", "Outros"] as const;
type Area = (typeof AREAS)[number];

/** Categoria é texto livre no schema de metas — heurística por palavra-chave para agrupar em área. */
function mapCategoryToArea(category: string | null): Area {
  const c = (category ?? "").toLowerCase();
  if (/educa|estud|curso|faculdade|mestrado|doutorado|disciplina/.test(c)) return "Educação";
  if (/saúde|saude|exerc|treino|sono|água|agua|corpo|nutri/.test(c)) return "Saúde";
  if (/profiss|trabalho|carreira|lifeos|projeto/.test(c)) return "Profissional";
  if (/financ|dinheiro|reserva|investim/.test(c)) return "Financeira";
  if (/pessoal|viagem|hobby|lazer/.test(c)) return "Pessoal";
  return "Outros";
}

function resolveToday(todayParam?: string): string {
  if (todayParam && /^\d{4}-\d{2}-\d{2}$/.test(todayParam)) return todayParam;
  return new Date().toISOString().slice(0, 10);
}

const querySchema = z.object({
  period: z.enum(["all", "this_year", "next_year", "custom"]).catch("all"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

interface GoalRow {
  id: string;
  title: string;
  category: string | null;
  kind: "numeric" | "percentage" | "binary" | "task_based";
  target_value: number | null;
  current_value: number;
  unit: string | null;
  due_date: string | null;
  status: "active" | "done" | "abandoned";
  created_at: string;
}

async function getProgressHistory(db: Db, goalId: string) {
  const result = await db.execute({
    sql: "SELECT value, recorded_at FROM goal_progress WHERE goal_id = ? ORDER BY recorded_at ASC",
    args: [goalId],
  });
  return (result.rows as unknown as Array<{ value: number; recorded_at: string }>).map((r) => ({ value: r.value, recordedAt: r.recorded_at }));
}

function inPeriod(dueDate: string | null, period: string, from?: string, to?: string, today?: string): boolean {
  if (period === "all") return true;
  if (!dueDate) return false;
  const year = (today ?? new Date().toISOString().slice(0, 10)).slice(0, 4);
  if (period === "this_year") return dueDate.slice(0, 4) === year;
  if (period === "next_year") return dueDate.slice(0, 4) === String(Number(year) + 1);
  if (period === "custom") return (!from || dueDate >= from) && (!to || dueDate <= to);
  return true;
}

/** GET /api/goal-forecast?period=&from=&to=&today= — dashboard preditivo do módulo Metas. */
goalForecastRouter.get("/", async (req, res) => {
  const parsed = querySchema.parse({ period: req.query.period, from: req.query.from, to: req.query.to, today: req.query.today });
  const today = resolveToday(parsed.today);
  const db = getDb();
  const ownerId = req.user!.id;

  const result = await db.execute({
    sql: `SELECT id, title, category, kind, target_value, current_value, unit, due_date, status, created_at
          FROM goals WHERE owner_id = ? AND status != 'abandoned'`,
    args: [ownerId],
  });
  const allGoals = result.rows as unknown as GoalRow[];
  const filteredGoals = allGoals.filter((g) => g.status !== "active" || inPeriod(g.due_date, parsed.period, parsed.from, parsed.to, today));
  const activeGoals = filteredGoals.filter((g) => g.status === "active");

  const taskLinkResult = await db.execute({
    sql: `SELECT goal_id, COUNT(*) AS total, SUM(CASE WHEN status = 'Concluído' THEN 1 ELSE 0 END) AS done, GROUP_CONCAT(DISTINCT project_id) AS project_ids
          FROM tasks WHERE owner_id = ? AND goal_id IS NOT NULL GROUP BY goal_id`,
    args: [ownerId],
  });
  const taskLinks = new Map(
    (taskLinkResult.rows as unknown as Array<{ goal_id: string; total: number; done: number; project_ids: string | null }>).map((r) => [
      r.goal_id,
      { total: r.total, done: r.done, projectIds: r.project_ids ? r.project_ids.split(",") : [] },
    ])
  );

  // Regra corrigida: metas concluídas (status "done") sempre entram no dashboard — antes ficavam de fora
  // (só activeGoals era iterado), então o filtro de período que já preservava "done" incondicionalmente
  // não tinha efeito nenhum e "Concluída" nunca aparecia em lugar nenhum do Goal Forecast.
  const items = await Promise.all(
    filteredGoals.map(async (g) => {
      const progress = await getProgressHistory(db, g.id);
      const goalInput = { kind: g.kind, status: g.status, targetValue: g.target_value, currentValue: g.current_value, dueDate: g.due_date };
      const { forecast, reason } = computeGoalForecast(goalInput, progress);
      const status = classifyGoalForecastStatus(goalInput, forecast, today);
      const requiredPace = status === "completed" ? null : computeRequiredPace(goalInput, today);
      const expectedProgressPct = status !== "completed" && g.due_date ? computeExpectedProgressPct(g.created_at, g.due_date, today) : null;
      const linkedTasks = taskLinks.get(g.id);
      // "task_based" com tarefas vinculadas: progresso vem da conclusão real delas, não do current_value manual.
      const taskBasedPct = g.kind === "task_based" && linkedTasks && linkedTasks.total > 0 ? Math.round((linkedTasks.done / linkedTasks.total) * 100) : null;
      const rawProgressPct =
        g.kind === "numeric"
          ? g.target_value
            ? Math.min(100, Math.round((g.current_value / g.target_value) * 100))
            : null
          : g.kind === "binary"
            ? null
            : taskBasedPct ?? Math.round(g.current_value);
      // Meta concluída sempre mostra 100%, mesmo que o valor registrado não tenha alcançado o alvo exato (mesma convenção do Deadline Radar).
      const progressPct = status === "completed" ? 100 : rawProgressPct;
      const progressDeficitPct = expectedProgressPct != null && progressPct != null ? Math.max(0, expectedProgressPct - progressPct) : null;

      const riskScore = computeGoalRiskScore({
        scheduleDeltaDays: forecast?.aheadOrBehindDays ?? null,
        currentPace: forecast?.ratePerDay ?? null,
        requiredPace,
        progressDeficitPct,
        overdue: status === "overdue",
      });

      return {
        id: g.id,
        title: g.title,
        category: g.category,
        area: mapCategoryToArea(g.category),
        kind: g.kind,
        unit: g.unit,
        currentValue: g.current_value,
        targetValue: g.target_value,
        progressPct,
        dueDate: g.due_date,
        createdAt: g.created_at.slice(0, 10),
        forecastDate: forecast?.date ?? null,
        forecastReason: reason,
        currentPace: forecast?.ratePerDay ?? null,
        requiredPace,
        status,
        statusLabel: GOAL_FORECAST_STATUS_LABEL[status as GoalForecastStatus],
        risk: status === "attention" || status === "at_risk" || status === "overdue" ? classifyGoalRisk(riskScore) : null,
        linkedTasks: taskLinks.get(g.id) ?? null,
      };
    })
  );

  // KPIs — nada hardcoded, tudo derivado dos itens já calculados.
  const withProgress = items.filter((i) => i.progressPct != null);
  const avgProgress = withProgress.length > 0 ? Math.round(withProgress.reduce((s, i) => s + (i.progressPct ?? 0), 0) / withProgress.length) : null;
  const in3Months = new Date(`${today}T00:00:00Z`);
  in3Months.setUTCMonth(in3Months.getUTCMonth() + 3);
  const in3MonthsStr = in3Months.toISOString().slice(0, 10);
  const projectedCompletions3Months = items.filter((i) => i.forecastDate && i.forecastDate <= in3MonthsStr).length;

  // Ritmo de evolução — compara delta de progresso real (goal_progress) dos últimos 30 dias vs os 30 dias anteriores.
  const paceMultiplier = await computePaceMultiplier(db, ownerId, activeGoals, today);

  const areaBuckets = new Map<Area, { count: number; progressSum: number; progressN: number }>();
  for (const i of items) {
    const bucket = areaBuckets.get(i.area) ?? { count: 0, progressSum: 0, progressN: 0 };
    bucket.count += 1;
    if (i.progressPct != null) {
      bucket.progressSum += i.progressPct;
      bucket.progressN += 1;
    }
    areaBuckets.set(i.area, bucket);
  }
  const totalGoals = items.length;
  const areas = [...areaBuckets.entries()]
    .map(([area, b]) => ({ area, count: b.count, pct: totalGoals > 0 ? Math.round((b.count / totalGoals) * 100) : 0, avgProgress: b.progressN > 0 ? Math.round(b.progressSum / b.progressN) : null }))
    .sort((a, b) => b.count - a.count);

  const monthly = buildMonthlyProjection(items, today);
  const risks = items.filter((i) => i.risk).sort((a, b) => (riskWeight(b.risk) - riskWeight(a.risk))).slice(0, 6);

  const suggestions: string[] = [];
  const atRiskCount = items.filter((i) => i.risk === "high" || i.risk === "critical").length;
  if (atRiskCount > 0) suggestions.push(`Você tem ${atRiskCount} meta${atRiskCount > 1 ? "s" : ""} com risco alto de não ser concluída no prazo atual.`);

  const insights: string[] = [];
  if (paceMultiplier != null) {
    insights.push(
      paceMultiplier >= 1
        ? `Nos seus dados, seu ritmo de conclusão está ${paceMultiplier.toFixed(1)}x mais rápido que no período anterior.`
        : `Nos seus dados, seu ritmo de conclusão caiu para ${paceMultiplier.toFixed(1)}x em relação ao período anterior.`
    );
  }
  const bestArea = [...areas].filter((a) => a.avgProgress != null).sort((a, b) => (b.avgProgress ?? 0) - (a.avgProgress ?? 0))[0];
  if (bestArea && areas.length > 1) insights.push(`Nos seus dados, a área "${bestArea.area}" concentra o maior progresso médio (${bestArea.avgProgress}%).`);

  const completedGoals = items.filter((i) => i.status === "completed").length;

  res.json({
    summary: { activeGoals: activeGoals.length, completedGoals, avgProgress, projectedCompletions3Months, paceMultiplier },
    goals: items,
    timeline: items.filter((i) => i.forecastDate || i.dueDate).map((i) => ({ id: i.id, title: i.title, start: i.createdAt, end: i.forecastDate ?? i.dueDate, status: i.status })),
    areas,
    monthlyProjection: monthly,
    risks,
    suggestions,
    insights,
    today,
  });
});

function riskWeight(risk: string | null): number {
  return risk === "critical" ? 4 : risk === "high" ? 3 : risk === "medium" ? 2 : risk === "low" ? 1 : 0;
}

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function buildMonthlyProjection(items: Array<{ forecastDate: string | null }>, today: string) {
  const start = new Date(`${today}T00:00:00Z`);
  const points: Array<{ month: string; label: string; count: number }> = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(start);
    d.setUTCMonth(d.getUTCMonth() + i);
    points.push({ month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, label: MONTH_LABELS[d.getUTCMonth()], count: 0 });
  }
  const byMonth = new Map(points.map((p) => [p.month, p]));
  for (const item of items) {
    if (!item.forecastDate) continue;
    const bucket = byMonth.get(item.forecastDate.slice(0, 7));
    if (bucket) bucket.count += 1;
  }
  return points;
}

/**
 * Ritmo de evolução: soma dos deltas de progresso (%) nos últimos 30
 * dias contra os 30 dias anteriores, usando os pontos reais mais
 * próximos de cada corte em goal_progress. Sem histórico suficiente
 * no período anterior, devolve null (nunca inventa multiplicador).
 */
async function computePaceMultiplier(db: Db, ownerId: string, goals: GoalRow[], today: string): Promise<number | null> {
  const numericLike = goals.filter((g) => g.kind !== "binary");
  if (numericLike.length === 0) return null;
  const todayMs = new Date(`${today}T00:00:00Z`).getTime();
  const cut30 = new Date(todayMs - 30 * 86_400_000).toISOString().slice(0, 10);
  const cut60 = new Date(todayMs - 60 * 86_400_000).toISOString().slice(0, 10);

  let recentSum = 0;
  let previousSum = 0;
  let hasPrevious = false;

  for (const g of numericLike) {
    const history = await getProgressHistory(db, g.id);
    if (history.length === 0) continue;
    const valueAt = (cutoff: string) => {
      const before = history.filter((p) => p.recordedAt.slice(0, 10) <= cutoff);
      return before.length > 0 ? before[before.length - 1].value : null;
    };
    const nowVal = g.current_value;
    const at30 = valueAt(cut30);
    const at60 = valueAt(cut60);
    if (at30 == null) continue;
    recentSum += nowVal - at30;
    if (at60 != null) {
      previousSum += at30 - at60;
      hasPrevious = true;
    }
  }

  if (!hasPrevious || previousSum <= 0) return null;
  return Math.round((recentSum / previousSum) * 10) / 10;
}
