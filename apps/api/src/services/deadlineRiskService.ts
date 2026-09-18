/**
 * Deadline Radar — risco de não concluir. Heurística determinística e
 * documentada (nunca Gemini, nunca aleatório). Pesos somam 100 pontos:
 *
 *  - deadlinePressure (até 40 pts): quanto mais perto o prazo, maior a pressão.
 *  - progressDeficit (até 35 pts): diferença entre o progresso esperado
 *    (proporcional ao tempo decorrido) e o progresso real.
 *  - remainingWork (até 15 pts): proporção de tarefas ainda abertas.
 *  - priorityWeight (até 10 pts): prioridade Alta/Média/Baixa do item.
 */
export type DeadlineRisk = "low" | "medium" | "high" | "critical";

export interface RiskInput {
  daysRemaining: number; // pode ser negativo (atrasado)
  totalSpanDays: number | null; // duração total planejada (start→due), quando conhecida
  progressPct: number | null; // 0-100, null quando não há progresso mensurável
  openItemsRatio: number | null; // 0-1, fração de subitens/tarefas ainda abertas
  priority: "Baixa" | "Média" | "Alta" | null;
}

export function classifyRisk(score: number): DeadlineRisk {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 30) return "medium";
  return "low";
}

export function computeRiskScore(input: RiskInput): number {
  const { daysRemaining, totalSpanDays, progressPct, openItemsRatio, priority } = input;

  let deadlinePressure = 0;
  if (daysRemaining <= 0) deadlinePressure = 40;
  else if (daysRemaining <= 3) deadlinePressure = 34;
  else if (daysRemaining <= 7) deadlinePressure = 24;
  else if (daysRemaining <= 30) deadlinePressure = 12;
  else deadlinePressure = 4;

  let progressDeficit = 0;
  if (progressPct != null && totalSpanDays != null && totalSpanDays > 0) {
    const elapsedRatio = Math.min(1, Math.max(0, (totalSpanDays - daysRemaining) / totalSpanDays));
    const expectedPct = elapsedRatio * 100;
    const deficit = Math.max(0, expectedPct - progressPct);
    progressDeficit = Math.min(35, (deficit / 100) * 35);
  }

  const remainingWork = openItemsRatio != null ? openItemsRatio * 15 : 0;

  const priorityWeight = priority === "Alta" ? 10 : priority === "Média" ? 5 : 0;

  return Math.round(Math.min(100, deadlinePressure + progressDeficit + remainingWork + priorityWeight));
}
