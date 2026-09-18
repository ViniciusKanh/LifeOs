/**
 * Goal Forecast — risco de não concluir a meta no prazo. Determinístico
 * (nunca Gemini), pesos documentados, score 0-100:
 *
 *  - scheduleDelta (até 45 pts): quão atrás do prazo a previsão está.
 *  - paceDeficit (até 35 pts): ritmo atual abaixo do ritmo necessário.
 *  - progressDeficit (até 20 pts): progresso real abaixo do esperado
 *    pelo tempo já decorrido (quando start/due são conhecidos).
 */
export type GoalRisk = "low" | "medium" | "high" | "critical";

export interface GoalRiskInput {
  scheduleDeltaDays: number | null; // forecastDate - dueDate em dias negativos (atraso) — null se sem prazo/forecast
  currentPace: number | null;
  requiredPace: number | null;
  progressDeficitPct: number | null; // expectedProgress - actualProgress, 0-100
  overdue: boolean;
}

export function classifyGoalRisk(score: number): GoalRisk {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 30) return "medium";
  return "low";
}

export function computeGoalRiskScore(input: GoalRiskInput): number {
  const { scheduleDeltaDays, currentPace, requiredPace, progressDeficitPct, overdue } = input;

  let scheduleDelta = 0;
  if (overdue) scheduleDelta = 45;
  else if (scheduleDeltaDays != null) {
    if (scheduleDeltaDays <= -60) scheduleDelta = 45;
    else if (scheduleDeltaDays <= -30) scheduleDelta = 35;
    else if (scheduleDeltaDays <= -7) scheduleDelta = 22;
    else if (scheduleDeltaDays < 0) scheduleDelta = 10;
  }

  let paceDeficit = 0;
  if (currentPace != null && requiredPace != null && requiredPace > 0) {
    const paceRatio = currentPace / requiredPace;
    paceDeficit = Math.min(35, Math.max(0, (1 - Math.min(1, paceRatio)) * 35));
  }

  const progressDeficit = progressDeficitPct != null ? Math.min(20, Math.max(0, (progressDeficitPct / 100) * 20)) : 0;

  return Math.round(Math.min(100, scheduleDelta + paceDeficit + progressDeficit));
}
