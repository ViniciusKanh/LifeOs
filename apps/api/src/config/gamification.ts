/**
 * Tabela central de regras da gamificação. Todo valor de XP/moedas do
 * LifeOS sai daqui — nenhum componente ou rota deve ter número mágico.
 * Os bônus são sempre determinísticos (sem sorte, sem loot box, sem
 * dinheiro real) e nunca há XP negativo ou punição.
 */
export const GAMIFICATION_RULES = {
  task: {
    /** XP base por prioridade ao concluir uma tarefa ("missão"). */
    xpByPriority: { Baixa: 10, Média: 20, Alta: 35 } as Record<string, number>,
    /** Moedas por prioridade (moeda é o recurso gastável na loja). */
    coinsByPriority: { Baixa: 2, Média: 4, Alta: 7 } as Record<string, number>,
    /** Missão diária: tarefa com prazo para o dia em que foi concluída. */
    dailyMissionXp: 5,
    /** Missão principal: tarefa escolhida como foco do dia no Diário. */
    mainMissionXp: 15,
    mainMissionCoins: 3,
    /** Concluída antes do prazo (estritamente antes do dia do prazo). */
    beforeDeadlineXp: 5,
    /** Primeira missão concluída no dia. */
    firstOfDayXp: 5,
    /** Todas as missões com prazo no dia concluídas (mínimo de tarefas abaixo). */
    allDailyDoneXp: 20,
    allDailyDoneCoins: 5,
    allDailyDoneMinTasks: 2,
    /**
     * Teto diário de XP vindo de tarefas — trava contra apagar/recriar
     * tarefas só para farmar XP (cada tarefa nova tem id novo).
     */
    dailyXpCap: 400,
  },
  habit: {
    /** Hábito cumprido no dia: atingiu target_count. */
    xp: 5,
    coins: 1,
    /** Só check-ins de hoje ou ontem rendem XP (evita farm retroativo). */
    maxDaysBack: 1,
  },
  /**
   * Marcos de sequência de um hábito diário: bônus único por
   * hábito e por marco. Sequência não é XP — quebrar a sequência não tira nada.
   */
  habitStreakMilestones: [
    { days: 7, xp: 15, coins: 3 },
    { days: 14, xp: 20, coins: 4 },
    { days: 30, xp: 40, coins: 8 },
    { days: 60, xp: 60, coins: 12 },
    { days: 100, xp: 100, coins: 20 },
    { days: 365, xp: 250, coins: 50 },
  ],
  /**
   * Administração da Vida: recompensa leve ao resolver um item. Só conta
   * quando o vencimento coberto estava atrasado ou dentro da janela de
   * lembrete (evita "adiantar" ciclos recorrentes só para ganhar XP).
   */
  lifeAdmin: {
    byKind: { vencimento: { xp: 10, coins: 2 }, documento: { xp: 10, coins: 2 }, conta: { xp: 10, coins: 2 }, manutencao: { xp: 15, coins: 3 } } as Record<string, { xp: number; coins: number }>,
    maxDaysAhead: 60,
  },
  /**
   * Conquista do catálogo oficial desbloqueada → XP e moedas por raridade,
   * uma única vez. Troféus personalizados (criados pelo próprio usuário)
   * NÃO rendem nada: seriam uma forma trivial de "farmar" recompensa.
   */
  achievementByTier: {
    bronze: { xp: 25, coins: 5 },
    silver: { xp: 50, coins: 10 },
    gold: { xp: 100, coins: 20 },
    platinum: { xp: 250, coins: 50 },
  } as Record<string, { xp: number; coins: number }>,
  /**
   * Dificuldade (fácil → épico). Os valores abaixo são o PADRÃO: cada
   * usuário pode ajustar os seus em Meu Perfil, sempre dentro dos limites
   * (o backend corta qualquer valor fora da faixa). Tarefa com dificuldade
   * usa estes valores no lugar dos de prioridade; o bônus de contrato é
   * pago uma vez quando todas as tarefas do contrato são concluídas.
   */
  difficulty: {
    levels: ["facil", "medio", "dificil", "epico"] as const,
    defaults: {
      facil: { taskXp: 10, taskCoins: 2, contractXp: 30, contractCoins: 6 },
      medio: { taskXp: 20, taskCoins: 4, contractXp: 60, contractCoins: 12 },
      dificil: { taskXp: 35, taskCoins: 7, contractXp: 120, contractCoins: 24 },
      epico: { taskXp: 60, taskCoins: 12, contractXp: 250, contractCoins: 50 },
    } as Record<"facil" | "medio" | "dificil" | "epico", { taskXp: number; taskCoins: number; contractXp: number; contractCoins: number }>,
    limits: { taskXp: 150, taskCoins: 30, contractXp: 600, contractCoins: 120 },
  },
  contract: {
    /** Contrato precisa de ao menos N tarefas para render bônus (evita contrato de 1 clique). */
    minTasks: 2,
    /** Máximo de contratos premiados por dia (trava contra farm). */
    maxRewardedPerDay: 3,
  },
  /**
   * Laboratório (Experimentos Pessoais): dar vida a um experimento,
   * registrar o check-in do dia e concluir com uma conclusão escrita.
   * Conclusão só paga se o experimento durou o mínimo de dias e teve
   * registros — evita "concluir" um experimento vazio.
   */
  experiment: {
    started: { xp: 15, coins: 3 },
    /** Máximo de experimentos iniciados premiados por dia (criar/apagar não farma). */
    maxStartedPerDay: 2,
    checkin: { xp: 3, coins: 1 },
    checkinMaxDaysBack: 1,
    concluded: { xp: 80, coins: 16 },
    concludeMinDays: 7,
    concludeMinLogs: 3,
    concludeMinConclusionChars: 20,
  },
  focus: {
    /** Cada bloco completo de 25 min de foco rende XP. */
    blockMinutes: 25,
    xpPerBlock: 5,
    coinsPerBlock: 1,
    maxBlocksPerSession: 4,
  },
  project: {
    xp: 100,
    coins: 20,
  },
  /**
   * Fechamento de ciclo (revisão salva com ao menos uma reflexão escrita).
   * Uma vez por período; só o período atual ou o imediatamente anterior
   * rendem XP (evita farm preenchendo revisões antigas).
   */
  review: {
    weekly: { xp: 20, coins: 4 },
    monthly: { xp: 50, coins: 10 },
    quarterly: { xp: 80, coins: 15 },
    annual: { xp: 150, coins: 30 },
  } as Record<"weekly" | "monthly" | "quarterly" | "annual", { xp: number; coins: number }>,
  journal: {
    /** Primeira entrada do Diário no dia (com texto), só no próprio dia. */
    xp: 10,
    coins: 2,
  },
  /**
   * Curva de nível progressiva: para sair do nível N para o N+1 são
   * necessários base + step * (N - 1) XP. Nível 1 começa em 0 XP.
   */
  levelCurve: { base: 100, step: 50 },
  /** Fuso usado para decidir "o dia" de um evento quando o usuário não tem um. */
  defaultTimezone: "America/Sao_Paulo",
} as const;

export type GamificationRules = typeof GAMIFICATION_RULES;
