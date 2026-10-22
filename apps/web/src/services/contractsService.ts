import { api } from "./api";
import type { Difficulty, Task, TaskPriority } from "@/types";

/** Espelho de /api/contracts (todas as rotas isoladas pelo usuário logado). */
export type ContractStatus = "ativo" | "concluido" | "arquivado";

export interface Contract {
  id: string;
  title: string;
  description: string | null;
  objective: string | null;
  difficulty: Difficulty;
  status: ContractStatus;
  dueDate: string | null;
  /** Cláusulas do documento (todas opcionais; contratos antigos vêm com null). */
  startDate: string | null;
  weeklyHours: number | null;
  why: string | null;
  rewardText: string | null;
  stakes: string | null;
  aiGenerated: boolean;
  completedAt: string | null;
  createdAt: string;
  totalTasks: number;
  doneTasks: number;
  progressPct: number;
  reward: { xp: number; coins: number };
  earned: { xp: number; coins: number };
  /** Meta/Projeto anexados a este contrato (muitos contratos representam um objetivo maior). */
  goalId: string | null;
  goalTitle: string | null;
  projectId: string | null;
  projectName: string | null;
}

export interface ContractTaskInput {
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  difficulty?: Difficulty | null;
  dueDate?: string | null;
  startDate?: string | null;
  estimateMinutes?: number | null;
}

/** Dados para criar uma Meta nova diretamente a partir do contrato. */
export interface NewGoalInput {
  title: string;
  dueDate?: string | null;
}

/** Dados para criar um Projeto novo diretamente a partir do contrato. */
export interface NewProjectInput {
  name: string;
  startDate?: string | null;
  dueDate?: string | null;
}

export interface ContractInput {
  title: string;
  description?: string | null;
  objective?: string | null;
  difficulty: Difficulty;
  dueDate?: string | null;
  startDate?: string | null;
  weeklyHours?: number | null;
  why?: string | null;
  rewardText?: string | null;
  stakes?: string | null;
  aiGenerated?: boolean;
  tasks?: ContractTaskInput[];
  /** Meta/Projeto existente a anexar, ou dados para criar um novo. */
  goalId?: string | null;
  projectId?: string | null;
  newGoal?: NewGoalInput | null;
  newProject?: NewProjectInput | null;
}

/** Tarefa sugerida pela IA (ainda não salva). */
export interface ProposedTask {
  title: string;
  description: string | null;
  priority: TaskPriority;
  difficulty: Difficulty;
  startInDays?: number | null;
  dueInDays: number | null;
  estimateMinutes: number | null;
}

/** Meta sugerida pela IA junto com o contrato (quando fizer sentido). */
export interface SuggestedGoal {
  title: string;
  dueInDays: number | null;
}

/** Projeto sugerido pela IA junto com o contrato (quando fizer sentido). */
export interface SuggestedProject {
  name: string;
  startInDays: number;
  dueInDays: number | null;
}

export interface ContractProposal {
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
  tasks: ProposedTask[];
  goal: SuggestedGoal | null;
  project: SuggestedProject | null;
}

/** Parâmetros que o usuário passa para a IA redigir o contrato. */
export interface ProposeContractInput {
  goal: string;
  why?: string;
  area?: string;
  difficulty?: Difficulty;
  startInDays?: number;
  deadlineDays?: number;
  weeklyHours?: number;
  taskCount?: "enxuto" | "equilibrado" | "detalhado";
  goalId?: string;
  projectId?: string;
  suggestGoalProject?: boolean;
}

export const contractsService = {
  list: () => api.get<Contract[]>("/contracts"),
  get: (id: string) => api.get<{ contract: Contract; tasks: Task[] }>(`/contracts/${id}`),
  create: (input: ContractInput) => api.post<Contract>("/contracts", input),
  update: (id: string, input: Partial<Omit<ContractInput, "tasks" | "aiGenerated">> & { status?: "ativo" | "arquivado" }) =>
    api.patch<Contract>(`/contracts/${id}`, input),
  remove: (id: string, deleteOpenTasks: boolean) => api.delete<void>(`/contracts/${id}${deleteOpenTasks ? "?tasks=open" : ""}`),
  addTasks: (id: string, tasks: ContractTaskInput[]) => api.post<Task[]>(`/contracts/${id}/tasks`, { tasks }),
  link: (id: string, taskId: string, linked: boolean) => api.post<void>(`/contracts/${id}/link`, { taskId, linked }),
  propose: (input: ProposeContractInput) =>
    api.post<{ proposal: ContractProposal }>("/contracts/ai/propose", input),
  proposeTasks: (id: string, hint?: string) => api.post<{ tasks: ProposedTask[] }>(`/contracts/${id}/ai/tasks`, { hint }),
};
