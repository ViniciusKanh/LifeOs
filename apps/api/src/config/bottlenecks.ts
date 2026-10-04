/**
 * Configuração central do Detector de Gargalos. Todos os pesos, limites e
 * faixas ficam aqui — nada disso é repetido no frontend (a UI recebe a
 * faixa já classificada).
 */
export const bottleneckConfig = {
  /** Pesos do BottleneckScore (somam 1). */
  weights: {
    dependency: 0.3,
    urgency: 0.2,
    inactivity: 0.15,
    strategic: 0.15,
    capacity: 0.1,
    downstream: 0.1,
  },
  /** Peso de um item dependente conforme a distância até o gargalo. */
  depthWeights: [1, 0.6, 0.35, 0.2] as const,
  maxDepth: 6,
  /** Quanto de dependência ponderada equivale a 100 no DependencyImpact. */
  dependencyFullAt: 5,
  dependencyUnit: { task: 1, project: 0.5, campaign: 1, goal: 1, milestone: 1 },
  urgency: {
    /** Pontos perdidos por dia restante até o prazo (0 dias = 100). */
    perDay: 7,
    overdueBase: 90,
    overduePerDay: 2,
    /** Prazos de itens dependentes contam um pouco menos que o próprio. */
    dependentFactor: 0.8,
    priorityBonus: { Alta: 15, Média: 5, Baixa: 0 } as Record<string, number>,
  },
  inactivity: { fullAtDays: 21, minDays: 3 },
  strategic: {
    priority: { Alta: 45, Média: 25, Baixa: 10 } as Record<string, number>,
    goal: 20,
    campaign: 20,
    campaignHighPriority: 10,
    project: 10,
  },
  capacity: { horizonDays: 7 },
  downstream: { riskSlackDays: 7, perItem: 25 },
  /** Faixas do score (0–100). */
  thresholds: { attention: 40, high: 60, critical: 80 },
  /** Score mínimo para um item ser apontado como gargalo principal. */
  primaryMin: 30,
  /** Mínimos para aparecer no ranking e na lista de potenciais. */
  rankingMin: 25,
  potentialMin: 12,
  rankingSize: 5,
  potentialSize: 3,
  /** Hábitos: janela de adesão e mínimo de ciclos para julgar. */
  habit: { windowDays: 28, minExpected: 4, poorAdherence: 0.6, campaignLink: 30 },
  /** Sinais de saúde: só entram como "padrão observado" e nunca viram críticos. */
  health: { attentionBelow: 50, scoreFactor: 1.6, maxScore: 59 },
  /** Sobrecarga: ocupação média acima disso vira candidato/causa. */
  overload: { occupancy: 0.9, causeOccupancy: 0.85 },
  focus: {
    defaultMinutes: 60,
    minMinutes: 25,
    maxMinutes: 120,
    /** Sessões necessárias para usar o horário histórico do próprio usuário. */
    minSessionsForPattern: 5,
    searchDays: 3,
  },
  causes: { complexityMinutes: 120, continuousMinutes: 45, competingDays: 7 },
  cache: { ttlMs: 10 * 60 * 1000 },
  ai: { rateLimit: { windowMs: 60 * 60 * 1000, max: 8 }, timeoutMs: 20_000, retries: 1, maxText: 600 },
  /** Dados mínimos para a análise fazer sentido. */
  minimum: { openTasks: 3 },
} as const;

export type BottleneckLevel = "normal" | "attention" | "high" | "critical";

export function classifyScore(score: number): BottleneckLevel {
  const T = bottleneckConfig.thresholds;
  if (score >= T.critical) return "critical";
  if (score >= T.high) return "high";
  if (score >= T.attention) return "attention";
  return "normal";
}

export function depthWeight(depth: number): number {
  const W = bottleneckConfig.depthWeights;
  return W[Math.min(Math.max(depth, 1), W.length) - 1];
}
