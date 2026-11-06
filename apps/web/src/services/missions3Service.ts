import { api } from "./api";

/** Espelho de /api/missions3 e /api/mission-advisor (Missões 3.0 e Conselheiro de Missões). */

export type AdvisorMode = "create" | "improve" | "sequence" | "breakdown";
export type DetailLevel = "rapido" | "padrao" | "tecnico" | "academico";
export type LinkType = "project" | "goal" | "contract" | "campaign";

export interface ProposalLink {
  id: string | null;
  title: string | null;
  score: number | null;
  reason: string;
  alternatives: Array<{ id: string; title: string; score: number }>;
}
export interface ProposalSubtask {
  title: string;
  description: string | null;
  estimateMinutes: number | null;
  dependsOn: number | null;
  dueDate: string | null;
}
export interface MissionProposal {
  title: string;
  context: string;
  objective: string;
  scope: string;
  deliverable: string;
  expectedResult: string;
  steps: string[];
  acceptanceCriteria: string[];
  category: string;
  tags: string[];
  lifeArea: string | null;
  priority: "Baixa" | "Média" | "Alta";
  difficulty: "facil" | "medio" | "dificil" | "epico";
  estimateMinutes: number;
  startDate: string;
  dueDate: string | null;
  status: "Backlog" | "A Fazer";
  recurrence: "none" | "daily" | "weekly" | "monthly";
  subtasks: ProposalSubtask[];
  dependsOn: number | null;
  links: Record<LinkType, ProposalLink>;
  schedule: {
    feasible: boolean;
    hypothesis: boolean;
    finishDate: string | null;
    blocks: Array<{ date: string; start: string; end: string; minutes: number }>;
    freeMinutesUntilDue: number | null;
    conflicts: string[];
    alternatives: Array<{ label: string; dueDate?: string; estimateMinutes?: number }>;
  };
  reward: { xp: number; coins: number; basis: string; bonuses: string[] };
  justification: Array<{ field: string; text: string }>;
  confirmed: string[];
}
export interface AdvisorResult {
  sessionId: string;
  mode: AdvisorMode;
  message: string;
  items: MissionProposal[];
  targetTaskId: string | null;
  ai: { used: boolean; status: "ok" | "indisponivel" | "erro"; detail: string };
  context: { projects: number; goals: number; contracts: number; campaigns: number; linksEnabled: boolean; scheduleEnabled: boolean };
}
export interface ProposeInput {
  mode: AdvisorMode;
  message: string;
  detail: DetailLevel;
  sessionId?: string | null;
  taskId?: string | null;
  current?: MissionProposal[] | null;
  confirmed?: string[];
  source?: "missions" | "review";
  sourceRef?: string | null;
}

export interface MissionsOverview {
  today: string;
  indicators: {
    done: number;
    open: number;
    inProgress: number;
    today: number;
    overdue: number;
    completionRate: number | null;
    xpLast30: number;
    estimatedOpenMinutes: number;
    unestimatedOpen: number;
    executedLast30Minutes: number;
    definitions: Record<string, string>;
  };
  cards: Record<string, { subtasks: { total: number; done: number } | null; blockedBy: Array<{ id: string; title: string; done: boolean }>; xpEarned: number }>;
  analytics: {
    weeks: Array<{ week: string; done: number; created: number }>;
    estimateRatio: number | null;
    estimatedSample: number;
    leadTimeMedianDays: number | null;
    byPriority: Array<{ priority: string; open: number; done: number }>;
    onTimeRate: number | null;
    onTimeSample: number;
  };
}
export interface MissionsLoad {
  today: string;
  days: Array<{ date: string; freeMinutes: number; plannedMinutes: number; overloadMinutes: number; occupancyPct: number; level: string; window: string }>;
}

export const missions3Service = {
  overview: () => api.get<MissionsOverview>("/missions3/overview"),
  load: (days = 10) => api.get<MissionsLoad>(`/missions3/load?days=${days}`),
  reorder: (input: { taskId: string; status: string; beforeId?: string | null; afterId?: string | null }) => api.post<{ order: number }>("/missions3/reorder", input),
  archive: (id: string, archived: boolean) => api.post<{ archived: boolean }>(`/missions3/tasks/${id}/archive`, { archived }),
  propose: (input: ProposeInput) => api.post<AdvisorResult>("/mission-advisor/propose", input),
  recalc: (p: MissionProposal) => api.post<MissionProposal>("/mission-advisor/recalc", p),
  apply: (input: { sessionId: string; mode: AdvisorMode; items: MissionProposal[]; targetTaskId?: string | null; reserveBlocks?: boolean }) =>
    api.post<{ taskIds: string[]; duplicated: boolean; eventsCreated: number }>("/mission-advisor/apply", input),
  discard: (id: string) => api.post<{ ok: true }>(`/mission-advisor/sessions/${id}/discard`, {}),
  sessions: () => api.get<Array<{ id: string; mode: AdvisorMode; source: string; status: string; firstMessage: string; tasks: number; aiUsed: boolean; updatedAt: string }>>("/mission-advisor/sessions"),
};

export const MODE_LABEL: Record<AdvisorMode, string> = { create: "Criar Missão", improve: "Melhorar Missão", sequence: "Planejar Sequência", breakdown: "Quebrar em Etapas" };
export const DETAIL_LABEL: Record<DetailLevel, string> = { rapido: "Rápido", padrao: "Padrão", tecnico: "Técnico", academico: "Acadêmico" };
export const DIFFICULTY_LABEL: Record<MissionProposal["difficulty"], string> = { facil: "Fácil", medio: "Média", dificil: "Difícil", epico: "Épica" };
export const LINK_LABEL: Record<LinkType, string> = { project: "Projeto", goal: "Meta", contract: "Contrato", campaign: "Campanha" };
/** Colunas do quadro: os status oficiais com nomes de jornada (nenhum dado muda). */
export const BOARD_COLUMNS = [
  { status: "Backlog", label: "Backlog", hint: "Missões futuras e ideias.", tone: "muted" },
  { status: "A Fazer", label: "Em Planejamento", hint: "Definindo detalhes.", tone: "blue" },
  { status: "Em Andamento", label: "Em Execução", hint: "Colocando em prática.", tone: "purple" },
  { status: "Em Revisão", label: "Em Revisão", hint: "Validando a entrega.", tone: "orange" },
  { status: "Concluído", label: "Concluídas", hint: "Missões finalizadas.", tone: "green" },
] as const;
export const fmtMin = (m: number | null | undefined) => {
  if (m == null) return "—";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h${String(r).padStart(2, "0")}` : `${h}h`;
};
