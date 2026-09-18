/**
 * Goal Forecast — previsão de conclusão de metas. Determinístico
 * (nunca Gemini): regressão linear simples sobre o histórico real de
 * goal_progress (mesma fórmula usada por GET /api/goals/:id/forecast,
 * extraída para cá para não duplicar cálculo entre o endpoint
 * individual e o dashboard agregado).
 */
export interface GoalProgressPoint {
  value: number;
  recordedAt: string;
}

export interface GoalCompletionForecast {
  date: string; // YYYY-MM-DD
  ratePerDay: number;
  daysRemaining: number;
  aheadOrBehindDays: number | null; // positivo = folga antes do prazo
}

export interface GoalForecastResult {
  forecast: GoalCompletionForecast | null;
  reason: string | null;
}

interface GoalForecastInput {
  kind: "numeric" | "percentage" | "binary" | "task_based";
  status: "active" | "done" | "abandoned";
  targetValue: number | null;
  currentValue: number;
  dueDate: string | null;
}

/**
 * Metas numéricas usam target_value real; percentage e task_based
 * tratam current_value como 0-100 diretamente (mesma convenção já
 * usada pelo Life Score em metricsService.ts — nunca recalculamos
 * progresso aqui, só projetamos a data).
 */
function resolveTarget(goal: GoalForecastInput): number | null {
  if (goal.kind === "numeric") return goal.targetValue;
  if (goal.kind === "percentage" || goal.kind === "task_based") return 100;
  return null; // binary não tem métrica contínua projetável
}

export function computeGoalForecast(goal: GoalForecastInput, progress: GoalProgressPoint[]): GoalForecastResult {
  if (goal.status === "done") return { forecast: null, reason: "Meta já concluída." };
  if (goal.status === "abandoned") return { forecast: null, reason: "Meta abandonada — sem projeção." };
  if (goal.kind === "binary") return { forecast: null, reason: "Meta binária — sem métrica numérica para projetar." };

  const target = resolveTarget(goal);
  if (target === null || target === undefined) {
    return { forecast: null, reason: "Meta sem valor-alvo definido — não é possível projetar uma data." };
  }
  if (progress.length < 2) {
    return { forecast: null, reason: "Ainda não há progresso suficiente registrado para projetar uma data." };
  }

  const first = progress[0];
  const last = progress[progress.length - 1];
  const elapsedDays = (new Date(last.recordedAt).getTime() - new Date(first.recordedAt).getTime()) / 86_400_000;
  if (elapsedDays < 2) {
    return { forecast: null, reason: "Ainda não há progresso suficiente registrado para projetar uma data." };
  }

  const ratePerDay = (last.value - first.value) / elapsedDays;
  if (ratePerDay <= 0) {
    return { forecast: null, reason: "O ritmo atual não indica avanço — sem projeção possível." };
  }

  const remaining = target - goal.currentValue;
  const daysRemaining = Math.max(0, remaining) / ratePerDay;
  const forecastDateObj = new Date();
  forecastDateObj.setUTCHours(0, 0, 0, 0);
  forecastDateObj.setUTCDate(forecastDateObj.getUTCDate() + Math.ceil(daysRemaining));
  const forecastDate = forecastDateObj.toISOString().slice(0, 10);

  let aheadOrBehindDays: number | null = null;
  if (goal.dueDate) {
    const due = new Date(goal.dueDate);
    due.setUTCHours(0, 0, 0, 0);
    aheadOrBehindDays = Math.round((due.getTime() - forecastDateObj.getTime()) / 86_400_000);
  }

  return {
    forecast: {
      date: forecastDate,
      ratePerDay: Math.round(ratePerDay * 10_000) / 10_000,
      daysRemaining: Math.round(daysRemaining * 10) / 10,
      aheadOrBehindDays,
    },
    reason: null,
  };
}

export type GoalForecastStatus = "ahead" | "on_track" | "attention" | "at_risk" | "overdue" | "completed" | "insufficient_data";

export const GOAL_FORECAST_STATUS_LABEL: Record<GoalForecastStatus, string> = {
  ahead: "Adiantada",
  on_track: "No ritmo",
  attention: "Atenção",
  at_risk: "Em risco",
  overdue: "Atrasada",
  completed: "Concluída",
  insufficient_data: "Dados insuficientes",
};

/**
 * Regra de status centralizada (nunca duplicar em componentes). Faixas
 * de folga documentadas: >=14 dias de folga = Adiantada; >=0 = No
 * ritmo; até -14 = Atenção; abaixo disso = Em risco.
 */
export function classifyGoalForecastStatus(
  goal: GoalForecastInput,
  forecast: GoalCompletionForecast | null,
  today: string
): GoalForecastStatus {
  if (goal.status === "done") return "completed";
  if (goal.dueDate && goal.dueDate < today) return "overdue";
  if (!forecast) return "insufficient_data";
  if (!goal.dueDate) return "on_track"; // "previsão estimada", nunca classificada por prazo
  const delta = forecast.aheadOrBehindDays ?? 0;
  if (delta >= 14) return "ahead";
  if (delta >= 0) return "on_track";
  if (delta >= -14) return "attention";
  return "at_risk";
}

/** Ritmo necessário (remaining / dias até o prazo) — só existe quando há due_date. */
export function computeRequiredPace(goal: GoalForecastInput, today: string): number | null {
  const target = resolveTarget(goal);
  if (target === null || !goal.dueDate) return null;
  const remaining = target - goal.currentValue;
  const daysUntilDue = (new Date(`${goal.dueDate}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000;
  if (daysUntilDue <= 0) return null;
  return Math.max(0, remaining) / daysUntilDue;
}

/** Progresso esperado pelo tempo decorrido (usa created_at como início — goals não tem start_date próprio). */
export function computeExpectedProgressPct(startDate: string, dueDate: string, today: string): number | null {
  const start = new Date(`${startDate.slice(0, 10)}T00:00:00Z`).getTime();
  const due = new Date(`${dueDate}T00:00:00Z`).getTime();
  const now = new Date(`${today}T00:00:00Z`).getTime();
  const totalSpan = due - start;
  if (totalSpan <= 0) return null;
  return Math.round(Math.min(1, Math.max(0, (now - start) / totalSpan)) * 100);
}
