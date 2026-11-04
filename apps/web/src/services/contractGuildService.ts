import { api } from "./api";
import type { Difficulty } from "@/types";
import type { Contract } from "./contractsService";

/** Espelho de /api/contract-guild (Contratos 3.0 — Guilda dos Pactos). */

export type PactPhase = "rascunho" | "ativo" | "em_andamento" | "pausado" | "pronto_selar" | "cumprido" | "arquivado" | "cancelado";
export type SealCode = "disciplina" | "constancia" | "conhecimento" | "execucao" | "maestria";
export type RiskLevel = "baixo" | "moderado" | "alto" | "sem_dados";
export type StageStatus = "pendente" | "ativa" | "concluida";

export interface PactCard extends Contract {
  phase: PactPhase;
  stages: Array<{ id: string; name: string; status: StageStatus; total: number; done: number }>;
  stagesDone: number;
  streak: number;
  bestStreak: number;
  daysLeft: number | null;
  overdueOpen: number;
  risk: { level: RiskLevel; reasons: string[] } | null;
  seals: SealCode[];
  nextAction: string | null;
}

export interface GuildHub {
  today: string;
  contracts: PactCard[];
  indicators: { active: number; paused: number; fulfilled: number; readyToSeal: number; openTasks: number; xpEarned: number; streak: number; bestStreak: number; seals: number; sealKinds: number };
  reputation: { level: number; title: string; points: number; next: { min: number; title: string } | null; pct: number; breakdown: { sealed: number; seals: number; stagesDone: number; tasksDone: number } };
  sealCatalog: Array<{ code: SealCode; name: string; criterion: string; earned: number }>;
  sealHistory: Array<{ contractId: string; code: SealCode; contractTitle: string; earnedAt: string }>;
  featured: { id: string; auto: boolean } | null;
  risk: { contractId: string; title: string; level: RiskLevel; reasons: string[] } | null;
  rewards: { byDifficulty: Array<{ difficulty: Difficulty; xp: number; coins: number; taskXp: number }>; seal: { xp: number; coins: number }; minTasks: number };
  suggestions: Array<{ goalId: string; title: string; dueDate: string | null }>;
  recentEvents: Array<{ contractId: string; title: string; kind: string; detail: string | null; at: string }>;
}

export interface PactTask {
  id: string;
  contractId: string;
  stageId: string | null;
  title: string;
  status: string;
  done: boolean;
  dueDate: string | null;
  doneDay: string | null;
  priority: string;
  difficulty: Difficulty | null;
}

export interface PactStage {
  id: string;
  contractId: string;
  position: number;
  name: string;
  objective: string | null;
  criterion: string | null;
  status: StageStatus;
  completedAt: string | null;
  total: number;
  done: number;
  tasks: PactTask[];
}

export interface PactDetail {
  contract: PactCard;
  stages: PactStage[];
  unstagedTasks: PactTask[];
  events: Array<{ id: string; kind: string; detail: string | null; at: string }>;
  seals: Array<{ code: SealCode; earnedAt: string }>;
  sealPreview: Array<{ code: SealCode; name: string; criterion: string }>;
  sealRewardEach: { xp: number; coins: number };
  sealEligible: boolean;
  stageTemplate: Array<{ name: string; objective: string; criterion: string }>;
}

export interface PactProposalTask {
  title: string;
  description: string | null;
  priority: "Baixa" | "Média" | "Alta";
  difficulty: Difficulty;
  startInDays: number | null;
  dueInDays: number | null;
  estimateMinutes: number | null;
  dependsOn: string | null;
}

export interface PactProposal {
  title: string;
  description: string | null;
  objective: string | null;
  difficulty: Difficulty;
  startInDays: number;
  dueInDays: number | null;
  weeklyHours: number | null;
  why: string | null;
  rewardText: string | null;
  stakes: string | null;
  category: string | null;
  priority: "Baixa" | "Média" | "Alta";
  successCriteria: string[];
  stages: Array<{ name: string; objective: string | null; criterion: string | null; tasks: PactProposalTask[] }>;
}

export interface ScribeInput {
  goal: string;
  why?: string;
  category?: string;
  difficulty?: Difficulty;
  startInDays?: number;
  deadlineDays?: number;
  weeklyHours?: number;
  stageCount?: number;
}

export const contractGuildService = {
  hub: () => api.get<GuildHub>("/contract-guild"),
  detail: (id: string) => api.get<PactDetail>(`/contract-guild/${id}`),
  pause: (id: string, pause: boolean) => api.post<Contract>(`/contract-guild/${id}/pause`, { pause }),
  cancel: (id: string, reason: string | null) => api.post<Contract>(`/contract-guild/${id}/cancel`, { reason }),
  activate: (id: string) => api.post<Contract>(`/contract-guild/${id}/activate`, {}),
  replan: (id: string, input: { dueDate: string; spreadOverdue: boolean; reason?: string | null }) => api.post<{ contract: Contract; moved: number }>(`/contract-guild/${id}/replan`, input),
  feature: (id: string, featured: boolean) => api.post<{ ok: true }>(`/contract-guild/${id}/feature`, { featured }),
  saveStages: (id: string, stages: Array<{ id?: string; name: string; objective?: string | null; criterion?: string | null }>) => api.put<PactDetail>(`/contract-guild/${id}/stages`, { stages }),
  completeStage: (id: string, stageId: string, done: boolean) => api.post<PactDetail>(`/contract-guild/${id}/stages/${stageId}/complete`, { done }),
  setTaskStage: (id: string, taskId: string, stageId: string | null) => api.post<PactDetail>(`/contract-guild/${id}/tasks/${taskId}/stage`, { stageId }),
  seal: (id: string) => api.post<{ contract: Contract; seals: Array<{ code: SealCode; name: string; xp: number; coins: number }>; eligible: boolean }>(`/contract-guild/${id}/seal`, {}),
  scribe: (input: ScribeInput) => api.post<{ proposal: PactProposal }>("/contract-guild/ai/scribe", input),
};

/* ───────────── Rótulos e regras de exibição (sem regra de negócio) ───────────── */

export const PHASE_LABEL: Record<PactPhase, string> = {
  rascunho: "Rascunho",
  ativo: "Ativo",
  em_andamento: "Em andamento",
  pausado: "Pausado",
  pronto_selar: "Pronto para selar",
  cumprido: "Cumprido",
  arquivado: "Arquivado",
  cancelado: "Cancelado",
};
export const PHASE_TONE: Record<PactPhase, "muted" | "blue" | "green" | "orange" | "gold" | "purple" | "red"> = {
  rascunho: "muted",
  ativo: "blue",
  em_andamento: "green",
  pausado: "orange",
  pronto_selar: "gold",
  cumprido: "purple",
  arquivado: "muted",
  cancelado: "red",
};
export const RISK_LABEL: Record<RiskLevel, string> = { baixo: "Baixo", moderado: "Moderado", alto: "Alto", sem_dados: "Sem dados" };
export const CATEGORY_LABEL: Record<string, string> = {
  estudos: "Estudos",
  saude: "Saúde",
  trabalho: "Trabalho",
  financas: "Finanças",
  habitos: "Hábitos",
  leitura: "Leitura",
  criatividade: "Criatividade",
  relacionamentos: "Relacionamentos",
  casa: "Casa e rotina",
  outro: "Outro",
};
export const CATEGORIES = Object.keys(CATEGORY_LABEL);
export const EVENT_LABEL: Record<string, string> = {
  created: "Contrato firmado",
  draft_saved: "Rascunho salvo",
  activated: "Rascunho ativado",
  paused: "Pausado",
  resumed: "Retomado",
  replanned: "Replanejado",
  stage_done: "Etapa concluída",
  stage_reopened: "Etapa reaberta",
  stages_edited: "Etapas configuradas",
  ready_to_seal: "Pronto para selar",
  sealed: "Selado",
  archived: "Arquivado",
  reactivated: "Reativado",
  cancelled: "Cancelado",
  edited: "Cláusulas editadas",
};
