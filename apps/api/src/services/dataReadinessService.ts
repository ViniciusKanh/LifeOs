/**
 * Data Readiness — prontidão dos módulos analíticos/preditivos do
 * LifeOS para usar os dados do usuário. Puramente determinístico
 * (sem Gemini): cada ferramenta declara o que precisa e o motivo do
 * status aparece sempre, nunca só o rótulo.
 */

export type ReadinessStatus = "ready" | "partial" | "insufficient" | "unavailable";

export const READINESS_LABEL: Record<ReadinessStatus, string> = {
  ready: "Pronto",
  partial: "Parcial",
  insufficient: "Insuficiente",
  unavailable: "Indisponível",
};

export interface ReadinessResult {
  tool: string;
  status: ReadinessStatus;
  reason: string;
}

export interface ReadinessInput {
  activeGoalsCount: number;
  goalsWithEnoughProgressCount: number; // metas numéricas/percentuais com >=2 registros de progresso
  activeTasksCount: number;
  tasksWithEstimateCount: number;
  tasksWithDueDateCount: number;
  goalsWithDueDateCount: number;
  invalidTimestampCount: number;
  signalCategoriesWithRecentData: number; // de 0 a 4 (sono, água, treino, humor) — Focus Mode foi removido do produto
  totalScore: number;
}

/** Goal Forecast: precisa de metas ativas com histórico de progresso suficiente para regressão linear. */
function goalForecastReadiness(i: ReadinessInput): ReadinessResult {
  if (i.activeGoalsCount === 0) {
    return { tool: "Goal Forecast", status: "insufficient", reason: "Nenhuma meta ativa cadastrada." };
  }
  const ratio = i.goalsWithEnoughProgressCount / i.activeGoalsCount;
  if (ratio >= 0.6) return { tool: "Goal Forecast", status: "ready", reason: `${i.goalsWithEnoughProgressCount} de ${i.activeGoalsCount} metas com histórico suficiente.` };
  if (ratio >= 0.3) return { tool: "Goal Forecast", status: "partial", reason: `Só ${i.goalsWithEnoughProgressCount} de ${i.activeGoalsCount} metas têm histórico suficiente para previsão.` };
  return { tool: "Goal Forecast", status: "insufficient", reason: "Poucas metas têm progresso registrado — previsões ficam pouco confiáveis." };
}

/** Signals: precisa de múltiplas fontes reais (sono, água, treino, humor) com dado recente. */
function signalsReadiness(i: ReadinessInput): ReadinessResult {
  if (i.signalCategoriesWithRecentData === 0) {
    return { tool: "Signals", status: "insufficient", reason: "Nenhuma fonte com registro nos últimos 7 dias." };
  }
  if (i.signalCategoriesWithRecentData >= 3) {
    return { tool: "Signals", status: "ready", reason: `${i.signalCategoriesWithRecentData} de 4 fontes com dado recente.` };
  }
  return { tool: "Signals", status: "partial", reason: `Só ${i.signalCategoriesWithRecentData} de 4 fontes com dado recente — padrões ficam limitados.` };
}

/** Capacity Planner: depende de tarefas ativas com duração estimada para calcular carga do dia. */
function capacityPlannerReadiness(i: ReadinessInput): ReadinessResult {
  if (i.activeTasksCount === 0) {
    return { tool: "Capacity Planner", status: "insufficient", reason: "Nenhuma tarefa ativa para planejar." };
  }
  const ratio = i.tasksWithEstimateCount / i.activeTasksCount;
  const missing = i.activeTasksCount - i.tasksWithEstimateCount;
  if (ratio >= 0.7) return { tool: "Capacity Planner", status: "ready", reason: `${Math.round(ratio * 100)}% das tarefas ativas têm duração estimada.` };
  if (ratio >= 0.4) return { tool: "Capacity Planner", status: "partial", reason: `${missing} tarefas sem duração estimada reduzem a precisão do cálculo.` };
  return { tool: "Capacity Planner", status: "insufficient", reason: `${missing} tarefas ativas sem duração estimada.` };
}

/** Deadline Radar: depende de tarefas/metas com prazo e timestamps consistentes. */
function deadlineRadarReadiness(i: ReadinessInput): ReadinessResult {
  const totalWithDue = i.tasksWithDueDateCount + i.goalsWithDueDateCount;
  if (totalWithDue === 0) {
    return { tool: "Deadline Radar", status: "insufficient", reason: "Nenhuma tarefa ou meta com prazo definido." };
  }
  if (i.invalidTimestampCount > 0) {
    return { tool: "Deadline Radar", status: "partial", reason: `${i.invalidTimestampCount} prazos com timestamp inconsistente afetam a confiabilidade.` };
  }
  return { tool: "Deadline Radar", status: "ready", reason: `${totalWithDue} itens com prazo válido monitorados.` };
}

/** LifeOS Copilot: usa a saúde geral dos dados como proxy — sem histórico e integridade, a IA erra mais. */
function copilotReadiness(i: ReadinessInput): ReadinessResult {
  if (i.totalScore >= 75) return { tool: "LifeOS Copilot", status: "ready", reason: "Saúde geral dos dados suficiente para gerar insights confiáveis." };
  if (i.totalScore >= 50) return { tool: "LifeOS Copilot", status: "partial", reason: "Alguns módulos ainda limitam a qualidade dos insights do Copilot." };
  return { tool: "LifeOS Copilot", status: "insufficient", reason: "A qualidade geral dos dados ainda é baixa para insights confiáveis." };
}

export function computeReadiness(input: ReadinessInput): ReadinessResult[] {
  return [goalForecastReadiness(input), signalsReadiness(input), capacityPlannerReadiness(input), deadlineRadarReadiness(input), copilotReadiness(input)];
}
