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
    /** Contrato (hábito) cumprido no dia: atingiu target_count. */
    xp: 5,
    coins: 1,
    /** Só check-ins de hoje ou ontem rendem XP (evita farm retroativo). */
    maxDaysBack: 1,
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
