/**
 * Catálogo oficial da Árvore de Habilidades (versionado em código).
 *
 * - 6 ramos × 8 habilidades + 4 habilidades avançadas multirramo = 52 habilidades.
 * - Cada habilidade tem até 5 níveis; cada nível define custo em PH, nível mínimo do
 *   herói, evidência real (métrica calculada dos registros) e os EFEITOS que libera.
 * - Pré-requisitos: lista de GRUPOS. Todos os grupos são obrigatórios (E); dentro de um
 *   grupo basta uma opção (OU). A visualização desenha exatamente essas arestas.
 * - Efeitos liberam recursos opcionais (modelos, presets, rituais, análises, títulos).
 *   NUNCA alteram métricas reais (Life Score, sono, conclusão, hábitos, estudos).
 */

export const SKILL_TREE_VERSION = 1;

export type BranchKey = "produtividade" | "saude" | "aprendizado" | "foco" | "gestao" | "bemestar" | "avancada";
export const BRANCHES: Array<{ key: BranchKey; label: string; tone: string; theme: string; angle: number }> = [
  { key: "saude", label: "Saúde", tone: "pink", theme: "Autocuidado e acompanhamento de hábitos saudáveis.", angle: -204 },
  { key: "bemestar", label: "Bem-estar", tone: "cyan", theme: "Equilíbrio pessoal e sustentabilidade da rotina.", angle: -160 },
  { key: "aprendizado", label: "Aprendizado", tone: "purple", theme: "Educação, conhecimento e retenção.", angle: -116 },
  { key: "foco", label: "Foco", tone: "red", theme: "Concentração e gerenciamento do tempo.", angle: -64 },
  { key: "produtividade", label: "Produtividade", tone: "blue", theme: "Execução, organização e consistência.", angle: -20 },
  { key: "gestao", label: "Gestão", tone: "green", theme: "Metas, projetos, contratos e planejamento.", angle: 24 },
  { key: "avancada", label: "Avançadas", tone: "gold", theme: "Especializações que unem dois caminhos.", angle: 90 },
];
export const CORE_BRANCHES = BRANCHES.filter((b) => b.key !== "avancada").map((b) => b.key);

/* ───────────────────────────── evidências reais ───────────────────────────── */

export type EvidenceMetric =
  | "tasks_done" | "tasks_on_time" | "tasks_planned" | "habit_checkins" | "habit_best_streak" | "habits_streak_14" | "habits_streak_30"
  | "water_days" | "workouts" | "workout_weeks" | "sleep_logs" | "mood_logs" | "recovery_days" | "journal_days" | "gratitude_days"
  | "pages_read" | "books_finished" | "study_minutes" | "study_days" | "flashcard_reviews" | "focus_minutes" | "focus_sessions"
  | "deep_sessions" | "focus_days" | "goals_created" | "goals_done" | "projects_created" | "projects_done" | "contracts_done"
  | "campaigns_done" | "weekly_plans_sealed" | "reviews_sealed" | "events_planned";

export const EVIDENCE_META: Record<EvidenceMetric, { label: (n: number) => string; module: string; route: string }> = {
  tasks_done: { label: (n) => `Concluir ${n} missões`, module: "Missões", route: "/tarefas" },
  tasks_on_time: { label: (n) => `Concluir ${n} missões dentro do prazo`, module: "Missões", route: "/tarefas" },
  tasks_planned: { label: (n) => `Planejar ${n} missões com prazo`, module: "Missões", route: "/tarefas" },
  habit_checkins: { label: (n) => `Registrar ${n} check-ins de hábitos`, module: "Hábitos", route: "/habitos" },
  habit_best_streak: { label: (n) => `Manter um hábito por ${n} dias seguidos`, module: "Hábitos", route: "/habitos" },
  habits_streak_14: { label: (n) => `Manter ${n} hábito(s) por 14 dias seguidos`, module: "Hábitos", route: "/habitos" },
  habits_streak_30: { label: (n) => `Manter ${n} hábito(s) por 30 dias seguidos`, module: "Hábitos", route: "/habitos" },
  water_days: { label: (n) => `Registrar água em ${n} dias`, module: "Saúde", route: "/saude" },
  workouts: { label: (n) => `Registrar ${n} treinos`, module: "Saúde", route: "/saude" },
  workout_weeks: { label: (n) => `Treinar em ${n} semanas diferentes`, module: "Saúde", route: "/saude" },
  sleep_logs: { label: (n) => `Registrar o sono ${n} vezes`, module: "Saúde", route: "/saude" },
  mood_logs: { label: (n) => `Registrar humor e energia ${n} vezes`, module: "Saúde", route: "/saude" },
  recovery_days: { label: (n) => `Marcar ${n} dia(s) de recuperação`, module: "Hoje", route: "/hoje" },
  journal_days: { label: (n) => `Escrever no Diário em ${n} dias`, module: "Diário", route: "/diario" },
  gratitude_days: { label: (n) => `Registrar gratidão em ${n} dias`, module: "Diário", route: "/diario" },
  pages_read: { label: (n) => `Ler ${n} páginas`, module: "Biblioteca", route: "/biblioteca" },
  books_finished: { label: (n) => `Concluir ${n} livro(s)`, module: "Biblioteca", route: "/biblioteca" },
  study_minutes: { label: (n) => `Estudar ${Math.round(n / 60)} h registradas`, module: "Educação", route: "/educacao" },
  study_days: { label: (n) => `Estudar em ${n} dias`, module: "Educação", route: "/educacao" },
  flashcard_reviews: { label: (n) => `Revisar ${n} cartões no Grimório`, module: "Grimório", route: "/grimorio" },
  focus_minutes: { label: (n) => `Acumular ${Math.round(n / 60)} h de foco cronometrado`, module: "Foco", route: "/hoje" },
  focus_sessions: { label: (n) => `Fazer ${n} sessões de foco (20+ min)`, module: "Foco", route: "/hoje" },
  deep_sessions: { label: (n) => `Fazer ${n} sessões profundas (50+ min)`, module: "Foco", route: "/hoje" },
  focus_days: { label: (n) => `Cronometrar foco em ${n} dias`, module: "Foco", route: "/hoje" },
  goals_created: { label: (n) => `Definir ${n} meta(s)`, module: "Metas", route: "/metas" },
  goals_done: { label: (n) => `Concluir ${n} meta(s)`, module: "Metas", route: "/metas" },
  projects_created: { label: (n) => `Criar ${n} projeto(s)`, module: "Projetos", route: "/projetos" },
  projects_done: { label: (n) => `Concluir ${n} projeto(s)`, module: "Projetos", route: "/projetos" },
  contracts_done: { label: (n) => `Cumprir ${n} contrato(s)`, module: "Contratos", route: "/contratos" },
  campaigns_done: { label: (n) => `Concluir ${n} campanha(s)`, module: "Forja de Campanhas", route: "/forja-campanhas" },
  weekly_plans_sealed: { label: (n) => `Selar ${n} plano(s) no Conselho de Guerra`, module: "Conselho de Guerra", route: "/conselho" },
  reviews_sealed: { label: (n) => `Selar ${n} revisão(ões) da jornada`, module: "Revisões", route: "/revisoes" },
  events_planned: { label: (n) => `Planejar ${n} compromissos na Agenda`, module: "Agenda", route: "/calendario" },
};

/* ───────────────────────────── efeitos funcionais ───────────────────────────── */

export type EffectType =
  | "focus.preset" | "missions.template" | "habits.template" | "goals.template" | "projects.template"
  | "diary.prompts" | "grimoire.session" | "agenda.blocks" | "analysis.panel" | "codex.title";

export interface MissionTemplate { title: string; description: string; priority: "Baixa" | "Média" | "Alta"; difficulty: "facil" | "medio" | "dificil" | "epico"; estimateMinutes: number; steps: string[] }
export interface EffectDef {
  key: string;
  type: EffectType;
  label: string;
  description: string;
  params: Record<string, unknown>;
}

const fx = (key: string, type: EffectType, label: string, description: string, params: Record<string, unknown>): EffectDef => ({ key, type, label, description, params });
const focus = (key: string, label: string, mode: "pomodoro" | "block" | "free", minutes: number, hint: string) =>
  fx(`focus.preset.${key}`, "focus.preset", `Ritual de foco: ${label}`, `Atalho no Cronômetro de foco (Hoje): ${hint}`, { label, mode, minutes, hint });
const mission = (key: string, t: MissionTemplate) => fx(`missions.template.${key}`, "missions.template", `Modelo de missão: ${t.title}`, `Cria a missão “${t.title}” com ${t.steps.length} etapas e estimativa de ${t.estimateMinutes} min.`, { ...t });
const habit = (key: string, name: string, category: string, hint: string) =>
  fx(`habits.template.${key}`, "habits.template", `Modelo de hábito: ${name}`, `Cria o hábito diário “${name}” — ${hint}`, { name, category, frequency: "daily" });
const goal = (key: string, title: string, description: string) => fx(`goals.template.${key}`, "goals.template", `Modelo de meta: ${title}`, `Cria a meta “${title}” com a descrição pronta.`, { title, description });
const project = (key: string, name: string, description: string, tasks: string[]) =>
  fx(`projects.template.${key}`, "projects.template", `Modelo de projeto: ${name}`, `Cria o projeto “${name}” com ${tasks.length} missões iniciais.`, { name, description, tasks });
const prompts = (key: string, label: string, list: string[]) => fx(`diary.prompts.${key}`, "diary.prompts", `Reflexões guiadas: ${label}`, `Adiciona ${list.length} perguntas às inspirações de escrita do Diário.`, { label, prompts: list });
const grimoire = (key: string, label: string, minutes: number, hint: string) =>
  fx(`grimoire.session.${key}`, "grimoire.session", `Sessão do Grimório: ${label}`, `Inicia o cronômetro vinculado a um baralho (${minutes} min). ${hint}`, { label, minutes, hint });
const agenda = (key: string, label: string, minutes: number, count: number, category: string) =>
  fx(`agenda.blocks.${key}`, "agenda.blocks", `Planejador de blocos: ${label}`, `Procura ${count} janelas livres de ${minutes} min nos próximos dias; só cria eventos na Agenda com a sua confirmação.`, { label, minutes, count, category });
const analysis = (panel: string, label: string, description: string) => fx(`analysis.panel.${panel}`, "analysis.panel", `Análise: ${label}`, description, { panel, label });
const title = (id: string, name: string) => fx(`codex.title.${id}`, "codex.title", `Título: ${name}`, `Libera o título equipável “${name}” no Códex e no Perfil do Herói.`, { titleId: id, name });

const M = {
  semana: mission("semana", { title: "Planejamento da semana", description: "Separe 30 minutos para definir as missões principais da semana.", priority: "Alta", difficulty: "medio", estimateMinutes: 30, steps: ["Revisar o que ficou pendente", "Escolher até 3 prioridades", "Distribuir as missões nos dias", "Reservar blocos na Agenda"] }),
  inbox: mission("inbox", { title: "Esvaziar a Inbox", description: "Transforme cada item capturado em missão, nota ou descarte.", priority: "Média", difficulty: "facil", estimateMinutes: 25, steps: ["Abrir a Inbox", "Decidir cada item: fazer, agendar, delegar ou descartar", "Arquivar o que já foi resolvido"] }),
  fechamento: mission("fechamento", { title: "Fechamento do dia", description: "Encerramento curto para não levar pendências soltas para amanhã.", priority: "Baixa", difficulty: "facil", estimateMinutes: 15, steps: ["Marcar o que foi concluído", "Reagendar o que não coube", "Escolher a missão principal de amanhã"] }),
  eisenhower: mission("eisenhower", { title: "Triagem de prioridades", description: "Classifique as missões abertas por urgência e importância.", priority: "Alta", difficulty: "medio", estimateMinutes: 30, steps: ["Listar as missões abertas", "Separar urgente/importante", "Rebaixar ou descartar o que não importa", "Ajustar prioridades no quadro"] }),
  prazos: mission("prazos", { title: "Revisão de prazos", description: "Encontre prazos em risco antes que eles virem atraso.", priority: "Alta", difficulty: "medio", estimateMinutes: 20, steps: ["Abrir o Radar de Prazos", "Renegociar ou replanejar o que não cabe", "Quebrar missões grandes que vencem logo"] }),
  travada: mission("travada", { title: "Destravar uma missão parada", description: "Escolha a missão mais antiga em execução e defina o próximo passo concreto.", priority: "Média", difficulty: "medio", estimateMinutes: 25, steps: ["Identificar o bloqueio", "Definir a próxima ação de 15 minutos", "Executar a primeira etapa"] }),
  automacao: mission("automacao", { title: "Automatizar uma rotina repetitiva", description: "Transforme uma tarefa que se repete em recorrência ou automação.", priority: "Média", difficulty: "dificil", estimateMinutes: 45, steps: ["Listar tarefas repetidas no último mês", "Escolher uma para automatizar", "Configurar recorrência ou automação do módulo", "Testar por uma semana"] }),
  treinoSemana: mission("treino_semana", { title: "Planejar os treinos da semana", description: "Defina dias, horários e tipo de treino.", priority: "Média", difficulty: "facil", estimateMinutes: 20, steps: ["Escolher os dias de treino", "Reservar horários na Agenda", "Separar o material"] }),
  rotinaNoite: mission("rotina_noite", { title: "Montar a rotina noturna", description: "Combine um horário para desacelerar e se preparar para dormir.", priority: "Média", difficulty: "facil", estimateMinutes: 20, steps: ["Definir o horário de desligar telas", "Preparar o ambiente", "Registrar o sono por uma semana"] }),
  consulta: mission("consulta", { title: "Agendar consultas de rotina", description: "Organize check-ups em dia com o seu profissional de saúde (sem orientação clínica do app).", priority: "Média", difficulty: "facil", estimateMinutes: 20, steps: ["Listar consultas em atraso", "Marcar data e horário", "Anotar na Agenda"] }),
  refeicoes: mission("refeicoes", { title: "Preparar a semana de refeições", description: "Planejamento simples para facilitar escolhas ao longo da semana.", priority: "Baixa", difficulty: "medio", estimateMinutes: 60, steps: ["Escolher o cardápio base", "Fazer a lista de compras", "Separar porções"] }),
  estudoAtivo: mission("estudo_ativo", { title: "Sessão de estudo ativo", description: "Estudo com recuperação ativa: ler, fechar o material e explicar com suas palavras.", priority: "Alta", difficulty: "medio", estimateMinutes: 50, steps: ["Definir o tópico", "Ler/assistir em blocos curtos", "Resumir sem consultar", "Anotar dúvidas"] }),
  fichamento: mission("fichamento", { title: "Fichamento de capítulo", description: "Registre ideias principais, citações e conexões de um capítulo.", priority: "Média", difficulty: "medio", estimateMinutes: 45, steps: ["Ler o capítulo", "Anotar 3 ideias principais", "Separar citações", "Conectar com o que você já sabe"] }),
  flashcards: mission("flashcards", { title: "Criar 10 flashcards do conteúdo", description: "Transforme o que estudou em cartões para o Grimório.", priority: "Média", difficulty: "facil", estimateMinutes: 25, steps: ["Escolher o conteúdo", "Escrever 10 perguntas objetivas", "Cadastrar no baralho"] }),
  artigo: mission("artigo", { title: "Ler e anotar um artigo científico", description: "Leitura estruturada: problema, método, resultados e limitações.", priority: "Média", difficulty: "dificil", estimateMinutes: 60, steps: ["Ler resumo e conclusão", "Mapear método e dados", "Anotar resultados e limitações", "Registrar a referência"] }),
  projetoDados: mission("projeto_dados", { title: "Mini-projeto prático de dados", description: "Aplique um conceito estudado em um conjunto de dados real.", priority: "Média", difficulty: "epico", estimateMinutes: 180, steps: ["Escolher o conjunto de dados", "Explorar e limpar", "Aplicar a técnica estudada", "Documentar o que aprendeu"] }),
  deepWork: mission("deep_work", { title: "Bloco de trabalho profundo", description: "Uma missão importante sem interrupções, com celular longe.", priority: "Alta", difficulty: "dificil", estimateMinutes: 90, steps: ["Escolher uma única missão", "Silenciar notificações", "Trabalhar 90 minutos", "Registrar onde parou"] }),
  distracoes: mission("distracoes", { title: "Auditoria de distrações", description: "Descubra o que mais interrompe o seu foco durante uma semana.", priority: "Média", difficulty: "medio", estimateMinutes: 30, steps: ["Anotar cada interrupção por 3 dias", "Agrupar as causas", "Escolher uma regra para cortar a principal"] }),
  metasMes: mission("metas_mes", { title: "Revisar as metas do mês", description: "Confira avanço, próxima missão e prazo de cada meta ativa.", priority: "Alta", difficulty: "medio", estimateMinutes: 30, steps: ["Abrir Metas", "Atualizar o progresso", "Definir a próxima missão de cada meta"] }),
  kickoff: mission("kickoff", { title: "Kickoff de projeto", description: "Defina objetivo, entregáveis e primeiras missões de um projeto.", priority: "Alta", difficulty: "dificil", estimateMinutes: 60, steps: ["Escrever o objetivo em uma frase", "Listar entregáveis", "Quebrar o primeiro entregável em missões", "Definir datas"] }),
  contrato: mission("contrato", { title: "Revisão de contrato", description: "Verifique cláusulas, etapas e prazos de um contrato ativo.", priority: "Média", difficulty: "medio", estimateMinutes: 30, steps: ["Abrir o contrato", "Conferir etapas e prazos", "Registrar pendências como missões"] }),
  campanha: mission("campanha", { title: "Planejar uma campanha", description: "Organize um objetivo grande em marcos e missões na Forja de Campanhas.", priority: "Média", difficulty: "dificil", estimateMinutes: 60, steps: ["Definir o objetivo final", "Criar 3 marcos", "Ligar missões e hábitos aos marcos"] }),
  dependencias: mission("dependencias", { title: "Mapear dependências do projeto", description: "Descubra quais missões travam as outras.", priority: "Média", difficulty: "dificil", estimateMinutes: 45, steps: ["Listar as missões do projeto", "Marcar o que depende do quê", "Antecipar as missões bloqueadoras"] }),
  retro: mission("retro", { title: "Retrospectiva de projeto", description: "O que funcionou, o que não funcionou e o que mudar no próximo.", priority: "Baixa", difficulty: "medio", estimateMinutes: 40, steps: ["Revisar entregas", "Listar acertos e problemas", "Registrar 3 ajustes para o próximo projeto"] }),
  pausa: mission("pausa", { title: "Pausa restauradora", description: "Uma pausa planejada longe das telas, sem culpa.", priority: "Baixa", difficulty: "facil", estimateMinutes: 20, steps: ["Escolher a atividade (caminhar, alongar, descansar)", "Desligar notificações", "Voltar e registrar como se sente"] }),
  recuperacao: mission("recuperacao", { title: "Planejar um dia de recuperação", description: "Reserve um dia leve de propósito — descansar também faz parte da jornada.", priority: "Média", difficulty: "facil", estimateMinutes: 20, steps: ["Escolher o dia", "Remover compromissos não essenciais", "Marcar o dia de recuperação no Hoje"] }),
  espaco: mission("espaco", { title: "Organizar o espaço de trabalho", description: "Ambiente organizado reduz atrito para começar.", priority: "Baixa", difficulty: "facil", estimateMinutes: 30, steps: ["Liberar a mesa", "Separar o que não usa", "Deixar pronto o material de amanhã"] }),
  offline: mission("offline", { title: "Tempo offline", description: "Um período combinado sem redes sociais e mensagens.", priority: "Baixa", difficulty: "medio", estimateMinutes: 60, steps: ["Definir o horário", "Avisar quem precisa", "Fazer algo que recarrega a energia"] }),
};

/* ───────────────────────────── habilidades ───────────────────────────── */

export interface SkillLevelDef {
  cost: number;
  heroLevel: number;
  evidence: { metric: EvidenceMetric; min: number } | null;
  effects: EffectDef[];
}
export interface PrereqOption { skill: string; level: number }
export interface SkillDef {
  key: string;
  name: string;
  description: string;
  branch: BranchKey;
  tier: 1 | 2 | 3 | 4 | 5;
  icon: string;
  rarity: "comum" | "incomum" | "rara" | "epica" | "lendaria";
  tags: string[];
  requires: PrereqOption[][];
  levels: SkillLevelDef[];
  pos: { x: number; y: number };
}

type Raw = {
  key: string;
  name: string;
  description: string;
  icon: string;
  tags: string[];
  /** Pré-requisitos: grupos E, opções OU. "self" = mesma lista do ramo pelo índice. */
  requires?: Array<Array<[string, number]>>;
  evidence?: { metric: EvidenceMetric; mins: number[] };
  effects: EffectDef[][];
};

const TIER_OF = [1, 2, 2, 3, 3, 4, 4, 5] as const;
const TIER_COST = [1, 1, 2, 2, 3];
const TIER_HERO = [1, 3, 6, 10, 15];
const RARITY: SkillDef["rarity"][] = ["comum", "incomum", "rara", "epica", "lendaria"];

const BRANCH_SKILLS: Record<Exclude<BranchKey, "avancada">, Raw[]> = {
  produtividade: [
    { key: "prod_aprendiz", name: "Aprendiz da Execução", description: "Os primeiros passos de quem transforma intenção em missão concluída.", icon: "Zap", tags: ["executar", "missões", "tarefas", "produtividade"], evidence: { metric: "tasks_done", mins: [0, 5, 15] }, effects: [[M.fechamento], [M.inbox], [analysis("prod_weekday", "Ritmo por dia da semana", "Mostra em que dias da semana você mais conclui missões (últimas 8 semanas).")]] },
    { key: "prod_planejador", name: "Planejador Iniciante", description: "Planejar a semana antes de executá-la.", icon: "CalendarCheck", tags: ["planejar", "semana", "agenda", "organização"], requires: [[["prod_aprendiz", 1]]], evidence: { metric: "tasks_planned", mins: [5, 15, 30] }, effects: [[M.semana], [agenda("planejamento", "Planejamento semanal", 30, 1, "pessoal")], [focus("arrancada", "Arrancada", "pomodoro", 10, "10 minutos para vencer a resistência de começar.")]] },
    { key: "prod_rotina", name: "Rotina Consistente", description: "Sustentar hábitos e rotinas por mais tempo, sem depender de motivação.", icon: "Repeat", tags: ["hábitos", "rotina", "consistência", "disciplina"], requires: [[["prod_aprendiz", 1]]], evidence: { metric: "habit_best_streak", mins: [3, 7, 14] }, effects: [[habit("planejar_dia", "Planejar o dia", "produtividade", "2 minutos para escolher a missão principal.")], [habit("revisar_noite", "Revisão noturna", "produtividade", "conferir o que foi feito e preparar amanhã.")], [analysis("habit_consistency", "Consistência de hábitos (30 dias)", "Grade de check-ins de cada hábito nos últimos 30 dias, com a maior sequência real.")]] },
    { key: "prod_priorizacao", name: "Priorização Tática", description: "Escolher o que importa e cortar o resto com clareza.", icon: "ListOrdered", tags: ["prioridade", "importante", "urgente", "triagem"], requires: [[["prod_planejador", 2]]], evidence: { metric: "tasks_done", mins: [20, 40, 70] }, effects: [[M.eisenhower], [focus("sprint20", "Sprint tático", "pomodoro", 20, "um sprint curto para a missão mais importante.")], [M.travada]] },
    { key: "prod_prazos", name: "Mestre dos Prazos", description: "Antecipar riscos de prazo antes que virem atraso.", icon: "AlarmClock", tags: ["prazos", "deadline", "atraso", "risco"], requires: [[["prod_planejador", 1], ["prod_rotina", 2]]], evidence: { metric: "tasks_on_time", mins: [10, 25, 50] }, effects: [[M.prazos], [analysis("deadline_risk", "Risco de prazos", "Missões abertas vencidas ou vencendo em 7 dias, agrupadas por projeto.")], [agenda("prazos", "Blocos para prazos", 60, 2, "missao")]] },
    { key: "prod_executor", name: "Executor Estratégico", description: "Une planejamento e foco profundo: as missões certas, sem interrupção.", icon: "Swords", tags: ["estratégia", "foco", "execução", "deep work"], requires: [[["prod_priorizacao", 2]], [["foco_blocos", 1]]], evidence: { metric: "deep_sessions", mins: [5, 15] }, effects: [[M.deepWork], [agenda("deep", "Blocos de trabalho profundo", 90, 3, "foco")]] },
    { key: "prod_fluxo", name: "Fluxo Automatizado", description: "Rotinas repetitivas viram recorrências e automações.", icon: "Workflow", tags: ["automação", "recorrência", "fluxo", "sistema"], requires: [[["prod_prazos", 1]], [["prod_rotina", 2]]], evidence: { metric: "tasks_done", mins: [60, 120] }, effects: [[M.automacao], [prompts("sistema", "Sistemas de trabalho", ["O que eu fiz hoje que poderia ser automático?", "Qual tarefa repeti esta semana?", "O que me tirou do fluxo hoje?", "Qual atalho economizaria 10 minutos amanhã?"])]] },
    { key: "prod_lenda", name: "Lenda da Produtividade", description: "Domínio completo do ciclo planejar, executar e revisar.", icon: "Crown", tags: ["maestria", "produtividade", "lenda"], requires: [[["prod_executor", 1]], [["prod_fluxo", 1]]], evidence: { metric: "tasks_done", mins: [200] }, effects: [[title("lenda-produtividade", "Lenda da Produtividade"), focus("maratona", "Maratona de execução", "block", 120, "duas horas para a missão épica do dia.")]] },
  ],
  saude: [
    { key: "saude_guardiao", name: "Guardião da Vitalidade", description: "Começar a cuidar do corpo com registros simples e constantes.", icon: "HeartPulse", tags: ["saúde", "corpo", "vitalidade", "autocuidado"], evidence: { metric: "water_days", mins: [0, 5, 15] }, effects: [[habit("agua", "Beber água ao longo do dia", "saude", "lembrete visual para registrar água em Saúde.")], [M.consulta], [analysis("health_consistency", "Consistência de autocuidado", "Dias com registro de água, treino, sono e humor nos últimos 30 dias (registros, não avaliação clínica).")]] },
    { key: "saude_hidratacao", name: "Hidratação Consciente", description: "Transformar o registro de água em parte natural do dia.", icon: "Droplets", tags: ["água", "hidratação", "saúde"], requires: [[["saude_guardiao", 1]]], evidence: { metric: "water_days", mins: [7, 20, 45] }, effects: [[habit("agua_manha", "Copo d'água ao acordar", "saude", "um primeiro passo fácil logo cedo.")], [prompts("corpo", "Corpo e energia", ["Como estava minha energia hoje?", "O que meu corpo pediu hoje?", "Bebi água o suficiente para me sentir bem?", "Que pequena escolha cuidou de mim hoje?"])], [habit("agua_tarde", "Garrafa cheia à tarde", "saude", "reabastecer a garrafa no meio da tarde.")]] },
    { key: "saude_movimento", name: "Rotina de Movimento", description: "Encaixar o movimento na semana, do jeito que der.", icon: "Footprints", tags: ["movimento", "exercício", "caminhada", "treino"], requires: [[["saude_guardiao", 1]]], evidence: { metric: "workouts", mins: [3, 10, 25] }, effects: [[habit("caminhada", "Caminhada de 20 minutos", "saude", "movimento leve, em qualquer horário.")], [M.treinoSemana], [habit("alongamento", "Alongamento de 5 minutos", "saude", "pausa ativa entre blocos de trabalho.")]] },
    { key: "saude_descanso", name: "Descanso Planejado", description: "Dormir é parte do plano, não o que sobra dele.", icon: "Moon", tags: ["sono", "descanso", "noite"], requires: [[["saude_hidratacao", 1], ["saude_movimento", 1]]], evidence: { metric: "sleep_logs", mins: [7, 20, 45] }, effects: [[M.rotinaNoite], [habit("telas", "Desligar telas antes de dormir", "saude", "um horário combinado para desacelerar.")], [prompts("sono", "Sono e rotina", ["Como dormi esta noite?", "O que ajudou ou atrapalhou meu descanso?", "Que horário quero ir dormir hoje?", "Como acordei me sentindo?"])]] },
    { key: "saude_treinos", name: "Consistência de Treinos", description: "Treinar em várias semanas seguidas, sem buscar perfeição.", icon: "Dumbbell", tags: ["treino", "academia", "consistência", "exercício"], requires: [[["saude_movimento", 2]]], evidence: { metric: "workout_weeks", mins: [3, 6, 10] }, effects: [[focus("treino45", "Treino cronometrado", "block", 45, "cronometra o treino como bloco de foco (o tempo é seu).")], [agenda("treinos", "Treinos na semana", 50, 3, "saude")], [M.refeicoes]] },
    { key: "saude_recuperacao", name: "Ritual de Recuperação", description: "Planejar a recuperação depois de semanas intensas.", icon: "BatteryCharging", tags: ["recuperação", "descanso", "pausa"], requires: [[["saude_descanso", 1]], [["saude_treinos", 1]]], evidence: { metric: "recovery_days", mins: [1, 3] }, effects: [[M.recuperacao], [prompts("recuperacao", "Recuperação", ["O que me deixou cansado esta semana?", "Do que preciso para recarregar?", "O que posso tirar da agenda sem culpa?", "Como quero me sentir no fim do dia de descanso?"])]] },
    { key: "saude_equilibrio", name: "Equilíbrio da Rotina", description: "Distribuir esforço e descanso ao longo da semana.", icon: "Scale", tags: ["equilíbrio", "rotina", "semana"], requires: [[["saude_treinos", 1], ["saude_descanso", 2]]], evidence: { metric: "habits_streak_14", mins: [1, 2] }, effects: [[analysis("wellbeing_balance", "Equilíbrio da semana", "Humor e energia médios por dia da semana, dias de diário e de recuperação (últimos 60 dias).")], [agenda("recuperacao", "Pausas na semana", 20, 4, "saude")]] },
    { key: "saude_mestre", name: "Mestre da Vitalidade", description: "Autocuidado consolidado como estilo de vida.", icon: "Sparkles", tags: ["maestria", "saúde", "vitalidade"], requires: [[["saude_recuperacao", 1]], [["saude_equilibrio", 1]]], evidence: { metric: "habits_streak_30", mins: [2] }, effects: [[title("mestre-vitalidade", "Mestre da Vitalidade"), habit("check_semanal", "Check-in semanal de autocuidado", "saude", "um minuto para revisar água, sono, treino e humor.")]] },
  ],
  aprendizado: [
    { key: "apr_aprendiz", name: "Aprendiz Arcano", description: "Estudar com intenção e registrar o que aprendeu.", icon: "BookOpen", tags: ["estudo", "aprender", "educação", "conhecimento"], evidence: { metric: "study_minutes", mins: [0, 120, 480] }, effects: [[M.estudoAtivo], [focus("estudo50", "Estudo profundo", "pomodoro", 50, "50 minutos de estudo com uma pausa de 10 ao final.")], [analysis("study_subjects", "Estudo por disciplina", "Minutos de estudo por disciplina e revisões do Grimório nos últimos 30 dias.")]] },
    { key: "apr_leitor", name: "Leitor Constante", description: "Ler um pouco quase todos os dias.", icon: "Library", tags: ["leitura", "livros", "biblioteca", "páginas"], requires: [[["apr_aprendiz", 1]]], evidence: { metric: "pages_read", mins: [50, 200, 600] }, effects: [[habit("leitura", "Ler 20 páginas", "leitura", "leitura diária curta e sustentável.")], [M.fichamento], [prompts("leitura", "Leitura", ["Qual ideia do livro ficou comigo hoje?", "Com o que eu discordei do autor?", "Como posso aplicar o que li?", "Que trecho quero lembrar?"])]] },
    { key: "apr_explorador", name: "Explorador do Conhecimento", description: "Organizar trilhas de estudo com começo, meio e fim.", icon: "Compass", tags: ["trilha", "curso", "estudo", "exploração"], requires: [[["apr_aprendiz", 1]]], evidence: { metric: "study_days", mins: [5, 15, 30] }, effects: [[goal("trilha", "Concluir uma trilha de estudo", "Escolher um tema, definir 5 tópicos e estudar um por semana até concluir.")], [M.artigo], [agenda("estudo", "Blocos de estudo", 50, 3, "estudo")]] },
    { key: "apr_memoria", name: "Memória Organizada", description: "Transformar o que estudou em cartões de revisão.", icon: "Brain", tags: ["flashcards", "memória", "grimório", "revisão"], requires: [[["apr_leitor", 1], ["apr_explorador", 1]]], evidence: { metric: "flashcard_reviews", mins: [30, 100, 250] }, effects: [[M.flashcards], [grimoire("relampago", "Revisão relâmpago", 10, "Ideal para os intervalos do dia.")], [habit("flashcards", "Revisar os cartões do dia", "estudo", "manter o Grimório em dia.")]] },
    { key: "apr_revisoes", name: "Mestre das Revisões", description: "Revisão espaçada como hábito, não como emergência.", icon: "RefreshCw", tags: ["revisão espaçada", "grimório", "memorização"], requires: [[["apr_memoria", 1]]], evidence: { metric: "flashcard_reviews", mins: [300, 700, 1200] }, effects: [[grimoire("sessao25", "Sessão de revisão", 25, "Um pomodoro inteiro dedicado ao baralho escolhido.")], [grimoire("maratona", "Maratona de memorização", 45, "Para véspera de prova, com pausa no meio.")], [prompts("estudo", "Aprendizado", ["O que eu aprendi hoje que não sabia ontem?", "Qual conceito ainda está confuso?", "Como eu explicaria isso para alguém?", "O que preciso revisar amanhã?"])]] },
    { key: "apr_pesquisador", name: "Pesquisador Disciplinado", description: "Une aprendizado e foco: leitura científica e escrita com método.", icon: "Microscope", tags: ["pesquisa", "artigo", "mestrado", "acadêmico", "científico"], requires: [[["apr_explorador", 2]], [["foco_blocos", 1], ["foco_guardiao_tempo", 2]]], evidence: { metric: "study_minutes", mins: [1200, 3000] }, effects: [[project("artigo", "Artigo científico", "Projeto acadêmico do problema à submissão.", ["Definir a pergunta de pesquisa", "Revisão de literatura", "Coleta e preparação dos dados", "Experimentos e resultados", "Escrita e revisão final"])], [focus("pesquisa75", "Imersão de pesquisa", "block", 75, "leitura e escrita acadêmica sem interrupções.")]] },
    { key: "apr_dados", name: "Sábio dos Dados", description: "Aprender fazendo: projetos práticos que consolidam o conhecimento.", icon: "BarChart3", tags: ["dados", "machine learning", "análise", "prática", "ciência de dados"], requires: [[["apr_revisoes", 1], ["apr_pesquisador", 1]]], evidence: { metric: "study_days", mins: [40, 80] }, effects: [[M.projetoDados], [goal("portfolio", "Publicar um projeto no portfólio", "Concluir um projeto prático, documentar e publicar no portfólio.")]] },
    { key: "apr_arquimago", name: "Arquimago do Conhecimento", description: "Domínio contínuo: estudar, revisar e aplicar viraram rotina.", icon: "Wand2", tags: ["maestria", "conhecimento", "sabedoria"], requires: [[["apr_pesquisador", 1]], [["apr_dados", 1]]], evidence: { metric: "study_minutes", mins: [6000] }, effects: [[title("arquimago", "Arquimago do Conhecimento"), project("trilha_mestre", "Trilha de especialização", "Plano de especialização em um tema por um semestre.", ["Mapear o tema e referências", "Definir projeto final", "Cronograma de estudo semanal", "Entrega do projeto final"])]] },
  ],
  foco: [
    { key: "foco_iniciado", name: "Iniciado da Concentração", description: "Os primeiros minutos cronometrados de atenção inteira.", icon: "Target", tags: ["foco", "concentração", "atenção"], evidence: { metric: "focus_minutes", mins: [0, 60, 240] }, effects: [[focus("micro15", "Micro-foco", "pomodoro", 15, "quando 25 minutos parecem demais.")], [prompts("foco", "Foco e distrações", ["O que mais me distraiu hoje?", "Em que horário rendi melhor?", "O que posso tirar do meu caminho amanhã?", "Qual foi meu melhor momento de foco?"])], [analysis("focus_hours", "Foco por hora do dia", "Minutos cronometrados por hora do dia nos últimos 30 dias.")]] },
    { key: "foco_pomodoro", name: "Primeiro Pomodoro", description: "Dominar o ciclo de foco e pausa.", icon: "Timer", tags: ["pomodoro", "pausa", "ciclo"], requires: [[["foco_iniciado", 1]]], evidence: { metric: "focus_sessions", mins: [3, 10, 25] }, effects: [[focus("pomodoro35", "Pomodoro estendido", "pomodoro", 35, "para tarefas que precisam aquecer.")], [M.distracoes], [focus("duplo", "Pomodoro duplo", "block", 55, "dois pomodoros encadeados com pausa curta no meio.")]] },
    { key: "foco_guardiao_tempo", name: "Guardião do Tempo", description: "Saber para onde o tempo está indo.", icon: "Hourglass", tags: ["tempo", "agenda", "registro"], requires: [[["foco_iniciado", 1]]], evidence: { metric: "focus_days", mins: [5, 12, 25] }, effects: [[agenda("foco_curto", "Blocos de foco curtos", 30, 3, "foco")], [habit("registro_tempo", "Cronometrar a primeira missão do dia", "foco", "começar o dia com o cronômetro ligado.")], [prompts("tempo", "Tempo", ["Para onde foi o meu tempo hoje?", "O que tomou mais tempo do que eu esperava?", "O que eu faria diferente na agenda de hoje?", "Qual compromisso posso recusar?"])]] },
    { key: "foco_blocos", name: "Blocos de Foco", description: "Reservar blocos na Agenda para o que importa.", icon: "LayoutGrid", tags: ["blocos", "agenda", "deep work", "planejamento"], requires: [[["foco_pomodoro", 1], ["foco_guardiao_tempo", 1]]], evidence: { metric: "deep_sessions", mins: [2, 6, 12] }, effects: [[agenda("foco_longo", "Blocos de foco profundos", 90, 2, "foco")], [focus("bloco75", "Bloco de 75", "block", 75, "um bloco longo com pausa planejada ao fim.")], [mission("semana_foco", { title: "Planejar a semana de foco", description: "Escolha as missões que merecem blocos profundos e reserve os horários.", priority: "Alta", difficulty: "medio", estimateMinutes: 25, steps: ["Escolher até 3 missões profundas", "Reservar os blocos na Agenda", "Avisar quem precisa sobre os horários"] })]] },
    { key: "foco_defensor", name: "Defensor das Distrações", description: "Proteger o foco das interrupções mais comuns.", icon: "Shield", tags: ["distração", "interrupção", "celular"], requires: [[["foco_pomodoro", 2]]], evidence: { metric: "focus_sessions", mins: [30, 60, 100] }, effects: [[habit("celular_longe", "Celular longe no primeiro bloco", "foco", "o primeiro bloco do dia sem o celular por perto.")], [M.offline], [focus("silencio", "Sessão silenciosa", "block", 60, "uma hora sem notificações, só a missão escolhida.")]] },
    { key: "foco_fluxo", name: "Fluxo Profundo", description: "Sessões longas de trabalho profundo com recuperação planejada.", icon: "Waves", tags: ["fluxo", "flow", "profundo"], requires: [[["foco_blocos", 2]], [["foco_defensor", 1]]], evidence: { metric: "deep_sessions", mins: [20, 40] }, effects: [[focus("ultradiano", "Foco ultradiano", "block", 90, "90 minutos seguidos de um ciclo natural de pausa.")], [agenda("ultradiano", "Manhãs de foco", 90, 4, "foco")]] },
    { key: "foco_mestre", name: "Mestre da Concentração", description: "Foco profundo frequente, sem esgotar a energia.", icon: "Eye", tags: ["maestria", "concentração", "constância"], requires: [[["foco_fluxo", 1], ["foco_defensor", 2]]], evidence: { metric: "focus_minutes", mins: [3000, 6000] }, effects: [[focus("maratona_foco", "Maratona de foco", "block", 120, "duas horas, com uma pausa curta no meio.")], [prompts("flow", "Estado de fluxo", ["Quando entrei em fluxo hoje?", "O que estava presente nesse momento?", "Como posso repetir essas condições?", "Quanto descanso esse esforço pediu?"])]] },
    { key: "foco_guardiao", name: "Guardião do Foco", description: "A atenção virou sua maior aliada.", icon: "Gem", tags: ["maestria", "foco", "guardião"], requires: [[["foco_fluxo", 1]], [["foco_mestre", 1]]], evidence: { metric: "focus_days", mins: [80] }, effects: [[title("guardiao-foco", "Guardião do Foco"), agenda("semana_foco", "Semana de foco", 90, 5, "foco")]] },
  ],
  gestao: [
    { key: "gest_organizador", name: "Organizador da Jornada", description: "Colocar metas e projetos em um só mapa.", icon: "Map", tags: ["organização", "metas", "projetos", "gestão"], evidence: { metric: "goals_created", mins: [0, 2, 4] }, effects: [[M.metasMes], [goal("anual", "Meta do ano", "Defina o resultado que fará deste ano um bom capítulo da jornada.")], [analysis("goals_overview", "Panorama das metas", "Progresso real de cada meta ativa e quantas missões abertas ela tem.")]] },
    { key: "gest_metas", name: "Planejador de Metas", description: "Metas com próxima missão definida e prazo realista.", icon: "Flag", tags: ["metas", "objetivos", "planejamento"], requires: [[["gest_organizador", 1]]], evidence: { metric: "goals_created", mins: [3, 6, 10] }, effects: [[goal("trimestre", "Meta do trimestre", "Um resultado mensurável para os próximos 90 dias, com marcos mensais.")], [prompts("metas", "Metas", ["Qual meta avançou esta semana?", "O que está travando a meta principal?", "Qual é a próxima missão de cada meta?", "Essa meta ainda faz sentido?"])], [goal("habito_meta", "Hábito-chave do semestre", "Escolha um hábito que, mantido por 6 meses, muda o resto da rotina.")]] },
    { key: "gest_projetos", name: "Guardião dos Projetos", description: "Projetos com escopo, entregáveis e ritmo.", icon: "FolderKanban", tags: ["projetos", "entregas", "escopo"], requires: [[["gest_organizador", 1]]], evidence: { metric: "projects_created", mins: [1, 3, 5] }, effects: [[M.kickoff], [project("pessoal", "Projeto pessoal", "Estrutura padrão de projeto pessoal.", ["Definir o objetivo", "Listar entregáveis", "Planejar a primeira etapa", "Executar e revisar"])], [M.retro]] },
    { key: "gest_contratos", name: "Estrategista dos Contratos", description: "Compromissos formais com etapas claras e cumpridas.", icon: "FileSignature", tags: ["contratos", "compromisso", "acordo"], requires: [[["gest_metas", 1], ["gest_projetos", 1]]], evidence: { metric: "contracts_done", mins: [1, 3, 6] }, effects: [[M.contrato], [prompts("compromissos", "Compromissos", ["Quais compromissos assumi esta semana?", "Algum prazo precisa ser renegociado?", "O que posso entregar antes do combinado?", "Que acordo preciso deixar mais claro?"])], [analysis("projects_health", "Saúde dos projetos", "Projetos ativos com missões abertas, atrasadas e concluídas nos últimos 30 dias.")]] },
    { key: "gest_campanhas", name: "Comandante de Campanhas", description: "Grandes objetivos divididos em marcos e missões.", icon: "Castle", tags: ["campanhas", "marcos", "objetivo grande"], requires: [[["gest_projetos", 2]]], evidence: { metric: "weekly_plans_sealed", mins: [1, 3, 6] }, effects: [[M.campanha], [agenda("conselho", "Conselho de Guerra semanal", 30, 1, "pessoal")], [goal("campanha", "Concluir uma campanha", "Levar uma campanha da Forja do primeiro marco até a conclusão.")]] },
    { key: "gest_planejamento", name: "Mestre do Planejamento", description: "Revisar e replanejar com dados, em ciclos.", icon: "ClipboardList", tags: ["planejamento", "revisões", "ciclos"], requires: [[["gest_contratos", 1]], [["gest_campanhas", 1]]], evidence: { metric: "reviews_sealed", mins: [2, 6] }, effects: [[M.dependencias], [project("semestre", "Plano do semestre", "Planejamento de seis meses com metas, projetos e revisões.", ["Definir 3 resultados do semestre", "Ligar projetos a cada resultado", "Agendar revisões mensais", "Revisão final do semestre"])]] },
    { key: "gest_processos", name: "Arquiteto de Processos", description: "Transformar o jeito de trabalhar em processos repetíveis.", icon: "Network", tags: ["processos", "sistema", "fluxo", "padronização"], requires: [[["gest_planejamento", 1], ["gest_contratos", 2]]], evidence: { metric: "projects_done", mins: [1, 3] }, effects: [[project("processo", "Documentar um processo", "Transforme algo que você repete em um passo a passo.", ["Escolher o processo", "Escrever o passo a passo", "Testar com uma execução real", "Ajustar e salvar como modelo"])], [prompts("processos", "Processos", ["Qual parte do meu trabalho se repete?", "Onde costumo errar no processo?", "O que um checklist resolveria?", "O que posso delegar ou simplificar?"])]] },
    { key: "gest_governante", name: "Governante da Jornada", description: "Metas, projetos e campanhas trabalhando juntos.", icon: "Crown", tags: ["maestria", "gestão", "governança"], requires: [[["gest_planejamento", 1]], [["gest_processos", 1]]], evidence: { metric: "goals_done", mins: [5] }, effects: [[title("governante", "Governante da Jornada"), goal("visao", "Visão de três anos", "Descreva onde quer estar em três anos e quais metas anuais levam até lá.")]] },
  ],
  bemestar: [
    { key: "bem_aprendiz", name: "Aprendiz do Equilíbrio", description: "Notar como está — sem julgamento.", icon: "Flower2", tags: ["bem-estar", "equilíbrio", "humor", "energia"], evidence: { metric: "mood_logs", mins: [0, 5, 15] }, effects: [[M.pausa], [prompts("checkin", "Check-in emocional", ["Como estou me sentindo agora?", "O que me deu energia hoje?", "O que me drenou hoje?", "Do que eu preciso amanhã?"])], [habit("respirar", "Pausa para respirar", "bemestar", "um minuto de pausa entre atividades.")]] },
    { key: "bem_gratidao", name: "Ritual de Gratidão", description: "Registrar o que foi bom, mesmo nos dias difíceis.", icon: "Heart", tags: ["gratidão", "diário", "positividade"], requires: [[["bem_aprendiz", 1]]], evidence: { metric: "gratitude_days", mins: [3, 10, 25] }, effects: [[habit("gratidao", "Três gratidões", "bemestar", "anotar três coisas boas do dia no Diário.")], [prompts("gratidao", "Gratidão", ["Quem fez meu dia melhor?", "Que pequena coisa deu certo hoje?", "Pelo que sou grato nesta semana?", "Que conquista eu ainda não celebrei?"])], [prompts("relacoes", "Relações", ["Com quem eu gostaria de passar mais tempo?", "Quem eu posso agradecer esta semana?", "Que conversa me fez bem?", "Como posso estar presente para alguém?"])]] },
    { key: "bem_descanso", name: "Guardião do Descanso", description: "Descansar de propósito também é avançar.", icon: "BedDouble", tags: ["descanso", "recuperação", "pausa"], requires: [[["bem_aprendiz", 1]]], evidence: { metric: "recovery_days", mins: [0, 1, 3] }, effects: [[mission("desacelerar", { title: "Ritual de desaceleração", description: "Encerrar o dia com calma antes de dormir, sem pendências na cabeça.", priority: "Baixa", difficulty: "facil", estimateMinutes: 20, steps: ["Anotar o que ficou pendente", "Desligar notificações", "Fazer algo tranquilo por 15 minutos"] })], [habit("sem_tela", "Hora sem telas", "bemestar", "uma hora do dia longe de telas.")], [agenda("pausas", "Pausas restauradoras", 20, 3, "pessoal")]] },
    { key: "bem_escrita", name: "Escrita Reflexiva", description: "Escrever para entender o próprio caminho.", icon: "Feather", tags: ["diário", "escrita", "reflexão"], requires: [[["bem_gratidao", 1], ["bem_descanso", 1]]], evidence: { metric: "journal_days", mins: [7, 20, 45] }, effects: [[prompts("profunda", "Reflexão profunda", ["O que eu aprendi sobre mim esta semana?", "Que padrão estou repetindo?", "O que eu diria para mim mesmo há um ano?", "Que decisão estou adiando?"])], [prompts("futuro", "Futuro", ["Como quero que seja o próximo mês?", "O que eu quero lembrar daqui a um ano?", "Que versão de mim estou construindo?", "Qual é o próximo pequeno passo?"])], [analysis("journal_rhythm", "Ritmo do Diário", "Dias com escrita, gratidão e dias de recuperação nas últimas 8 semanas.")]] },
    { key: "bem_harmonia", name: "Harmonia da Rotina", description: "Distribuir trabalho, estudo e descanso de forma sustentável.", icon: "Sun", tags: ["harmonia", "rotina", "distribuição"], requires: [[["bem_descanso", 2]]], evidence: { metric: "habit_checkins", mins: [30, 80, 150] }, effects: [[M.espaco], [goal("rotina_sustentavel", "Rotina sustentável", "Um mês com descanso, movimento e trabalho distribuídos na semana.")], [analysis("time_mix", "Distribuição das atividades", "Como seus minutos registrados se dividem entre foco, estudo, treino e leitura nos últimos 30 dias.")]] },
    { key: "bem_energia", name: "Protetor da Energia", description: "Planejar a semana respeitando a própria energia.", icon: "BatteryMedium", tags: ["energia", "recuperação", "limites"], requires: [[["bem_escrita", 1]], [["bem_harmonia", 1]]], evidence: { metric: "mood_logs", mins: [30, 60] }, effects: [[prompts("energia", "Energia", ["Quando minha energia esteve mais alta hoje?", "Que tarefa posso mover para um horário melhor?", "Onde preciso colocar um limite?", "O que me recarrega de verdade?"])], [mission("mapa_energia", { title: "Mapa de energia da semana", description: "Observe seus horários de maior e menor energia e ajuste a agenda.", priority: "Média", difficulty: "facil", estimateMinutes: 20, steps: ["Registrar humor e energia por 5 dias", "Marcar os melhores horários", "Mover uma missão importante para o horário de pico"] })]] },
    { key: "bem_autocuidado", name: "Mestre do Autocuidado", description: "Cuidar de si sem negociar com a culpa.", icon: "Leaf", tags: ["autocuidado", "maestria", "rotina"], requires: [[["bem_energia", 1], ["bem_harmonia", 2]]], evidence: { metric: "habits_streak_14", mins: [1, 3] }, effects: [[habit("autocuidado", "Um momento de autocuidado", "bemestar", "algo pequeno, só para você, todos os dias.")], [agenda("domingo", "Ritual de domingo", 45, 1, "pessoal")]] },
    { key: "bem_sabio", name: "Sábio do Equilíbrio", description: "Equilíbrio como prática diária.", icon: "Flower", tags: ["maestria", "equilíbrio", "sabedoria"], requires: [[["bem_energia", 1]], [["bem_autocuidado", 1]]], evidence: { metric: "journal_days", mins: [90] }, effects: [[title("sabio-equilibrio", "Sábio do Equilíbrio"), prompts("anual", "Retrospectiva", ["O que este ciclo me ensinou?", "Do que mais me orgulho?", "O que deixo para trás?", "O que levo para o próximo capítulo?"])]] },
  ],
};

const ADVANCED: Array<Raw & { between: [BranchKey, BranchKey]; hero: number; cost: number }> = [
  { key: "adv_equilibrio", name: "Guardião do Equilíbrio", description: "Saúde e bem-estar caminhando juntos: corpo cuidado e mente descansada.", icon: "ShieldPlus", tags: ["saúde", "bem-estar", "equilíbrio"], between: ["saude", "bemestar"], hero: 12, cost: 3, requires: [[["saude_descanso", 2]], [["bem_descanso", 2]]], evidence: { metric: "habits_streak_14", mins: [2, 3] }, effects: [[analysis("weekly_balance", "Mapa de esforço e descanso", "Cruza minutos de foco/estudo com dias de recuperação, sono registrado e treinos por semana (últimas 8 semanas).")], [title("guardiao-equilibrio", "Guardião do Equilíbrio")]] },
  { key: "adv_mente", name: "Mente Serena", description: "Foco profundo com pausas que preservam a energia.", icon: "Sparkle", tags: ["foco", "bem-estar", "pausa", "energia"], between: ["bemestar", "foco"], hero: 12, cost: 3, requires: [[["foco_defensor", 1], ["foco_blocos", 2]], [["bem_aprendiz", 3]]], evidence: { metric: "focus_days", mins: [20, 40] }, effects: [[focus("respiro", "Foco com respiro", "pomodoro", 30, "30 minutos de foco seguidos de 5 minutos longe da tela.")], [prompts("serenidade", "Serenidade", ["Como estava minha mente antes de começar?", "O que me ajudou a voltar ao foco?", "Que pausa me fez bem hoje?", "Como termino o dia com calma?"])]] },
  { key: "adv_arquiteto", name: "Arquiteto da Jornada", description: "Gestão e produtividade unidas: planos que viram execução.", icon: "Landmark", tags: ["gestão", "produtividade", "estratégia", "planejamento"], between: ["produtividade", "gestao"], hero: 14, cost: 4, requires: [[["gest_planejamento", 1]], [["prod_executor", 1], ["prod_fluxo", 1]]], evidence: { metric: "tasks_on_time", mins: [60, 120] }, effects: [[project("quarter", "Plano trimestral executável", "Do objetivo do trimestre até as missões da primeira semana.", ["Escolher o objetivo do trimestre", "Definir 3 marcos mensais", "Criar as missões da primeira semana", "Agendar a revisão do mês"])], [title("arquiteto-evolucao", "Arquiteto da Evolução")]] },
  { key: "adv_erudito", name: "Erudito Vital", description: "Estudo sustentável: aprender muito sem abrir mão da saúde.", icon: "GraduationCap", tags: ["aprendizado", "saúde", "estudo", "rotina"], between: ["aprendizado", "saude"], hero: 12, cost: 3, requires: [[["apr_memoria", 1]], [["saude_movimento", 2], ["saude_descanso", 1]]], evidence: { metric: "study_days", mins: [25, 50] }, effects: [[mission("estudo_movimento", { title: "Estudo com pausas ativas", description: "Blocos de estudo intercalados com pausas de movimento.", priority: "Média", difficulty: "medio", estimateMinutes: 90, steps: ["Bloco de estudo 25 min", "Pausa ativa 5 min", "Bloco de estudo 25 min", "Resumo do que aprendeu"] })], [habit("estudo_pausa", "Pausa ativa no estudo", "estudo", "levantar e alongar a cada bloco de estudo.")]] },
];

/* ───────────────────────────── montagem + validação ───────────────────────────── */

const RADIUS = [150, 235, 320, 405, 480];
const SPREAD = [0, 14, 11, 9, 0];

function buildCatalog(): SkillDef[] {
  const out: SkillDef[] = [];
  for (const b of BRANCHES.filter((x) => x.key !== "avancada")) {
    const raws = BRANCH_SKILLS[b.key as Exclude<BranchKey, "avancada">];
    raws.forEach((r, i) => {
      const tier = TIER_OF[i]!;
      const sameTier = raws.filter((_, j) => TIER_OF[j] === tier);
      const slot = sameTier.indexOf(r);
      const offset = sameTier.length === 1 ? 0 : (slot === 0 ? -1 : 1) * SPREAD[tier - 1]!;
      const deg = ((b.angle + offset) * Math.PI) / 180;
      const rad = RADIUS[tier - 1]!;
      out.push({
        key: r.key,
        name: r.name,
        description: r.description,
        branch: b.key,
        tier,
        icon: r.icon,
        rarity: RARITY[tier - 1]!,
        tags: r.tags,
        requires: (r.requires ?? []).map((g) => g.map(([skill, level]) => ({ skill, level }))),
        levels: r.effects.map((effects, li) => ({
          cost: TIER_COST[tier - 1]! + li,
          heroLevel: TIER_HERO[tier - 1]! + li * 2,
          evidence: r.evidence && (r.evidence.mins[li] ?? 0) > 0 ? { metric: r.evidence.metric, min: r.evidence.mins[li]! } : null,
          effects,
        })),
        pos: { x: Math.round(Math.cos(deg) * rad), y: Math.round(Math.sin(deg) * rad) },
      });
    });
  }
  for (const r of ADVANCED) {
    const a = BRANCHES.find((x) => x.key === r.between[0])!.angle;
    const c = BRANCHES.find((x) => x.key === r.between[1])!.angle;
    const deg = (((a + c) / 2) * Math.PI) / 180;
    out.push({
      key: r.key,
      name: r.name,
      description: r.description,
      branch: "avancada",
      tier: 5,
      icon: r.icon,
      rarity: "lendaria",
      tags: r.tags,
      requires: (r.requires ?? []).map((g) => g.map(([skill, level]) => ({ skill, level }))),
      levels: r.effects.map((effects, li) => ({ cost: r.cost + li, heroLevel: r.hero + li * 3, evidence: r.evidence ? { metric: r.evidence.metric, min: r.evidence.mins[li]! } : null, effects })),
      pos: { x: Math.round(Math.cos(deg) * 545), y: Math.round(Math.sin(deg) * 545) },
    });
  }
  return out;
}

/** Valida o grafo: chaves únicas, referências existentes, níveis exigidos válidos e AUSÊNCIA de ciclos. */
export function validateCatalog(list: SkillDef[]): void {
  const byKey = new Map<string, SkillDef>();
  for (const s of list) {
    if (byKey.has(s.key)) throw new Error(`Habilidade duplicada: ${s.key}`);
    if (!s.levels.length || s.levels.length > 5) throw new Error(`Níveis inválidos em ${s.key}`);
    byKey.set(s.key, s);
  }
  const effectKeys = new Set<string>();
  for (const s of list) {
    for (const g of s.requires) {
      if (!g.length) throw new Error(`Grupo vazio em ${s.key}`);
      for (const o of g) {
        const dep = byKey.get(o.skill);
        if (!dep) throw new Error(`${s.key} depende de ${o.skill}, que não existe`);
        if (o.level < 1 || o.level > dep.levels.length) throw new Error(`${s.key} exige ${o.skill} nível ${o.level} (máx ${dep.levels.length})`);
      }
    }
    for (const l of s.levels) for (const e of l.effects) {
      if (effectKeys.has(e.key)) throw new Error(`Efeito duplicado: ${e.key}`);
      effectKeys.add(e.key);
    }
  }
  const state = new Map<string, 1 | 2>();
  const visit = (k: string, path: string[]) => {
    if (state.get(k) === 2) return;
    if (state.get(k) === 1) throw new Error(`Ciclo de dependências: ${[...path, k].join(" → ")}`);
    state.set(k, 1);
    for (const g of byKey.get(k)!.requires) for (const o of g) visit(o.skill, [...path, k]);
    state.set(k, 2);
  };
  for (const s of list) visit(s.key, []);
}

export const SKILLS: SkillDef[] = buildCatalog();
validateCatalog(SKILLS);
export const SKILL_BY_KEY = new Map(SKILLS.map((s) => [s.key, s]));

/* ───────────────────────────── presets oficiais e PH ───────────────────────────── */

export interface PresetTarget { key: string; level: number }
export const BUILTIN_PRESETS: Array<{ id: string; name: string; description: string; icon: string; targets: PresetTarget[] }> = [
  {
    id: "equilibrado",
    name: "Equilibrado",
    description: "Evolução geral: a base de todos os seis caminhos.",
    icon: "Scale",
    targets: CORE_BRANCHES.flatMap((b) => {
      const list = SKILLS.filter((s) => s.branch === b);
      return [{ key: list[0]!.key, level: 2 }, { key: list[1]!.key, level: 1 }, { key: list[2]!.key, level: 1 }];
    }),
  },
  {
    id: "produtivo",
    name: "Produtivo",
    description: "Foco e execução: Produtividade, Foco e Gestão.",
    icon: "Zap",
    targets: [
      { key: "prod_aprendiz", level: 3 }, { key: "prod_planejador", level: 3 }, { key: "prod_priorizacao", level: 2 }, { key: "prod_prazos", level: 1 },
      { key: "foco_iniciado", level: 2 }, { key: "foco_pomodoro", level: 2 }, { key: "foco_blocos", level: 1 }, { key: "prod_executor", level: 1 },
      { key: "gest_organizador", level: 2 }, { key: "gest_metas", level: 1 },
    ],
  },
  {
    id: "academico",
    name: "Acadêmico",
    description: "Estudos e carreira: Aprendizado, Foco e Gestão.",
    icon: "GraduationCap",
    targets: [
      { key: "apr_aprendiz", level: 3 }, { key: "apr_leitor", level: 2 }, { key: "apr_explorador", level: 2 }, { key: "apr_memoria", level: 2 },
      { key: "foco_iniciado", level: 2 }, { key: "foco_pomodoro", level: 1 }, { key: "foco_blocos", level: 1 }, { key: "apr_pesquisador", level: 1 },
      { key: "gest_organizador", level: 1 }, { key: "gest_projetos", level: 1 },
    ],
  },
];

/** Regra central de PH: 1 por nível alcançado acima do 1 e +1 de marco a cada 5 níveis. */
export const POINT_RULES = {
  perLevel: 1,
  milestoneEvery: 5,
  milestoneBonus: 1,
  /** Conquistas oficiais de nível ouro/platina também concedem 1 PH (uma vez cada). */
  achievementTiers: ["gold", "platinum"] as const,
  achievementBonus: 1,
};

export const RESET_DEFAULTS = { cooldownDays: 7, refundPct: 100 };

/** Títulos do Revisor-da-Árvore (por PH investidos) — progressão gamificada, não métrica real. */
export const TREE_TITLES = [
  { min: 0, title: "Aprendiz das Habilidades" },
  { min: 10, title: "Especialista da Jornada" },
  { min: 30, title: "Mestre das Runas" },
  { min: 60, title: "Guardião dos Talentos" },
  { min: 100, title: "Arquiteto da Evolução" },
];

export const ALL_EFFECTS: Array<EffectDef & { skill: string; level: number }> = SKILLS.flatMap((s) => s.levels.flatMap((l, i) => l.effects.map((e) => ({ ...e, skill: s.key, level: i + 1 }))));
