/**
 * Protocolos — catálogo central: categorias, tipos de ação, gatilhos e
 * templates globais. Templates são só leitura; o usuário adiciona uma
 * cópia à conta para personalizar. Nenhuma ação roda sem confirmação.
 */

export const PROTOCOL_CATEGORIES = [
  { id: "pessoal", label: "Pessoal" },
  { id: "produtividade", label: "Produtividade" },
  { id: "trabalho", label: "Trabalho" },
  { id: "saude", label: "Saúde" },
  { id: "academico", label: "Acadêmico" },
  { id: "habitos", label: "Hábitos" },
  { id: "planejamento", label: "Planejamento" },
  { id: "social", label: "Social" },
  { id: "bem-estar", label: "Bem-estar" },
  { id: "financas", label: "Finanças" },
  { id: "criatividade", label: "Criatividade" },
  { id: "digital", label: "Digital" },
] as const;
export type ProtocolCategory = (typeof PROTOCOL_CATEGORIES)[number]["id"];

export const PROTOCOL_ARTS = ["moon", "storm", "stage", "heart", "study", "sunrise", "map", "campfire", "meditate", "coins", "crystal", "digital"] as const;
export type ProtocolArt = (typeof PROTOCOL_ARTS)[number];

export const ACTION_TYPES = [
  "OPEN_SCREEN",
  "CREATE_TASK",
  "CREATE_HABIT",
  "ADJUST_CAPACITY",
  "SET_DAILY_PRIORITY",
  "ACTIVATE_RECOVERY",
  "ADD_REMINDER",
  "START_FOCUS",
  "SHOW_INSTRUCTION",
  "CHECKLIST",
  "DEFER_TASK",
  "CUSTOM",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

/**
 * auto: não altera dados (navegação) — roda ao confirmar;
 * suggested: altera dados — só roda se o usuário marcar no preview;
 * manual: é o usuário quem faz; o LifeOS só registra quando ele marcar.
 */
export type ActionMode = "auto" | "suggested" | "manual";
export const ACTION_MODE: Record<ActionType, ActionMode> = {
  OPEN_SCREEN: "auto",
  START_FOCUS: "auto",
  CREATE_TASK: "suggested",
  CREATE_HABIT: "suggested",
  ADJUST_CAPACITY: "suggested",
  SET_DAILY_PRIORITY: "suggested",
  ACTIVATE_RECOVERY: "suggested",
  ADD_REMINDER: "suggested",
  DEFER_TASK: "suggested",
  SHOW_INSTRUCTION: "manual",
  CHECKLIST: "manual",
  CUSTOM: "manual",
};

export const ACTION_LABEL: Record<ActionType, string> = {
  OPEN_SCREEN: "Abrir tela",
  CREATE_TASK: "Criar missão",
  CREATE_HABIT: "Criar contrato",
  ADJUST_CAPACITY: "Reduzir carga do dia",
  SET_DAILY_PRIORITY: "Definir missão principal",
  ACTIVATE_RECOVERY: "Ativar modo recuperação",
  ADD_REMINDER: "Criar lembrete",
  START_FOCUS: "Iniciar foco",
  SHOW_INSTRUCTION: "Instrução",
  CHECKLIST: "Checklist",
  DEFER_TASK: "Adiar missões",
  CUSTOM: "Passo livre",
};

/** Telas que um protocolo pode abrir (lista fechada — nada de URL arbitrária). */
export const OPEN_SCREEN_PATHS = ["/hoje", "/inbox", "/tarefas", "/contratos", "/saude", "/diario", "/capacity-planner", "/calendario", "/revisoes", "/weekly-review", "/notas", "/metas", "/educacao", "/biblioteca", "/signals", "/build", "/protocolos"] as const;

export interface StepDef {
  title: string;
  description?: string;
  actionType: ActionType;
  config?: Record<string, unknown>;
  optional?: boolean;
  minutes?: number;
}

/** Métricas de contexto (todas lidas de dados reais; ausentes = gatilho não avaliado). */
export const TRIGGER_METRICS = [
  { id: "sleep_hours", label: "Horas de sono (última noite)", unit: "h" },
  { id: "energy", label: "Energia (último registro, 1–5)", unit: "" },
  { id: "overdue_tasks", label: "Missões atrasadas", unit: "" },
  { id: "capacity_pct", label: "Carga do dia (Capacity Planner)", unit: "%" },
  { id: "tasks_due_today", label: "Missões com prazo hoje", unit: "" },
  { id: "events_tomorrow", label: "Compromissos amanhã", unit: "" },
] as const;
export type TriggerMetric = (typeof TRIGGER_METRICS)[number]["id"];

export type Trigger =
  | { type: "manual" }
  | { type: "data"; metric: TriggerMetric; op: "lt" | "lte" | "gt" | "gte"; value: number }
  | { type: "time"; weekday: number }
  | { type: "event"; metric: "events_tomorrow"; min: number };

export interface ProtocolSettings {
  suggestAuto: boolean;
  showToday: boolean;
  showOracle: boolean;
}
export const DEFAULT_SETTINGS: ProtocolSettings = { suggestAuto: true, showToday: true, showOracle: false };

export interface TemplateDef {
  key: string;
  name: string;
  description: string;
  category: ProtocolCategory;
  triggerDescription: string;
  trigger: Trigger;
  art: ProtocolArt;
  steps: StepDef[];
}

export const PROTOCOL_TEMPLATES: TemplateDef[] = [
  {
    key: "dormi-mal",
    name: "Dormi mal",
    description: "Ajusta o dia quando o sono não foi suficiente.",
    category: "pessoal",
    triggerDescription: "Quando o sono foi menor que 6h30.",
    trigger: { type: "data", metric: "sleep_hours", op: "lt", value: 6.5 },
    art: "moon",
    steps: [
      { title: "Reduzir a carga do dia em 20%", actionType: "ADJUST_CAPACITY", config: { reducePct: 20 }, minutes: 2 },
      { title: "Adiar missões de alta complexidade", actionType: "DEFER_TASK", config: { scope: "deep_work" }, minutes: 2 },
      { title: "Caminhada leve de 15 minutos", actionType: "CUSTOM", minutes: 15 },
      { title: "Escolher a missão principal do dia", actionType: "SET_DAILY_PRIORITY", minutes: 1 },
      { title: "Ativar modo recuperação à noite", actionType: "ACTIVATE_RECOVERY", minutes: 1 },
    ],
  },
  {
    key: "sobrecarregado",
    name: "Estou sobrecarregado",
    description: "Recupera o controle quando a carga passa do limite.",
    category: "produtividade",
    triggerDescription: "Quando a carga do dia passa de 100%.",
    trigger: { type: "data", metric: "capacity_pct", op: "gt", value: 100 },
    art: "storm",
    steps: [
      { title: "Respirar e anotar tudo que está pendente", actionType: "SHOW_INSTRUCTION", config: { text: "Esvazie a cabeça: anote rapidamente tudo que está te pressionando." }, minutes: 5 },
      { title: "Reduzir a carga do dia em 30%", actionType: "ADJUST_CAPACITY", config: { reducePct: 30 }, minutes: 2 },
      { title: "Definir uma única missão principal", actionType: "SET_DAILY_PRIORITY", minutes: 1 },
      { title: "Abrir o Capacity Planner", actionType: "OPEN_SCREEN", config: { path: "/capacity-planner" }, optional: true, minutes: 3 },
      { title: "Bloco de foco de 25 minutos", actionType: "START_FOCUS", config: { minutes: 25 }, optional: true, minutes: 25 },
      { title: "Pausa curta sem telas", actionType: "CUSTOM", minutes: 10 },
    ],
  },
  {
    key: "apresentacao",
    name: "Dia de apresentação",
    description: "Preparação para reuniões, defesas e apresentações.",
    category: "trabalho",
    triggerDescription: "Quando há compromisso importante amanhã.",
    trigger: { type: "event", metric: "events_tomorrow", min: 1 },
    art: "stage",
    steps: [
      { title: "Revisar o roteiro em voz alta", actionType: "CHECKLIST", config: { items: ["Abertura", "3 pontos principais", "Fechamento"] }, minutes: 20 },
      { title: "Criar missão de ensaio final", actionType: "CREATE_TASK", config: { title: "Ensaio final da apresentação", priority: "Alta", dueInDays: 0 }, minutes: 1 },
      { title: "Adiar missões não urgentes", actionType: "DEFER_TASK", config: { scope: "low" }, minutes: 2 },
      { title: "Separar materiais e conferir equipamentos", actionType: "CUSTOM", minutes: 10 },
      { title: "Lembrete para dormir cedo", actionType: "ADD_REMINDER", config: { time: "22:00", title: "Desligar telas e dormir cedo" }, minutes: 1 },
      { title: "Abrir a agenda", actionType: "OPEN_SCREEN", config: { path: "/calendario" }, optional: true, minutes: 1 },
      { title: "Chegar 10 minutos antes", actionType: "SHOW_INSTRUCTION", config: { text: "Planeje o trajeto para chegar com folga." }, minutes: 1 },
    ],
  },
  {
    key: "recuperacao-ativa",
    name: "Recuperação ativa",
    description: "Quando energia e motivação estão baixas.",
    category: "saude",
    triggerDescription: "Quando a energia registrada está em 2 ou menos.",
    trigger: { type: "data", metric: "energy", op: "lte", value: 2 },
    art: "heart",
    steps: [
      { title: "Ativar modo recuperação hoje", actionType: "ACTIVATE_RECOVERY", minutes: 1 },
      { title: "Reduzir a carga do dia em 20%", actionType: "ADJUST_CAPACITY", config: { reducePct: 20 }, minutes: 2 },
      { title: "Beber água e comer algo leve", actionType: "CUSTOM", minutes: 5 },
      { title: "Alongamento ou caminhada de 10 minutos", actionType: "CUSTOM", minutes: 10 },
      { title: "Registrar humor e energia", actionType: "OPEN_SCREEN", config: { path: "/saude" }, minutes: 2 },
      { title: "Lembrete de descanso à noite", actionType: "ADD_REMINDER", config: { time: "21:30", title: "Recuperação: desacelerar e descansar" }, minutes: 1 },
    ],
  },
  {
    key: "revisao-prova",
    name: "Revisão de prova",
    description: "Quando preciso estudar de forma eficiente.",
    category: "academico",
    triggerDescription: "Manual — antes de provas e entregas.",
    trigger: { type: "manual" },
    art: "study",
    steps: [
      { title: "Listar os tópicos que mais caem", actionType: "CHECKLIST", config: { items: ["Tópicos da ementa", "Exercícios anteriores", "Dúvidas"] }, minutes: 15 },
      { title: "Criar missão de revisão", actionType: "CREATE_TASK", config: { title: "Revisão para a prova", priority: "Alta", dueInDays: 0 }, minutes: 1 },
      { title: "Bloco de foco de 50 minutos", actionType: "START_FOCUS", config: { minutes: 50 }, minutes: 50 },
      { title: "Resolver exercícios sem consultar", actionType: "CUSTOM", minutes: 30 },
      { title: "Revisar erros e anotar", actionType: "CUSTOM", minutes: 15 },
      { title: "Definir a revisão como missão principal", actionType: "SET_DAILY_PRIORITY", minutes: 1 },
      { title: "Abrir Educação", actionType: "OPEN_SCREEN", config: { path: "/educacao" }, optional: true, minutes: 1 },
      { title: "Lembrete para dormir no horário", actionType: "ADD_REMINDER", config: { time: "22:30", title: "Dormir: memória consolida durante o sono" }, minutes: 1 },
    ],
  },
  {
    key: "reiniciar-habito",
    name: "Reiniciar um hábito",
    description: "Quando quebrei uma sequência.",
    category: "habitos",
    triggerDescription: "Manual — depois de perder uma sequência.",
    trigger: { type: "manual" },
    art: "sunrise",
    steps: [
      { title: "Lembrar: uma falha não apaga o progresso", actionType: "SHOW_INSTRUCTION", config: { text: "Sua história continua registrada. O próximo passo é só recomeçar." }, minutes: 1 },
      { title: "Abrir Contratos", actionType: "OPEN_SCREEN", config: { path: "/contratos" }, minutes: 2 },
      { title: "Reduzir a meta pela metade por uma semana", actionType: "CUSTOM", minutes: 2 },
      { title: "Fazer a versão mínima hoje", actionType: "CUSTOM", minutes: 5 },
      { title: "Lembrete para amanhã", actionType: "ADD_REMINDER", config: { time: "08:00", title: "Contrato: versão mínima do hábito" }, minutes: 1 },
    ],
  },
  {
    key: "inicio-semana",
    name: "Início da semana",
    description: "Ritual de planejamento semanal e definição de foco.",
    category: "planejamento",
    triggerDescription: "Toda segunda-feira.",
    trigger: { type: "time", weekday: 1 },
    art: "map",
    steps: [
      { title: "Revisar a semana anterior", actionType: "OPEN_SCREEN", config: { path: "/weekly-review" }, minutes: 10 },
      { title: "Escolher 3 resultados da semana", actionType: "CHECKLIST", config: { items: ["Resultado 1", "Resultado 2", "Resultado 3"] }, minutes: 10 },
      { title: "Abrir Missões e distribuir prazos", actionType: "OPEN_SCREEN", config: { path: "/tarefas" }, minutes: 10 },
      { title: "Conferir a agenda", actionType: "OPEN_SCREEN", config: { path: "/calendario" }, minutes: 5 },
      { title: "Definir a missão principal de hoje", actionType: "SET_DAILY_PRIORITY", minutes: 1 },
      { title: "Checar a carga no Capacity Planner", actionType: "OPEN_SCREEN", config: { path: "/capacity-planner" }, optional: true, minutes: 3 },
      { title: "Bloco de foco de abertura", actionType: "START_FOCUS", config: { minutes: 25 }, optional: true, minutes: 25 },
      { title: "Lembrete de revisão na sexta", actionType: "CREATE_TASK", config: { title: "Revisão da semana", priority: "Média", dueInDays: 4 }, minutes: 1 },
      { title: "Separar um horário para descanso", actionType: "CUSTOM", minutes: 2 },
    ],
  },
  {
    key: "evento-social",
    name: "Evento social",
    description: "Quando tenho um compromisso e quero me preparar melhor.",
    category: "social",
    triggerDescription: "Manual — antes de encontros e eventos.",
    trigger: { type: "manual" },
    art: "campfire",
    steps: [
      { title: "Confirmar horário e local", actionType: "CUSTOM", minutes: 2 },
      { title: "Adiar missões de baixa prioridade", actionType: "DEFER_TASK", config: { scope: "low" }, minutes: 2 },
      { title: "Lembrete para sair a tempo", actionType: "ADD_REMINDER", config: { time: "18:30", title: "Sair para o evento" }, minutes: 1 },
      { title: "Separar o que levar", actionType: "CHECKLIST", config: { items: ["Documento", "Carregador", "Presente ou contribuição"] }, minutes: 5 },
      { title: "Estar presente: celular no bolso", actionType: "SHOW_INSTRUCTION", config: { text: "Aproveite o momento — notificações podem esperar." }, minutes: 1 },
      { title: "Registrar como foi no Diário", actionType: "OPEN_SCREEN", config: { path: "/diario" }, optional: true, minutes: 5 },
    ],
  },
  {
    key: "ansiedade-estresse",
    name: "Ansiedade e estresse",
    description: "Técnicas para acalmar a mente e recuperar o foco.",
    category: "bem-estar",
    triggerDescription: "Manual — quando a pressão aumenta.",
    trigger: { type: "manual" },
    art: "meditate",
    steps: [
      { title: "Respiração 4-7-8 por 3 ciclos", actionType: "SHOW_INSTRUCTION", config: { text: "Inspire 4s, segure 7s, solte 8s. Repita 3 vezes." }, minutes: 3 },
      { title: "Nomear o que está preocupando", actionType: "CUSTOM", minutes: 5 },
      { title: "Separar o que depende de você", actionType: "CHECKLIST", config: { items: ["Depende de mim", "Não depende de mim"] }, minutes: 5 },
      { title: "Reduzir a carga do dia em 20%", actionType: "ADJUST_CAPACITY", config: { reducePct: 20 }, optional: true, minutes: 2 },
      { title: "Caminhada curta ao ar livre", actionType: "CUSTOM", minutes: 10 },
      { title: "Registrar no Diário", actionType: "OPEN_SCREEN", config: { path: "/diario" }, optional: true, minutes: 5 },
      { title: "Se persistir, procure apoio de alguém de confiança ou de um profissional", actionType: "SHOW_INSTRUCTION", config: { text: "Você não precisa resolver tudo sozinho." }, minutes: 1 },
    ],
  },
  {
    key: "organizar-financas",
    name: "Organizar finanças",
    description: "Quando preciso revisar gastos e planejar o próximo mês.",
    category: "financas",
    triggerDescription: "Manual — no fim de cada mês.",
    trigger: { type: "manual" },
    art: "coins",
    steps: [
      { title: "Separar extratos e faturas", actionType: "CHECKLIST", config: { items: ["Conta corrente", "Cartão", "Contas fixas"] }, minutes: 10 },
      { title: "Classificar gastos do mês", actionType: "CUSTOM", minutes: 20 },
      { title: "Definir limite para o próximo mês", actionType: "CUSTOM", minutes: 10 },
      { title: "Criar missão de pagamento de contas", actionType: "CREATE_TASK", config: { title: "Pagar contas do mês", priority: "Alta", dueInDays: 3 }, minutes: 1 },
      { title: "Abrir Metas para registrar o objetivo", actionType: "OPEN_SCREEN", config: { path: "/metas" }, optional: true, minutes: 2 },
      { title: "Lembrete de revisão no próximo mês", actionType: "ADD_REMINDER", config: { time: "20:00", title: "Revisar finanças" }, optional: true, minutes: 1 },
    ],
  },
  {
    key: "bloqueio-criativo",
    name: "Bloqueio criativo",
    description: "Quando estou sem ideias e preciso destravar.",
    category: "criatividade",
    triggerDescription: "Manual — quando a criação travar.",
    trigger: { type: "manual" },
    art: "crystal",
    steps: [
      { title: "Trocar de ambiente por 10 minutos", actionType: "CUSTOM", minutes: 10 },
      { title: "Escrever 10 ideias ruins de propósito", actionType: "SHOW_INSTRUCTION", config: { text: "Quantidade antes de qualidade: tire o peso da primeira ideia." }, minutes: 10 },
      { title: "Abrir Notas para capturar ideias", actionType: "OPEN_SCREEN", config: { path: "/notas" }, minutes: 5 },
      { title: "Bloco de criação de 25 minutos", actionType: "START_FOCUS", config: { minutes: 25 }, optional: true, minutes: 25 },
      { title: "Escolher uma ideia para testar", actionType: "CUSTOM", minutes: 5 },
    ],
  },
  {
    key: "limpeza-digital",
    name: "Limpeza digital",
    description: "Quando preciso organizar arquivos, e-mails e notificações.",
    category: "digital",
    triggerDescription: "Manual — uma vez por mês.",
    trigger: { type: "manual" },
    art: "digital",
    steps: [
      { title: "Esvaziar a caixa de entrada", actionType: "OPEN_SCREEN", config: { path: "/inbox" }, minutes: 15 },
      { title: "Silenciar notificações desnecessárias", actionType: "CUSTOM", minutes: 10 },
      { title: "Organizar a área de trabalho e downloads", actionType: "CHECKLIST", config: { items: ["Área de trabalho", "Downloads", "Fotos"] }, minutes: 15 },
      { title: "Criar missão de backup", actionType: "CREATE_TASK", config: { title: "Fazer backup dos arquivos", priority: "Média", dueInDays: 2 }, minutes: 1 },
      { title: "Revisar assinaturas", actionType: "CUSTOM", minutes: 10 },
      { title: "Lembrete para repetir no mês que vem", actionType: "ADD_REMINDER", config: { time: "19:00", title: "Limpeza digital" }, optional: true, minutes: 1 },
    ],
  },
];

export const templateByKey = (key: string) => PROTOCOL_TEMPLATES.find((t) => t.key === key) ?? null;
