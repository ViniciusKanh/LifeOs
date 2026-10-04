import type { AttributeKey } from "./codex.js";

/**
 * Build do Personagem — catálogo central. O Build é uma LEITURA da
 * distribuição atual do XP real entre atributos (motor do Códex), nunca
 * um teste de personalidade. Arquétipos descrevem padrões, não pessoas.
 */

/** Ordem de exibição (igual à referência). */
export const BUILD_ATTRIBUTES: AttributeKey[] = ["knowledge", "discipline", "focus", "health", "creativity", "wellbeing"];

export const buildConfig = {
  /** Janela usada para a pontuação atual (dias). */
  windowDays: 30,
  /**
   * XP mensal de referência por atributo = 100 pontos. Calibrado pela
   * economia atual (missão média ≈ 20 XP, ~70% vai para Disciplina).
   */
  referenceXp: { knowledge: 500, discipline: 1200, focus: 800, health: 400, creativity: 250, wellbeing: 350 } as Record<AttributeKey, number>,
  /** Abaixo disso na janela, a build "ainda está sendo formada". */
  minWindowXp: 60,
  /** Diferença considerada "na meta". */
  nearGap: 5,
  /** Soma de metas acima disso gera aviso (não bloqueia). */
  desiredSumWarning: 480,
} as const;

/** Escala 0–100 linear com teto: 100 = atingiu a referência mensal. */
export function normalizeAttributeScore(xp: number, referenceXp: number): number {
  if (referenceXp <= 0 || xp <= 0) return 0;
  return Math.min(100, Math.round((xp / referenceXp) * 100));
}

export interface ArchetypeDef {
  id: string;
  name: string;
  avatar: string;
  /** Perfil de referência (0–1 por atributo) usado na afinidade. */
  profile: Record<AttributeKey, number>;
  description: string;
  tags: string[];
}

export const ARCHETYPES: ArchetypeDef[] = [
  {
    id: "estrategista",
    name: "Estrategista",
    avatar: "mago",
    profile: { knowledge: 0.9, discipline: 0.9, focus: 0.8, health: 0.4, creativity: 0.4, wellbeing: 0.5 },
    description: "Seu padrão atual combina planejamento, consistência e busca por conhecimento.",
    tags: ["Analítico", "Disciplinado", "Visionário", "Aprendizado contínuo"],
  },
  {
    id: "explorador",
    name: "Explorador",
    avatar: "arqueiro",
    profile: { knowledge: 0.6, discipline: 0.5, focus: 0.5, health: 0.8, creativity: 0.8, wellbeing: 0.7 },
    description: "Seu padrão atual mistura movimento, curiosidade e experiências variadas.",
    tags: ["Curioso", "Ativo", "Adaptável", "Aberto ao novo"],
  },
  {
    id: "guardiao",
    name: "Guardião",
    avatar: "cavaleiro",
    profile: { knowledge: 0.4, discipline: 1, focus: 0.6, health: 0.8, creativity: 0.3, wellbeing: 0.7 },
    description: "Seu padrão atual se apoia em rotina firme, cuidado com o corpo e constância.",
    tags: ["Consistente", "Protetor da rotina", "Resiliente", "Confiável"],
  },
  {
    id: "erudito",
    name: "Erudito",
    avatar: "alquimista",
    profile: { knowledge: 1, discipline: 0.6, focus: 0.7, health: 0.3, creativity: 0.5, wellbeing: 0.4 },
    description: "Seu padrão atual concentra energia em estudo, leitura e aprofundamento.",
    tags: ["Estudioso", "Profundo", "Metódico", "Leitor"],
  },
  {
    id: "construtor",
    name: "Construtor",
    avatar: "inventor",
    profile: { knowledge: 0.5, discipline: 0.8, focus: 1, health: 0.4, creativity: 0.5, wellbeing: 0.4 },
    description: "Seu padrão atual é de execução: foco longo e entregas concretas.",
    tags: ["Executor", "Focado", "Prático", "Entregas"],
  },
  {
    id: "alquimista",
    name: "Alquimista",
    avatar: "alquimista",
    profile: { knowledge: 0.8, discipline: 0.4, focus: 0.6, health: 0.4, creativity: 0.9, wellbeing: 0.5 },
    description: "Seu padrão atual transforma conhecimento em experimentos e ideias novas.",
    tags: ["Experimental", "Inventivo", "Investigador", "Hipóteses"],
  },
  {
    id: "criador",
    name: "Criador",
    avatar: "aventureiro",
    profile: { knowledge: 0.5, discipline: 0.3, focus: 0.5, health: 0.4, creativity: 1, wellbeing: 0.7 },
    description: "Seu padrão atual dá espaço para criação, expressão e reflexão.",
    tags: ["Criativo", "Expressivo", "Reflexivo", "Original"],
  },
  {
    id: "equilibrado",
    name: "Equilibrado",
    avatar: "aventureiro",
    profile: { knowledge: 0.7, discipline: 0.7, focus: 0.7, health: 0.7, creativity: 0.7, wellbeing: 0.7 },
    description: "Seu padrão atual distribui energia de forma parecida entre todas as áreas.",
    tags: ["Versátil", "Harmônico", "Sustentável", "Completo"],
  },
];

export interface BuildPreset {
  id: string;
  name: string;
  targets: Record<AttributeKey, number>;
}

export const BUILD_PRESETS: BuildPreset[] = [
  { id: "equilibrado", name: "Explorador Equilibrado", targets: { knowledge: 70, discipline: 70, focus: 70, health: 70, creativity: 70, wellbeing: 70 } },
  { id: "estrategista", name: "Estrategista", targets: { knowledge: 85, discipline: 85, focus: 80, health: 60, creativity: 55, wellbeing: 60 } },
  { id: "explorador", name: "Explorador", targets: { knowledge: 70, discipline: 65, focus: 65, health: 80, creativity: 75, wellbeing: 75 } },
  { id: "guardiao", name: "Guardião", targets: { knowledge: 60, discipline: 90, focus: 70, health: 80, creativity: 50, wellbeing: 75 } },
  { id: "erudito", name: "Erudito", targets: { knowledge: 90, discipline: 75, focus: 80, health: 55, creativity: 60, wellbeing: 60 } },
  { id: "criador", name: "Criador", targets: { knowledge: 65, discipline: 60, focus: 65, health: 60, creativity: 90, wellbeing: 75 } },
];
export const DEFAULT_PRESET = BUILD_PRESETS[0];

/** Item aplicável à jornada (só é criado se o usuário confirmar no preview). */
export type PlanItem =
  | { kind: "habit"; name: string; category: string; frequency: "daily" | "times_per_week" | "weekly"; targetCount: number }
  | { kind: "task"; title: string; priority: "Baixa" | "Média" | "Alta"; dueInDays: number }
  | { kind: "open"; path: string };

export interface AttributeGuide {
  /** De onde vêm os pontos (texto para "o que falta registrar"). */
  sources: string;
  recommendation: string;
  actions: Array<{ id: string; label: string; item: PlanItem }>;
}

/** Recomendações gerais (sem orientação médica) por atributo abaixo da meta. */
export const ATTRIBUTE_GUIDES: Record<AttributeKey, AttributeGuide> = {
  knowledge: {
    sources: "leitura, educação, estudo e projetos acadêmicos",
    recommendation: "Reservar sessões curtas de leitura ou estudo ao longo da semana.",
    actions: [{ id: "knowledge-habit", label: "Contrato: leitura ou estudo 3x por semana", item: { kind: "habit", name: "Leitura ou estudo (30 min)", category: "estudo", frequency: "times_per_week", targetCount: 3 } }],
  },
  discipline: {
    sources: "contratos cumpridos, missões concluídas e revisões",
    recommendation: "Fechar a semana com uma revisão curta e manter missões com prazo.",
    actions: [{ id: "discipline-review", label: "Missão: fazer a revisão semanal", item: { kind: "task", title: "Fazer a revisão semanal", priority: "Média", dueInDays: 7 } }],
  },
  focus: {
    sources: "sessões de foco e missões de concentração",
    recommendation: "Proteger blocos de foco nos dias úteis.",
    // Foco vem das sessões registradas no modo Foco (não de hábitos).
    actions: [{ id: "focus-open", label: "Abrir Hoje para iniciar uma sessão de foco", item: { kind: "open", path: "/hoje" } }],
  },
  health: {
    sources: "hábitos de saúde (exercício, água, sono)",
    recommendation: "Adicionar 2 atividades físicas leves por semana e manter o registro de sono.",
    actions: [
      { id: "health-habit", label: "Contrato: atividade física leve 2x por semana", item: { kind: "habit", name: "Atividade física leve", category: "saude exercicio", frequency: "times_per_week", targetCount: 2 } },
      { id: "health-open", label: "Abrir Saúde para registrar o sono", item: { kind: "open", path: "/saude" } },
    ],
  },
  creativity: {
    sources: "Diário, experimentos e hábitos criativos",
    recommendation: "Reservar 30 minutos semanais para criação livre e registrar ideias no Diário.",
    actions: [
      { id: "creativity-habit", label: "Contrato: criar livremente 1x por semana", item: { kind: "habit", name: "Criar livremente (30 min)", category: "criatividade", frequency: "weekly", targetCount: 1 } },
      { id: "creativity-open", label: "Abrir o Diário para registrar ideias", item: { kind: "open", path: "/diario" } },
    ],
  },
  wellbeing: {
    sources: "Diário, revisões e hábitos de bem-estar",
    recommendation: "Fazer um check-in curto de humor e energia todos os dias.",
    actions: [{ id: "wellbeing-habit", label: "Contrato: check-in diário de humor e energia", item: { kind: "habit", name: "Check-in de humor e energia", category: "bem-estar", frequency: "daily", targetCount: 1 } }],
  },
};
