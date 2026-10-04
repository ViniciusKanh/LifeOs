/**
 * Catálogo central do Códex da Jornada. Tudo que é regra do Códex mora
 * aqui: atributos, como o XP do ledger é CLASSIFICADO (nunca criado),
 * curva de nível de atributo, relíquias, títulos, conhecimentos e
 * classes. Relíquias, títulos e classes são puramente cosméticos.
 */

export const ATTRIBUTES = ["focus", "health", "knowledge", "discipline", "creativity", "wellbeing"] as const;
export type AttributeKey = (typeof ATTRIBUTES)[number];
export type Distribution = Partial<Record<AttributeKey, number>>;

export const ATTRIBUTE_META: Record<AttributeKey, { label: string; description: string }> = {
  focus: { label: "Foco", description: "Capacidade de manter sua atenção no que realmente importa." },
  health: { label: "Saúde", description: "Energia e vitalidade para uma vida longa e sustentável." },
  knowledge: { label: "Conhecimento", description: "Busca por aprendizado contínuo e sabedoria prática." },
  discipline: { label: "Disciplina", description: "Consistência para fazer o que deve ser feito, sempre." },
  creativity: { label: "Criatividade", description: "Capacidade de criar, inovar e enxergar novas possibilidades." },
  wellbeing: { label: "Bem-estar", description: "Equilíbrio emocional e paz para uma mente clara." },
};

/**
 * Mapeamento auditável: origem do XP → distribuição entre atributos
 * (soma = 1). Vale também para o histórico: a classificação é derivada
 * da origem já registrada em cada xp_event, não de suposição.
 */
export const attributeMappings = {
  TASK_DEFAULT: { discipline: 0.7, focus: 0.3 },
  TASK_ACADEMIC: { knowledge: 0.5, focus: 0.3, discipline: 0.2 },
  TASK_PROFESSIONAL: { focus: 0.5, discipline: 0.5 },
  DAY_BONUS: { discipline: 1 },
  FOCUS_SESSION: { focus: 0.8, discipline: 0.2 },
  HABIT_HEALTH: { health: 0.8, discipline: 0.2 },
  HABIT_KNOWLEDGE: { knowledge: 0.7, discipline: 0.3 },
  HABIT_WELLBEING: { wellbeing: 0.7, discipline: 0.3 },
  HABIT_CREATIVITY: { creativity: 0.7, discipline: 0.3 },
  HABIT_DEFAULT: { discipline: 1 },
  HABIT_STREAK: { discipline: 1 },
  JOURNAL_ENTRY: { wellbeing: 0.6, creativity: 0.4 },
  REVIEW: { discipline: 0.6, wellbeing: 0.4 },
  EXPERIMENT: { creativity: 0.6, knowledge: 0.4 },
  LIFE_ADMIN: { discipline: 1 },
  PROJECT: { discipline: 0.5, focus: 0.5 },
  CAMPAIGN: { discipline: 0.5, focus: 0.3, knowledge: 0.2 },
  CONTRACT: { discipline: 0.6, focus: 0.4 },
  ACHIEVEMENT: {
    missoes: { discipline: 0.6, focus: 0.4 },
    habitos: { discipline: 1 },
    leitura: { knowledge: 1 },
    saude: { health: 1 },
    foco: { focus: 1 },
    revisoes: { discipline: 0.5, wellbeing: 0.5 },
    metas: { discipline: 1 },
    educacao: { knowledge: 1 },
    experimentos: { creativity: 0.6, knowledge: 0.4 },
    outros: { discipline: 1 },
  } as Record<string, Distribution>,
} satisfies Record<string, Distribution | Record<string, Distribution>>;

/** Palavras que classificam um hábito pelo nome/categoria (regra explícita e auditável). */
export const HABIT_KEYWORDS: Array<{ mapping: keyof typeof attributeMappings; words: string[] }> = [
  { mapping: "HABIT_HEALTH", words: ["saude", "saúde", "exerc", "treino", "academia", "corr", "caminh", "agua", "água", "sono", "dormir", "aliment", "alongar", "yoga"] },
  { mapping: "HABIT_KNOWLEDGE", words: ["ler", "leitura", "estud", "curso", "idioma", "ingl", "artigo", "aprend", "revisar conteúdo"] },
  { mapping: "HABIT_WELLBEING", words: ["medit", "respir", "gratid", "humor", "terapia", "descans", "bem-estar", "bem estar", "orar", "ora"] },
  { mapping: "HABIT_CREATIVITY", words: ["escrev", "desenh", "music", "música", "pint", "criar", "ideia", "compor", "foto"] },
];

/** XP necessário para ALCANÇAR cada nível de atributo (Nv. 1 = 0). Depois do último, +1000 por nível. */
export const ATTRIBUTE_LEVEL_THRESHOLDS = [0, 100, 250, 600, 1000, 1500, 2100, 2800, 3600, 4500];

export const codexConfig = {
  /** Janela da tendência: últimos N dias × N dias anteriores. */
  trendDays: 30,
  /** Referência para normalizar atributos na sinergia (0–100). */
  synergyReferenceXp: 1000,
  /** Desvio-padrão que zera o fator de equilíbrio. */
  synergyStdCap: 50,
};

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

/** Condição de desbloqueio (avaliada no servidor, sobre dados reais). */
export type UnlockRule =
  | { type: "global_level"; min: number }
  | { type: "attribute_xp"; attribute: AttributeKey; min: number }
  | { type: "xp_source_count"; source: string; min: number; eventType?: string }
  | { type: "tasks_done"; min: number }
  | { type: "campaigns_completed"; min: number }
  | { type: "habit_streak_days"; min: number }
  | { type: "all"; rules: UnlockRule[] };

export interface RelicDef { id: string; name: string; description: string; rarity: Rarity; obtainedBy: string; rule: UnlockRule }
export const RELICS: RelicDef[] = [
  { id: "ampulheta", name: "Ampulheta do Foco", description: "Areia que só corre quando a atenção está inteira.", rarity: "rare", obtainedBy: "10 sessões de foco registradas", rule: { type: "xp_source_count", source: "focus", min: 10 } },
  { id: "bussola", name: "Bússola da Consistência", description: "Aponta sempre para o próximo passo certo.", rarity: "epic", obtainedBy: "4 revisões semanais fechadas", rule: { type: "xp_source_count", source: "review", min: 4 } },
  { id: "cristal", name: "Cristal do Conhecimento", description: "Brilha mais a cada página e aula concluída.", rarity: "rare", obtainedBy: "Conhecimento com 250 XP", rule: { type: "attribute_xp", attribute: "knowledge", min: 250 } },
  { id: "broto", name: "Broto da Vitalidade", description: "Cresce com cada hábito de saúde cumprido.", rarity: "common", obtainedBy: "Saúde com 100 XP", rule: { type: "attribute_xp", attribute: "health", min: 100 } },
  { id: "grimorio", name: "Grimório das Crônicas", description: "Guarda as páginas da sua história.", rarity: "rare", obtainedBy: "15 crônicas no Diário", rule: { type: "xp_source_count", source: "journal", min: 15 } },
  { id: "estandarte", name: "Estandarte da Campanha", description: "Hasteado ao fim de uma grande jornada.", rarity: "epic", obtainedBy: "Concluir uma campanha da Forja", rule: { type: "campaigns_completed", min: 1 } },
  { id: "frasco", name: "Frasco do Alquimista", description: "Contém a essência de uma hipótese comprovada.", rarity: "uncommon", obtainedBy: "Concluir um experimento com conclusão escrita", rule: { type: "xp_source_count", source: "experiment", eventType: "concluded", min: 1 } },
  { id: "coroa", name: "Coroa do Viajante", description: "Reservada a quem caminhou longe.", rarity: "legendary", obtainedBy: "Alcançar o nível 10", rule: { type: "global_level", min: 10 } },
];

export interface TitleDef { id: string; name: string; description: string; rarity: Rarity; rule: UnlockRule }
/** Inclui os títulos por nível que já existiam (mesmos ids) + títulos por feitos. */
export const TITLES: TitleDef[] = [
  { id: "aprendiz", name: "Aprendiz da Jornada", description: "Todo herói começa aqui.", rarity: "common", rule: { type: "global_level", min: 1 } },
  { id: "explorador", name: "Explorador", description: "Já conhece o caminho.", rarity: "common", rule: { type: "global_level", min: 3 } },
  { id: "estrategista", name: "Estrategista", description: "Planeja antes de agir.", rarity: "uncommon", rule: { type: "global_level", min: 5 } },
  { id: "guardiao", name: "Guardião da Rotina", description: "Mantém a consistência viva.", rarity: "legendary", rule: { type: "all", rules: [{ type: "habit_streak_days", min: 30 }, { type: "attribute_xp", attribute: "discipline", min: 600 }] } },
  { id: "mestre-missoes", name: "Mestre das Missões", description: "Conclui o que começa.", rarity: "epic", rule: { type: "tasks_done", min: 100 } },
  { id: "alquimista-foco", name: "Alquimista do Foco", description: "Transforma intenção em ação.", rarity: "rare", rule: { type: "all", rules: [{ type: "xp_source_count", source: "focus", min: 20 }, { type: "xp_source_count", source: "experiment", eventType: "concluded", min: 1 }] } },
  { id: "mestre", name: "Mestre da Consistência", description: "Doze níveis de constância.", rarity: "epic", rule: { type: "global_level", min: 12 } },
  { id: "lenda", name: "Lenda da Jornada", description: "Seu nome já é história.", rarity: "legendary", rule: { type: "global_level", min: 20 } },
];

export interface KnowledgeDef {
  id: string;
  title: string;
  category: string;
  attribute: AttributeKey;
  summary: string;
  content: string[];
  /** Limite de XP do atributo (nunca gasto) OU custo em moedas (opcional). */
  unlock: { type: "attribute_xp"; min: number } | { type: "coins"; cost: number };
}
export const KNOWLEDGE: KnowledgeDef[] = [
  {
    id: "life-score",
    title: "Como interpretar seu Life Score",
    category: "Fundamentos",
    attribute: "discipline",
    summary: "Entenda o que move cada dimensão do Life Score.",
    unlock: { type: "attribute_xp", min: 50 },
    content: [
      "O Life Score resume sete dimensões (produtividade, saúde, hábitos, metas, leitura, educação e profissional) a partir dos seus registros reais.",
      "Ele mede equilíbrio, não esforço bruto: uma semana só de tarefas não compensa ausência de saúde e hábitos.",
      "Use a dimensão mais baixa como pista do próximo ajuste — não como julgamento.",
    ],
  },
  {
    id: "revisao-semanal",
    title: "Estratégias de Revisão Semanal",
    category: "Produtividade",
    attribute: "discipline",
    summary: "Aprenda métodos para revisar sua semana e ajustar sua rota com mais clareza.",
    unlock: { type: "coins", cost: 50 },
    content: [
      "Separe 20 minutos fixos: olhe o que foi concluído antes de olhar o que faltou.",
      "Pergunte: o que deu energia, o que drenou energia e o que vou repetir?",
      "Escolha no máximo três prioridades para a próxima semana e ligue cada uma a uma tarefa concreta.",
    ],
  },
  {
    id: "foco-profundo",
    title: "Técnicas de Foco Profundo",
    category: "Foco",
    attribute: "focus",
    summary: "Blocos de foco, pausas e proteção contra interrupções.",
    unlock: { type: "attribute_xp", min: 250 },
    content: [
      "Trabalhe em blocos de 25 a 50 minutos com uma única tarefa definida antes de começar.",
      "Anote distrações num papel em vez de agir sobre elas durante o bloco.",
      "Registre a produtividade percebida ao fim da sessão — o LifeOS usa isso para descobrir seus melhores horários.",
    ],
  },
  {
    id: "habitos-sustentaveis",
    title: "Construindo hábitos sustentáveis",
    category: "Disciplina",
    attribute: "discipline",
    summary: "Comece pequeno, ancore em rotinas e proteja a sequência.",
    unlock: { type: "attribute_xp", min: 250 },
    content: [
      "Comece com uma versão do hábito que leve menos de dois minutos.",
      "Ancore o hábito em algo que você já faz (depois do café, antes de dormir).",
      "Se falhar um dia, retome no seguinte: duas falhas seguidas é que quebram o padrão.",
    ],
  },
  {
    id: "energia-pessoal",
    title: "Mapa de Energia Pessoal",
    category: "Bem-estar",
    attribute: "wellbeing",
    summary: "Use humor, sono e energia para planejar o dia certo para cada tarefa.",
    unlock: { type: "attribute_xp", min: 100 },
    content: [
      "Registre humor e energia por algumas semanas antes de tirar conclusões.",
      "Coloque tarefas exigentes nos períodos em que sua energia costuma ser maior.",
      "Dias de energia baixa servem para tarefas administrativas e recuperação.",
    ],
  },
  {
    id: "aprendizado-ativo",
    title: "Aprendizado ativo",
    category: "Conhecimento",
    attribute: "knowledge",
    summary: "Ler não basta: resuma, conecte e aplique.",
    unlock: { type: "attribute_xp", min: 600 },
    content: [
      "Depois de cada sessão de estudo, escreva três frases do que aprendeu sem consultar o material.",
      "Conecte o conteúdo novo a uma nota existente.",
      "Transforme uma ideia em ação na mesma semana.",
    ],
  },
];

/** Classes da rotina: arquétipos cosméticos sugeridos pelos 2 atributos mais fortes. */
export interface ClassDef { id: string; name: string; description: string; attributes: [AttributeKey, AttributeKey] }
export const CLASSES: ClassDef[] = [
  { id: "estrategista", name: "Estrategista", description: "Foco e disciplina altos: transforma planos em entregas.", attributes: ["focus", "discipline"] },
  { id: "estudioso", name: "Estudioso", description: "Conhecimento e foco: aprende com profundidade.", attributes: ["knowledge", "focus"] },
  { id: "guardiao", name: "Guardião", description: "Disciplina e saúde: protege a rotina e a energia.", attributes: ["discipline", "health"] },
  { id: "alquimista", name: "Alquimista", description: "Criatividade e conhecimento: testa ideias e aprende com elas.", attributes: ["creativity", "knowledge"] },
  { id: "explorador", name: "Explorador", description: "Criatividade e bem-estar: busca novas experiências com leveza.", attributes: ["creativity", "wellbeing"] },
  { id: "construtor", name: "Construtor", description: "Disciplina e conhecimento: ergue projetos sólidos tijolo a tijolo.", attributes: ["discipline", "knowledge"] },
  { id: "druida", name: "Druida", description: "Saúde e bem-estar: cuida do corpo e da mente em harmonia.", attributes: ["health", "wellbeing"] },
];

/** Área da vida (LIFE_AREAS) → atributo mais relacionado. */
export const AREA_ATTRIBUTE: Record<string, AttributeKey> = {
  saude: "health",
  carreira: "focus",
  financas: "discipline",
  relacionamentos: "wellbeing",
  familia: "wellbeing",
  desenvolvimento: "knowledge",
  lazer: "creativity",
  espiritualidade: "wellbeing",
};
