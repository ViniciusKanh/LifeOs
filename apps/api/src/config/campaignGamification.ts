/**
 * Regras centrais da Forja de Campanhas. Nenhum componente ou rota deve
 * ter número mágico de campanha: tudo sai daqui. XP/moedas continuam no
 * ledger único do motor de gamificação (gamificationService.award).
 */
export const campaignGamificationConfig = {
  /** Pesos do progresso; dimensões ausentes têm o peso redistribuído. */
  progressWeights: { missions: 0.5, milestones: 0.3, contracts: 0.2 },
  milestone: {
    /** Sugestão do LifeOS ao criar um marco (o usuário pode ajustar dentro dos limites). */
    suggested: { normal: { xp: 60, coins: 12 }, major: { xp: 200, coins: 40 } },
    limits: { xp: 500, coins: 100 },
    /** No máximo N marcos premiados por dia (criar/concluir em série não farma). */
    maxRewardedPerDay: 5,
    /** No máximo N marcos premiados por campanha. */
    maxRewardedPerCampaign: 12,
  },
  completion: {
    /** Recompensa sugerida pela duração; +bônus por marco cadastrado. */
    suggested: {
      curto: { xp: 150, coins: 30 },
      medio: { xp: 300, coins: 60 },
      longo: { xp: 500, coins: 100 },
    } as Record<"curto" | "medio" | "longo", { xp: number; coins: number }>,
    perMilestone: { xp: 25, coins: 5 },
    limits: { xp: 1500, coins: 300 },
    /** A recompensa de conclusão só é paga se a campanha existiu por N dias. */
    minDaysSinceStart: 3,
  },
  streak: {
    period: "weekly" as const,
    /** Bônus por semanas consecutivas com atividade qualificável (vale só para o futuro). */
    tiers: [
      { weeks: 2, xpPct: 5, coinsPct: 0 },
      { weeks: 3, xpPct: 10, coinsPct: 5 },
      { weeks: 4, xpPct: 15, coinsPct: 10 },
      { weeks: 8, xpPct: 20, coinsPct: 15 },
    ],
  },
} as const;

export type CampaignTerm = keyof typeof campaignGamificationConfig.completion.suggested;
