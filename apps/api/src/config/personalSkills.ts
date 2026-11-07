/**
 * Árvore de Habilidades 2.0 — regras centralizadas.
 *
 * As habilidades são do usuário (criadas à mão ou propostas pela IA e
 * confirmadas). O nível só sobe com prova aprovada: nenhum número aqui vira
 * métrica de vida (Life Score, sono, hábitos) — é progressão de conhecimento
 * e técnica comprovada.
 */

export const SKILL_DOMAINS = ["saude", "educacao", "pessoal", "trabalho"] as const;
export type SkillDomain = (typeof SKILL_DOMAINS)[number];

export const DOMAIN_META: Record<SkillDomain, { label: string; hint: string }> = {
  saude: { label: "Saúde", hint: "Corpo e movimento: lutas, dança, esportes, musculação, mobilidade." },
  educacao: { label: "Educação", hint: "Estudo formal: concursos, faculdade, idiomas, certificações." },
  pessoal: { label: "Pessoal", hint: "Projetos e interesses próprios: programação, ML, música, arte." },
  trabalho: { label: "Trabalho", hint: "Competências profissionais: ferramentas, gestão, comunicação." },
};

export const PROOF_KINDS = ["quiz", "desafio", "misto"] as const;
export type ProofKind = (typeof PROOF_KINDS)[number];

export const LINK_KINDS = ["modalidade", "formacao", "disciplina", "projeto"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

/** Ícones permitidos (nomes lucide mapeados no frontend). */
export const SKILL_ICONS = [
  "sparkles", "brain", "code", "terminal", "database", "chart", "cpu", "book", "languages", "pen", "graduation", "scale",
  "calculator", "flask", "globe", "music", "palette", "camera", "swords", "dumbbell", "footprints", "heart", "flame", "shield",
  "briefcase", "users", "presentation", "target", "rocket", "lightbulb", "wrench", "leaf", "mic", "compass",
] as const;
export type SkillIcon = (typeof SKILL_ICONS)[number];

export const SKILL_LIMITS = {
  maxSkills: 200,
  maxDepth: 4,
  maxChildren: 20,
  nameMax: 60,
  descriptionMax: 400,
  criteriaMax: 400,
  aiMaxNodes: 24,
  goalMax: 500,
} as const;

export const PROOF_RULES = {
  passScore: 70,
  expiresHours: 48,
  /** Espera depois de uma reprovação antes de tentar o mesmo nível de novo. */
  retryCooldownHours: 6,
  maxPerDay: 8,
  answerMax: 6000,
  /** Peso de cada tipo de questão na nota final. */
  weights: { choice: 1, open: 2, challenge: 4 },
  /** Quantidade de questões por tipo de prova. */
  layout: {
    quiz: { choice: 6, open: 2, challenge: 0 },
    desafio: { choice: 0, open: 0, challenge: 2 },
    misto: { choice: 4, open: 0, challenge: 1 },
  },
} as const;

/** Recompensa oficial (xp_events/coin_ledger) por nível comprovado — uma vez por nível. */
export const levelReward = (level: number) => ({ xp: 30 + 20 * level, coins: 3 * level });

const DEFAULT_TITLES = ["Iniciante", "Básico", "Intermediário", "Avançado", "Especialista", "Mestre", "Grão-mestre", "Referência", "Lenda", "Lenda viva"];
const DEFAULT_CRITERIA = [
  "Conhece o vocabulário e os conceitos essenciais e explica para que servem.",
  "Aplica o básico em exercícios guiados, com poucas consultas.",
  "Resolve problemas comuns sozinho e explica as escolhas feitas.",
  "Resolve casos complexos, compara abordagens e identifica erros sutis.",
  "Domina o tema a ponto de ensinar, criar soluções próprias e avaliar o trabalho de outros.",
];

export interface LevelDef {
  level: number;
  title: string;
  criteria: string;
}

/** Critérios genéricos (editáveis) para habilidades criadas sem descrição de níveis. */
export function defaultLevels(maxLevel: number): LevelDef[] {
  return Array.from({ length: maxLevel }, (_, i) => ({
    level: i + 1,
    title: DEFAULT_TITLES[i] ?? `Nível ${i + 1}`,
    criteria: DEFAULT_CRITERIA[Math.min(i, DEFAULT_CRITERIA.length - 1)]!,
  }));
}
