import { nanoid } from "nanoid";
import type { getDb } from "../db/client.js";
import { recordInAppNotification } from "./notificationTriggersService.js";
import { sendPushToUser } from "./pushService.js";

type Db = ReturnType<typeof getDb>;

/**
 * Automações do Grimório e de Metas — estado por usuário.
 *
 * O CATÁLOGO (o que cada automação faz, quando roda e a configuração
 * padrão) fica aqui no código; o banco guarda só o que é do usuário:
 * ligada/desligada, configuração, última/próxima execução e histórico
 * (automations + automation_runs).
 *
 * A execução reaproveita o cron diário já existente (/api/cron/notification-triggers)
 * e o botão "Executar agora" — não há um segundo motor de agendamento.
 * Idempotência: cada execução tem um run_key (ex.: o dia local) e a
 * tabela de execuções tem UNIQUE (automation_id, run_key).
 */

export const AUTOMATION_MODULES = ["grimoire", "goals", "bank", "education", "health", "agenda", "missions", "quests", "diary", "lab"] as const;
export type AutomationModule = (typeof AUTOMATION_MODULES)[number];
export type AutomationTrigger = "daily" | "weekly" | "event" | "manual";
export type RunStatus = "ok" | "skipped" | "error";

export interface AutomationDef {
  module: AutomationModule;
  key: string;
  label: string;
  description: string;
  trigger: AutomationTrigger;
  /** Explica o disparo em linguagem simples (mostrado na UI). */
  triggerLabel: string;
  usesAi: boolean;
  defaultEnabled: boolean;
  defaultConfig: Record<string, unknown>;
  /** Limites por chave numérica (padrão 0–1000). */
  bounds?: Record<string, [number, number]>;
  /** Validação da configuração completa (ex.: percentuais que somam 100%). */
  validate?: (config: Record<string, unknown>) => string | null;
}

/** Configuração recusada pela validação da automação (vira 400 na rota). */
export class AutomationConfigError extends Error {}

const daily = "Uma vez por dia (e em “Executar agora”)";
const weekly = "Toda segunda-feira (e em “Executar agora”)";

export const AUTOMATION_DEFS: AutomationDef[] = [
  {
    module: "grimoire",
    key: "diary_cards",
    label: "Gerar cartões do Diário",
    description: "Lê as entradas recentes do Diário com texto suficiente e propõe perguntas e respostas. Os cartões ficam na fila para você aprovar.",
    trigger: "daily",
    triggerLabel: "Uma vez por dia (e em “Executar agora”)",
    usesAi: true,
    defaultEnabled: false,
    defaultConfig: { deckId: null, minWords: 80, lookbackDays: 3, maxEntries: 2, cardsPerEntry: 5 },
  },
  {
    module: "grimoire",
    key: "smart_import",
    label: "Importar PDF / texto / anotações",
    description: "Documento → extração → resumo → cartões sugeridos. Roda a cada importação; nada entra no baralho sem aprovação.",
    trigger: "event",
    triggerLabel: "A cada importação",
    usesAi: true,
    defaultEnabled: true,
    defaultConfig: { cardsPerImport: 12, withSummary: true },
  },
  {
    module: "grimoire",
    key: "priority_review",
    label: "Revisão por prioridade",
    description: "Ordena a fila do dia por atraso, lapsos e facilidade (SM-2) e respeita um limite diário de revisões.",
    trigger: "event",
    triggerLabel: "Sempre que a fila do dia é montada",
    usesAi: false,
    defaultEnabled: true,
    defaultConfig: { dailyLimit: 150 },
  },
  {
    module: "grimoire",
    key: "smart_summary",
    label: "Resumo + flashcards com IA",
    description: "Ao importar ou colar um conteúdo, gera um resumo estruturado, conceitos-chave e perguntas — tudo editável antes de salvar.",
    trigger: "event",
    triggerLabel: "Junto com a importação",
    usesAi: true,
    defaultEnabled: true,
    defaultConfig: { concepts: true, questions: true },
  },
  {
    module: "grimoire",
    key: "study_reminder",
    label: "Lembrete de ritual diário",
    description: "Avisa quando há cartões para revisar hoje, no app e/ou por push.",
    trigger: "daily",
    triggerLabel: "Uma vez por dia, no lembrete diário do LifeOS",
    usesAi: false,
    defaultEnabled: false,
    defaultConfig: { preferredHour: 19, minDue: 1, inApp: true, push: true },
  },
  {
    module: "grimoire",
    key: "goal_sync",
    label: "Sincronizar com Metas",
    description: "Baralhos vinculados a uma meta avançam o progresso dela (1 dia de estudo por baralho ou o domínio do baralho), sem contar duas vezes.",
    trigger: "event",
    triggerLabel: "A cada revisão",
    usesAi: false,
    defaultEnabled: true,
    defaultConfig: {},
  },
  {
    module: "goals",
    key: "progress_sync",
    label: "Atualizar progresso automático",
    description: "Recalcula metas ligadas a projetos e ao Grimório e registra a evolução no histórico (só quando o valor muda).",
    trigger: "daily",
    triggerLabel: "Uma vez por dia (e em “Executar agora”)",
    usesAi: false,
    defaultEnabled: true,
    defaultConfig: {},
  },
  {
    module: "goals",
    key: "ai_breakdown",
    label: "Gerar subtarefas com IA",
    description: "Ao planejar uma meta, a IA propõe etapas, tarefas, marcos e prazos. Você edita e confirma antes de criar qualquer tarefa.",
    trigger: "manual",
    triggerLabel: "Pelo botão “Planejar com IA” de cada meta",
    usesAi: true,
    defaultEnabled: true,
    defaultConfig: {},
  },
  {
    module: "goals",
    key: "deadline_alerts",
    label: "Alertas de prazo",
    description: "Avisa sobre metas perto do prazo com progresso abaixo do esperado, metas atrasadas e metas paradas.",
    trigger: "daily",
    triggerLabel: "Uma vez por dia",
    usesAi: false,
    defaultEnabled: false,
    defaultConfig: { daysBefore: 7, stalledDays: 14, inApp: true, push: true },
  },
  {
    module: "goals",
    key: "weekly_plan",
    label: "Planejamento semanal",
    description: "Monta uma sugestão de semana com as tarefas das metas ativas, por prazo e prioridade, respeitando um limite por dia.",
    trigger: "weekly",
    triggerLabel: "Toda semana (e em “Executar agora”)",
    usesAi: false,
    defaultEnabled: false,
    defaultConfig: { tasksPerDay: 3, includeWeekend: false },
  },
  {
    module: "goals",
    key: "forecast",
    label: "Previsão de conclusão",
    description: "Estima a data de conclusão pelo ritmo real do histórico de progresso. Sem histórico suficiente, mostra que faltam dados.",
    trigger: "event",
    triggerLabel: "Ao abrir as metas",
    usesAi: false,
    defaultEnabled: true,
    defaultConfig: {},
  },
  {
    module: "goals",
    key: "smart_replan",
    label: "Replanejamento inteligente",
    description: "Para metas atrasadas ou em risco, sugere novo cronograma, redistribuição das tarefas e ajuste de prioridade — aplicado só com sua aprovação.",
    trigger: "daily",
    triggerLabel: "Uma vez por dia",
    usesAi: false,
    defaultEnabled: false,
    defaultConfig: {},
  },
  // ───────────────────────── Banco da Guilda ─────────────────────────
  // A reserva automática (A) é a regra de investimento automático já
  // existente (bank_auto_invest_rules) e é configurada no próprio Banco.
  {
    module: "bank",
    key: "vault_split",
    label: "B · Divisão entre cofres",
    description: "Divide a reserva automática entre os cofres da guilda pelos percentuais escolhidos (precisam somar 100%). Cofres abaixo do mínimo do plano ficam de fora daquela vez.",
    trigger: "event",
    triggerLabel: "A cada moeda ganha, junto da reserva automática",
    usesAi: false,
    defaultEnabled: false,
    defaultConfig: { split_cofre_livre: 40, split_cofre_aventureiro: 30, split_rota_mercador: 20, split_fundo_dragao: 10 },
    bounds: { split_cofre_livre: [0, 100], split_cofre_aventureiro: [0, 100], split_rota_mercador: [0, 100], split_fundo_dragao: [0, 100] },
    validate: (c) => {
      const total = ["split_cofre_livre", "split_cofre_aventureiro", "split_rota_mercador", "split_fundo_dragao"].reduce((a, k) => a + Number(c[k] ?? 0), 0);
      return total === 100 ? null : `Os percentuais precisam somar 100% (hoje somam ${total}%).`;
    },
  },
  {
    module: "bank",
    key: "loan_alerts",
    label: "C · Alertas de empréstimo",
    description: "Avisa quando o empréstimo está perto do vencimento ou atrasado. Pagamento automático só com o seu consentimento (opção abaixo) e só se o saldo cobrir a fatura inteira.",
    trigger: "daily",
    triggerLabel: daily,
    usesAi: false,
    defaultEnabled: true,
    defaultConfig: { daysBefore: 2, autoPay: false, inApp: true, push: false },
    bounds: { daysBefore: [1, 14] },
  },
  {
    module: "bank",
    key: "vault_goals",
    label: "D · Cofres ligados a metas",
    description: "Acompanha os cofres vinculados a uma meta e avisa quando um deles vence e pode ser resgatado para ela.",
    trigger: "daily",
    triggerLabel: daily,
    usesAi: false,
    defaultEnabled: true,
    defaultConfig: { inApp: true, push: false },
  },
  {
    module: "bank",
    key: "guild_report",
    label: "E · Relatório da guilda",
    description: "Resumo semanal com números reais do extrato: moedas que entraram e saíram, rendimentos, impostos e cofres vencendo.",
    trigger: "weekly",
    triggerLabel: weekly,
    usesAi: false,
    defaultEnabled: false,
    defaultConfig: { inApp: true, push: false },
  },
  // ─────────────────────── Jornada do Conhecimento ───────────────────────
  {
    module: "education",
    key: "smart_deadlines",
    label: "A · Prazos inteligentes",
    description: "Avisa sobre entregas, provas e prazos acadêmicos que vencem nos próximos dias e sobre os que já passaram sem conclusão.",
    trigger: "daily",
    triggerLabel: daily,
    usesAi: false,
    defaultEnabled: true,
    defaultConfig: { daysBefore: 5, inApp: true, push: false },
    bounds: { daysBefore: [1, 30] },
  },
  {
    module: "education",
    key: "weekly_study_plan",
    label: "B · Plano semanal de estudo",
    description: "Monta uma proposta de semana distribuindo sua meta de horas entre as disciplinas em andamento e os prazos próximos. Nada vira tarefa sem você revisar e aprovar.",
    trigger: "weekly",
    triggerLabel: weekly,
    usesAi: false,
    defaultEnabled: false,
    defaultConfig: { sessionsPerDay: 2, includeWeekend: false, sessionMinutes: 50 },
    bounds: { sessionsPerDay: [1, 6], sessionMinutes: [15, 180] },
  },
  {
    module: "education",
    key: "grimoire_link",
    label: "C · Integração com o Grimório",
    description: "Verifica quais disciplinas em andamento já têm baralho no Grimório e sugere criar um para as que ainda não têm.",
    trigger: "weekly",
    triggerLabel: weekly,
    usesAi: false,
    defaultEnabled: true,
    defaultConfig: { inApp: true },
  },
  {
    module: "education",
    key: "auto_progress",
    label: "D · Progresso automático",
    description: "Recalcula o progresso de cada formação pelas disciplinas concluídas, etapas da campanha e projetos acadêmicos. Ligada, substitui o progresso manual.",
    trigger: "daily",
    triggerLabel: daily,
    usesAi: false,
    defaultEnabled: false,
    defaultConfig: {},
  },
  {
    module: "education",
    key: "research_assistant",
    label: "E · Assistente de pesquisa",
    description: "No Conselheiro Acadêmico: organiza próximos passos da pesquisa a partir das suas etapas e prazos. Nunca inventa referências, autores ou resultados.",
    trigger: "manual",
    triggerLabel: "Pelo Conselheiro Acadêmico",
    usesAi: true,
    defaultEnabled: true,
    defaultConfig: {},
  },
  // ─────────────────────── Atributos do Personagem ───────────────────────
  {
    module: "health",
    key: "hydration",
    label: "A · Hidratação",
    description: "Lembrete diário com o resultado real de ontem e a meta de hoje. Não incentiva beber além da meta.",
    trigger: "daily",
    triggerLabel: daily,
    usesAi: false,
    defaultEnabled: false,
    defaultConfig: { inApp: true, push: true },
  },
  {
    module: "health",
    key: "sleep_routine",
    label: "B · Rotina de sono",
    description: "Lembra do seu ritual noturno no horário escolhido e mostra a última noite registrada.",
    trigger: "daily",
    triggerLabel: daily,
    usesAi: false,
    defaultEnabled: false,
    defaultConfig: { bedtimeHour: 23, inApp: true, push: false },
    bounds: { bedtimeHour: [18, 23] },
  },
  {
    module: "health",
    key: "mood_checkin",
    label: "C · Check-in de humor",
    description: "Se ontem ficou sem registro de humor e energia, convida para um check-in rápido. Sem interpretar nem diagnosticar nada.",
    trigger: "daily",
    triggerLabel: daily,
    usesAi: false,
    defaultEnabled: false,
    defaultConfig: { inApp: true, push: false },
  },
  {
    module: "health",
    key: "daily_summary",
    label: "D · Resumo diário",
    description: "Resumo de ontem nos quatro pilares (água, sono, movimento, humor), só com o que foi registrado.",
    trigger: "daily",
    triggerLabel: daily,
    usesAi: false,
    defaultEnabled: false,
    defaultConfig: { inApp: true, push: false },
  },
  {
    module: "health",
    key: "health_goals",
    label: "E · Metas de saúde",
    description: "Suas metas pessoais usadas na Vitalidade do Dia e nos rankings. Limites prudentes: sem metas extremas de água, sono ou treino.",
    trigger: "event",
    triggerLabel: "Usadas sempre que a Saúde é calculada",
    usesAi: false,
    defaultEnabled: true,
    defaultConfig: { waterGoalMl: 2500, sleepGoalMinutes: 480, weeklyWorkouts: 3 },
    bounds: { waterGoalMl: [1500, 4000], sleepGoalMinutes: [360, 600], weeklyWorkouts: [1, 7] },
  },
  {
    module: "health",
    key: "consistency_history",
    label: "F · Histórico de consistência",
    description: "Toda semana guarda quantos dias você registrou cada pilar — o histórico aparece no Rank de Saúde.",
    trigger: "weekly",
    triggerLabel: weekly,
    usesAi: false,
    defaultEnabled: true,
    defaultConfig: {},
  },
  // ───────────────────────── Agenda ─────────────────────────
  {
    module: "agenda",
    key: "auto_plan",
    label: "A · Planejamento automático",
    description: "Encaixa as missões planejadas da semana que ainda não têm horário nos espaços livres da janela escolhida. Gera uma proposta — nada é agendado sem sua aprovação.",
    trigger: "weekly",
    triggerLabel: "Toda segunda-feira (e em “Executar agora”)",
    usesAi: false,
    defaultEnabled: false,
    defaultConfig: { dayStartHour: 9, dayEndHour: 18 },
    bounds: { dayStartHour: [5, 12], dayEndHour: [13, 23] },
  },
  {
    module: "agenda",
    key: "conflicts",
    label: "B · Detecção de conflitos",
    description: "Procura compromissos com horários sobrepostos nos próximos 7 dias e avisa. A Agenda mostra o próximo horário livre como alternativa.",
    trigger: "daily",
    triggerLabel: "Uma vez por dia (e em “Executar agora”)",
    usesAi: false,
    defaultEnabled: true,
    defaultConfig: { inApp: true, push: false },
  },
  {
    module: "agenda",
    key: "module_sync",
    label: "C · Sincronização com módulos",
    description: "Prazos de missões, metas, projetos acadêmicos e blocos do Conselho aparecem na Agenda direto da fonte original (sem cópia, sem duplicar).",
    trigger: "event",
    triggerLabel: "Sempre que a Agenda é aberta",
    usesAi: false,
    defaultEnabled: true,
    defaultConfig: {},
  },
  {
    module: "agenda",
    key: "reminders",
    label: "D · Lembretes inteligentes",
    description: "Resumo da manhã com os compromissos do dia e o lembrete escolhido em cada evento. O agendador do LifeOS roda uma vez por dia, então não há aviso minuto a minuto.",
    trigger: "daily",
    triggerLabel: "Uma vez por dia",
    usesAi: false,
    defaultEnabled: false,
    defaultConfig: { inApp: true, push: true },
  },
  {
    module: "agenda",
    key: "focus_blocks",
    label: "E · Blocos de foco",
    description: "Crie sessões de trabalho com duração, objetivo e missão/meta vinculadas pela Torre do Tempo. Elas contam nas horas planejadas.",
    trigger: "event",
    triggerLabel: "Ao criar um bloco",
    usesAi: false,
    defaultEnabled: true,
    defaultConfig: {},
  },
  {
    module: "agenda",
    key: "replan",
    label: "F · Replanejamento",
    description: "Missões atrasadas ganham sugestão de novo dia (respeitando um limite por dia). Só o dia planejado muda, e só com sua aprovação — o prazo original fica intacto.",
    trigger: "daily",
    triggerLabel: "Uma vez por dia (e em “Executar agora”)",
    usesAi: false,
    defaultEnabled: false,
    defaultConfig: { maxPerDay: 3 },
    bounds: { maxPerDay: [1, 10] },
  },
  // ───────────────────────── Missões ─────────────────────────
  {
    module: "missions",
    key: "subtask_progress",
    label: "Progresso por subtarefas",
    description: "A barra da missão segue as subtarefas concluídas. A primeira subtarefa feita move a missão para Em Andamento. Concluir a missão (e o XP) continua sendo decisão sua.",
    trigger: "event",
    triggerLabel: "A cada subtarefa marcada",
    usesAi: false,
    defaultEnabled: true,
    defaultConfig: {},
  },
  {
    module: "missions",
    key: "due_alerts",
    label: "Alertas de vencimento",
    description: "Avisa sobre missões que vencem nos próximos dias e as que já passaram do prazo.",
    trigger: "daily",
    triggerLabel: "Uma vez por dia (e em “Executar agora”)",
    usesAi: false,
    defaultEnabled: false,
    defaultConfig: { daysBefore: 2, inApp: true, push: false },
    bounds: { daysBefore: [1, 14] },
  },
  {
    module: "missions",
    key: "priority_pick",
    label: "Missão prioritária",
    description: "Escolhe a Missão em Destaque: em andamento primeiro, depois atrasadas, prioridade e prazo mais próximo.",
    trigger: "event",
    triggerLabel: "Ao abrir as Missões",
    usesAi: false,
    defaultEnabled: true,
    defaultConfig: {},
  },
  {
    module: "missions",
    key: "sync_goals",
    label: "Sincronização com Projetos e Metas",
    description: "Missões vinculadas alimentam o progresso do projeto, da meta e da campanha (cálculo na origem, sem contagem dupla).",
    trigger: "event",
    triggerLabel: "A cada missão concluída",
    usesAi: false,
    defaultEnabled: true,
    defaultConfig: {},
  },
  // ───────────────────────── Quadro de Avisos ─────────────────────────
  {
    module: "quests",
    key: "quest_reminder",
    label: "Lembrete de quests",
    description: "Avisa quando há recompensas esperando no baú e quais quests do dia ainda estão abertas.",
    trigger: "daily",
    triggerLabel: "Uma vez por dia (e em “Executar agora”)",
    usesAi: false,
    defaultEnabled: false,
    defaultConfig: { inApp: true, push: false },
  },
  // ───────────────────────── Diário da Jornada ─────────────────────────
  {
    module: "diary",
    key: "write_reminder",
    label: "A · Lembrete de escrita",
    description: "Lembrete diário para escrever no seu horário preferido. O agendador roda uma vez por dia, então o aviso chega pela manhã indicando o horário escolhido.",
    trigger: "daily",
    triggerLabel: "Uma vez por dia (e em “Executar agora”)",
    usesAi: false,
    defaultEnabled: false,
    defaultConfig: { preferredHour: 21, inApp: true, push: true },
    bounds: { preferredHour: [0, 23] },
  },
  {
    module: "diary",
    key: "weekly_retro",
    label: "B · Resumo semanal",
    description: "Prepara o rascunho da retrospectiva da semana passada só com o que você escreveu (por regras, sem IA). Fica como rascunho até você editar e salvar.",
    trigger: "weekly",
    triggerLabel: "Toda segunda-feira (e em “Executar agora”)",
    usesAi: false,
    defaultEnabled: false,
    defaultConfig: { inApp: true },
  },
  {
    module: "diary",
    key: "day_context",
    label: "C · Contexto automático",
    description: "Mostra no Estado do Dia o que já foi registrado em Saúde, Hábitos, Missões e Leitura — direto da origem, sem copiar dados para o Diário.",
    trigger: "event",
    triggerLabel: "Ao abrir o Diário",
    usesAi: false,
    defaultEnabled: true,
    defaultConfig: {},
  },
  {
    module: "diary",
    key: "learnings_grimoire",
    label: "D · Aprendizados → Grimório",
    description: "Usa a automação “Gerar cartões do Diário” do Grimório: sugere flashcards dos seus aprendizados e só cria após sua aprovação.",
    trigger: "event",
    triggerLabel: "Configurada no Grimório",
    usesAi: true,
    defaultEnabled: true,
    defaultConfig: {},
  },
  {
    module: "diary",
    key: "goal_links",
    label: "E · Vinculação com metas",
    description: "Cada crônica pode ser vinculada a metas e projetos (vínculos do editor). Os vínculos aparecem na retrospectiva semanal.",
    trigger: "event",
    triggerLabel: "No editor da crônica",
    usesAi: false,
    defaultEnabled: true,
    defaultConfig: {},
  },
  {
    module: "diary",
    key: "memories",
    label: "F · Memórias da Jornada",
    description: "Se você escreveu neste mesmo dia em anos anteriores, sugere revisitar a crônica.",
    trigger: "daily",
    triggerLabel: "Uma vez por dia (e em “Executar agora”)",
    usesAi: false,
    defaultEnabled: false,
    defaultConfig: { inApp: true, push: false },
  },
  {
    module: "diary",
    key: "lab_notes",
    label: "G · Observações para o Laboratório",
    description: "Envia um trecho que VOCÊ escolher como observação de um experimento ativo (com a origem marcada). Nada do Diário é lido automaticamente.",
    trigger: "event",
    triggerLabel: "Pelo botão “Enviar ao Laboratório”",
    usesAi: false,
    defaultEnabled: true,
    defaultConfig: {},
  },
  // ───────────────────────── Laboratório da Jornada ─────────────────────────
  {
    module: "lab",
    key: "integrated_collection",
    label: "A · Coleta integrada",
    description: "As métricas dos experimentos vêm direto de Saúde, Hábitos, Educação, Missões e Foco (catálogo de métricas), com a origem indicada.",
    trigger: "event",
    triggerLabel: "Sempre que a análise é calculada",
    usesAi: false,
    defaultEnabled: true,
    defaultConfig: {},
  },
  {
    module: "lab",
    key: "checkin_reminder",
    label: "B · Check-in programado",
    description: "Avisa quando um experimento ativo ficou sem observação no dia anterior.",
    trigger: "daily",
    triggerLabel: "Uma vez por dia (e em “Executar agora”)",
    usesAi: false,
    defaultEnabled: false,
    defaultConfig: { inApp: true, push: true },
  },
  {
    module: "lab",
    key: "auto_progress",
    label: "C · Progresso automático",
    description: "O progresso separa dias decorridos de dias cumpridos (check-in feito ou verificação automática).",
    trigger: "event",
    triggerLabel: "A cada registro",
    usesAi: false,
    defaultEnabled: true,
    defaultConfig: {},
  },
  {
    module: "lab",
    key: "missing_data",
    label: "D · Dados ausentes",
    description: "Identifica experimentos com vários dias sem observação e avisa.",
    trigger: "daily",
    triggerLabel: "Uma vez por dia (e em “Executar agora”)",
    usesAi: false,
    defaultEnabled: true,
    defaultConfig: { gapDays: 3, inApp: true },
    bounds: { gapDays: [1, 14] },
  },
  {
    module: "lab",
    key: "pre_analysis",
    label: "E · Pré-análise",
    description: "Estatísticas descritivas (médias, medianas, comparação com o período anterior, cobertura e nível de evidência) calculadas pelo servidor sempre que há dados.",
    trigger: "event",
    triggerLabel: "Ao abrir os resultados",
    usesAi: false,
    defaultEnabled: true,
    defaultConfig: {},
  },
  {
    module: "lab",
    key: "cycle_end",
    label: "F · Encerramento do ciclo",
    description: "Quando o período previsto termina, avisa para revisar os resultados e documentar a conclusão.",
    trigger: "daily",
    triggerLabel: "Uma vez por dia (e em “Executar agora”)",
    usesAi: false,
    defaultEnabled: true,
    defaultConfig: { inApp: true, push: false },
  },
  {
    module: "lab",
    key: "goal_sync",
    label: "G · Sincronização com metas",
    description: "Experimentos podem ser vinculados a uma meta existente; o vínculo aparece na meta e no experimento.",
    trigger: "event",
    triggerLabel: "Ao vincular",
    usesAi: false,
    defaultEnabled: true,
    defaultConfig: {},
  },
  {
    module: "lab",
    key: "diary_integration",
    label: "H · Integração com o Diário",
    description: "Observações escolhidas no Diário entram como notas do experimento, com a origem marcada. Sem leitura automática das crônicas.",
    trigger: "event",
    triggerLabel: "Pelo Diário",
    usesAi: false,
    defaultEnabled: true,
    defaultConfig: {},
  },
];

export function findDef(module: AutomationModule, key: string): AutomationDef | undefined {
  return AUTOMATION_DEFS.find((d) => d.module === module && d.key === key);
}

export interface AutomationView extends AutomationDef {
  id: string | null;
  enabled: boolean;
  config: Record<string, unknown>;
  lastRunAt: string | null;
  lastStatus: RunStatus | null;
  lastMessage: string | null;
  nextRunAt: string | null;
}

type Row = Record<string, unknown>;

function parseConfig(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string") return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Próxima execução prevista pelo cron diário (12:05 UTC, ver vercel.json). */
export function nextCronRun(trigger: AutomationTrigger, now = new Date()): string | null {
  if (trigger !== "daily" && trigger !== "weekly") return null;
  const d = new Date(now);
  d.setUTCHours(12, 5, 0, 0);
  if (d <= now) d.setUTCDate(d.getUTCDate() + 1);
  if (trigger === "weekly") while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

export async function listAutomations(db: Db, ownerId: string, module: AutomationModule): Promise<AutomationView[]> {
  const r = await db.execute({ sql: "SELECT * FROM automations WHERE owner_id = ? AND module = ?", args: [ownerId, module] });
  const byKey = new Map((r.rows as unknown as Row[]).map((row) => [String(row.key), row]));
  return AUTOMATION_DEFS.filter((d) => d.module === module).map((def) => {
    const row = byKey.get(def.key);
    // _state é interno (ex.: o que já foi processado) e não vai para a UI.
    const stored = row ? parseConfig(row.config_json) : {};
    delete stored._state;
    return {
      ...def,
      id: row ? String(row.id) : null,
      enabled: row ? Number(row.enabled) === 1 : def.defaultEnabled,
      config: { ...def.defaultConfig, ...stored },
      lastRunAt: row?.last_run_at ? String(row.last_run_at) : null,
      lastStatus: (row?.last_status as RunStatus | null) ?? null,
      lastMessage: row?.last_message ? String(row.last_message) : null,
      nextRunAt: (row ? Number(row.enabled) === 1 : def.defaultEnabled) ? nextCronRun(def.trigger) : null,
    };
  });
}

/** Configuração efetiva (padrão + do usuário) sem criar linha no banco. */
export async function automationConfig(db: Db, ownerId: string, module: AutomationModule, key: string): Promise<{ enabled: boolean; config: Record<string, unknown> }> {
  const def = findDef(module, key);
  const r = await db.execute({ sql: "SELECT enabled, config_json FROM automations WHERE owner_id = ? AND module = ? AND key = ?", args: [ownerId, module, key] });
  const row = r.rows[0] as unknown as Row | undefined;
  const stored = row ? parseConfig(row.config_json) : {};
  delete stored._state;
  return { enabled: row ? Number(row.enabled) === 1 : (def?.defaultEnabled ?? false), config: { ...(def?.defaultConfig ?? {}), ...stored } };
}

export async function getAutomation(db: Db, ownerId: string, module: AutomationModule, key: string): Promise<AutomationView | null> {
  return (await listAutomations(db, ownerId, module)).find((a) => a.key === key) ?? null;
}

/** Garante a linha do usuário (necessária para gravar histórico). */
async function ensureRow(db: Db, ownerId: string, def: AutomationDef): Promise<string> {
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO automations (id, owner_id, module, key, enabled, config_json) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (owner_id, module, key) DO NOTHING`,
    args: [id, ownerId, def.module, def.key, def.defaultEnabled ? 1 : 0, JSON.stringify(def.defaultConfig)],
  });
  const r = await db.execute({ sql: "SELECT id FROM automations WHERE owner_id = ? AND module = ? AND key = ?", args: [ownerId, def.module, def.key] });
  return String(r.rows[0]!.id);
}

/** Só chaves conhecidas da configuração padrão são aceitas (sem texto livre arbitrário no estado). */
export function sanitizeConfig(def: AutomationDef, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, base] of Object.entries(def.defaultConfig)) {
    if (!(k in patch)) continue;
    const v = patch[k];
    const [lo, hi] = def.bounds?.[k] ?? [0, 1000];
    if (typeof base === "number" && typeof v === "number" && Number.isFinite(v)) out[k] = Math.max(lo, Math.min(hi, Math.round(v)));
    else if (typeof base === "boolean" && typeof v === "boolean") out[k] = v;
    else if (base === null && (v === null || (typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v)))) out[k] = v;
  }
  return out;
}

export async function updateAutomation(
  db: Db,
  ownerId: string,
  module: AutomationModule,
  key: string,
  patch: { enabled?: boolean; config?: Record<string, unknown> },
): Promise<AutomationView | null> {
  const def = findDef(module, key);
  if (!def) return null;
  const id = await ensureRow(db, ownerId, def);
  const raw = await db.execute({ sql: "SELECT config_json FROM automations WHERE id = ?", args: [id] });
  const config = { ...def.defaultConfig, ...parseConfig(raw.rows[0]?.config_json), ...(patch.config ? sanitizeConfig(def, patch.config) : {}) };
  if (def.validate) {
    const problem = def.validate(config);
    if (problem) throw new AutomationConfigError(problem);
  }
  await db.execute({
    sql: "UPDATE automations SET enabled = COALESCE(?, enabled), config_json = ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?",
    args: [patch.enabled === undefined ? null : patch.enabled ? 1 : 0, JSON.stringify(config), id, ownerId],
  });
  return getAutomation(db, ownerId, module, key);
}

/** Estado interno da automação (ex.: entradas do Diário já processadas) — não é editável pelo usuário. */
export async function readAutomationState(db: Db, ownerId: string, module: AutomationModule, key: string): Promise<Record<string, unknown>> {
  const r = await db.execute({ sql: "SELECT config_json FROM automations WHERE owner_id = ? AND module = ? AND key = ?", args: [ownerId, module, key] });
  const cfg = parseConfig(r.rows[0]?.config_json);
  return (cfg._state as Record<string, unknown> | undefined) ?? {};
}

export async function writeAutomationState(db: Db, ownerId: string, module: AutomationModule, key: string, state: Record<string, unknown>): Promise<void> {
  const def = findDef(module, key);
  if (!def) return;
  const id = await ensureRow(db, ownerId, def);
  const r = await db.execute({ sql: "SELECT config_json FROM automations WHERE id = ?", args: [id] });
  const cfg = parseConfig(r.rows[0]?.config_json);
  await db.execute({ sql: "UPDATE automations SET config_json = ? WHERE id = ? AND owner_id = ?", args: [JSON.stringify({ ...cfg, _state: state }), id, ownerId] });
}

/**
 * Abre uma execução. Devolve null se já existe uma com o mesmo run_key
 * (idempotência: o cron e o botão não executam a mesma janela duas vezes).
 */
export async function beginRun(db: Db, ownerId: string, def: AutomationDef, trigger: "manual" | "cron" | "event", runKey: string): Promise<string | null> {
  const automationId = await ensureRow(db, ownerId, def);
  const id = nanoid();
  const r = await db.execute({
    sql: `INSERT INTO automation_runs (id, owner_id, automation_id, trigger_type, run_key, status) VALUES (?, ?, ?, ?, ?, 'skipped')
          ON CONFLICT (automation_id, run_key) DO NOTHING`,
    args: [id, ownerId, automationId, trigger, runKey],
  });
  return r.rowsAffected > 0 ? id : null;
}

export async function finishRun(db: Db, ownerId: string, def: AutomationDef, runId: string, status: RunStatus, summary: string): Promise<void> {
  const automationId = await ensureRow(db, ownerId, def);
  await db.batch(
    [
      { sql: "UPDATE automation_runs SET status = ?, summary = ?, finished_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [status, summary.slice(0, 500), runId, ownerId] },
      {
        sql: "UPDATE automations SET last_run_at = datetime('now'), last_status = ?, last_message = ?, next_run_at = ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?",
        args: [status, summary.slice(0, 500), nextCronRun(def.trigger), automationId, ownerId],
      },
    ],
    "write",
  );
}

export async function listRuns(db: Db, ownerId: string, module: AutomationModule, key: string, limit = 15) {
  const r = await db.execute({
    sql: `SELECT r.trigger_type, r.status, r.summary, r.started_at, r.finished_at FROM automation_runs r
          JOIN automations a ON a.id = r.automation_id AND a.owner_id = r.owner_id
          WHERE r.owner_id = ? AND a.module = ? AND a.key = ? ORDER BY r.started_at DESC LIMIT ?`,
    args: [ownerId, module, key, limit],
  });
  return (r.rows as unknown as Row[]).map((x) => ({
    trigger: String(x.trigger_type),
    status: String(x.status) as RunStatus,
    summary: x.summary ? String(x.summary) : null,
    startedAt: String(x.started_at),
    finishedAt: x.finished_at ? String(x.finished_at) : null,
  }));
}

/** Notificação de automação: no app e/ou push, conforme a configuração da própria automação. */
export async function notifyFromAutomation(
  db: Db,
  ownerId: string,
  input: { eventType: string; title: string; body: string; url: string; inApp: boolean; push: boolean },
): Promise<{ inApp: boolean; push: number }> {
  let push = 0;
  if (input.inApp) await recordInAppNotification(db, ownerId, input.eventType, { title: input.title, body: input.body, url: input.url });
  if (input.push) {
    try {
      push = (await sendPushToUser(ownerId, { title: input.title, body: input.body, url: input.url })).sent;
    } catch (err) {
      console.error("[automação] falha no push:", err);
    }
  }
  return { inApp: input.inApp, push };
}

/** Segunda-feira (YYYY-MM-DD) da semana de um dia local. */
export function mondayKey(dayKey: string): string {
  const d = new Date(`${dayKey}T00:00:00Z`);
  const wd = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - wd);
  return d.toISOString().slice(0, 10);
}
