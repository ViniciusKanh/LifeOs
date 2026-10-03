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
  aiGenerated: boolean;
  completedAt: string | null;
  createdAt: string;
  totalTasks: number;
  doneTasks: number;
  progressPct: number;
  reward: { xp: number; coins: number };
  earned: { xp: number; coins: number };
}

export interface ContractTaskInput {
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  difficulty?: Difficulty | null;
  dueDate?: string | null;
  estimateMinutes?: number | null;
}

export interface ContractInput {
  title: string;
  description?: string | null;
  objective?: string | null;
  difficulty: Difficulty;
  dueDate?: string | null;
  aiGenerated?: boolean;
  tasks?: ContractTaskInput[];
}

/** Tarefa sugerida pela IA (ainda não salva). */
export interface ProposedTask {
  title: string;
  description: string | null;
  priority: TaskPriority;
  difficulty: Difficulty;
  dueInDays: number | null;
  estimateMinutes: number | null;
}

export interface ContractProposal {
  title: string;
  description: string | null;
  objective: string | null;
  difficulty: Difficulty;
  dueInDays: number | null;
  tasks: ProposedTask[];
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
  propose: (input: { goal: string; difficulty?: Difficulty; deadlineDays?: number }) =>
    api.post<{ proposal: ContractProposal }>("/contracts/ai/propose", input),
  proposeTasks: (id: string, hint?: string) => api.post<{ tasks: ProposedTask[] }>(`/contracts/${id}/ai/tasks`, { hint }),
};
