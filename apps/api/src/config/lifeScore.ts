/**
 * Dimensões oficiais do Life Score (desde a 0.5.38).
 *
 * Metas, Leitura e Profissional saíram: Metas já têm tela própria,
 * Leitura virou Conhecimento (livros + podcasts + aulas + papers) e o
 * trabalho técnico passou a ser medido por Código (WakaTime, commits e
 * Advent of Code). As colunas antigas de life_scores continuam no banco
 * só como histórico — nenhuma é mais gravada.
 */
export const LIFE_DIMS = ["productivity", "health", "habits", "education", "knowledge", "code"] as const;
export type LifeDim = (typeof LIFE_DIMS)[number];

export const LIFE_DIM_LABEL: Record<LifeDim, string> = {
  productivity: "Produtividade",
  health: "Saúde",
  habits: "Hábitos",
  education: "Educação",
  knowledge: "Conhecimento",
  code: "Código",
};

export const LIFE_DIM_SOURCE: Record<LifeDim, string> = {
  productivity: "Missões com prazo nos últimos 7 dias concluídas a tempo (Missões)",
  health: "Água, sono, exercício e humor do dia (Saúde)",
  habits: "% dos hábitos cumpridos hoje (Hábitos)",
  education: "Progresso das formações (Educação)",
  knowledge: "Minutos de livros, podcasts, aulas em vídeo e papers nos últimos 7 dias (Biblioteca e Educação)",
  code: "WakaTime, commits e estrelas do Advent of Code nos últimos 7 dias (Forja do Código)",
};

/** Janela das dimensões semanais (dias locais, incluindo hoje). */
export const LIFE_WINDOW_DAYS = 7;
/** Conhecimento: 300 min por semana (~43 min/dia) = 100 pontos. */
export const KNOWLEDGE_WEEK_TARGET_MIN = 300;
/** Sessão de leitura sem duração registrada: 2 min por página (regra de conversão, não estimativa escondida). */
export const READING_MIN_PER_PAGE = 2;
/** Paper marcado como lido/fichado na semana: 45 min. */
export const PAPER_MINUTES = 45;
/** Código: 600 min de editor por semana (WakaTime) e 5 dias com atividade = 100 pontos. */
export const CODE_WEEK_TARGET_MIN = 600;
export const CODE_ACTIVE_DAYS_TARGET = 5;
/** Dia conta como ativo no WakaTime a partir de 15 minutos de editor. */
export const CODE_ACTIVE_DAY_MIN = 15;
