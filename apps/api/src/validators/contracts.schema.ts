import { z } from "zod";

export const DIFFICULTIES = ["facil", "medio", "dificil", "epico"] as const;
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}/, "Data inválida.");

export const contractTaskSchema = z.object({
  title: z.string().trim().min(1, "Informe o título da tarefa.").max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  priority: z.enum(["Baixa", "Média", "Alta"]).optional(),
  difficulty: z.enum(DIFFICULTIES).optional().nullable(),
  dueDate: dateOnly.optional().nullable(),
  startDate: dateOnly.optional().nullable(),
  estimateMinutes: z.number().int().min(1).max(24 * 60).optional().nullable(),
});

/** Cláusulas do contrato (todas opcionais). */
const clauseFields = {
  startDate: dateOnly.optional().nullable(),
  weeklyHours: z.number().int().min(1).max(80).optional().nullable(),
  why: z.string().trim().max(600).optional().nullable(),
  rewardText: z.string().trim().max(300).optional().nullable(),
  stakes: z.string().trim().max(300).optional().nullable(),
};

const newGoalSchema = z.object({
  title: z.string().trim().min(2, "Dê um título à meta.").max(200),
  dueDate: dateOnly.optional().nullable(),
});

const newProjectSchema = z.object({
  name: z.string().trim().min(2, "Dê um nome ao projeto.").max(200),
  startDate: dateOnly.optional().nullable(),
  dueDate: dateOnly.optional().nullable(),
});

export const createContractSchema = z.object({
  title: z.string().trim().min(2, "Dê um nome ao contrato.").max(160),
  description: z.string().trim().max(2000).optional().nullable(),
  objective: z.string().trim().max(600).optional().nullable(),
  difficulty: z.enum(DIFFICULTIES).default("medio"),
  dueDate: dateOnly.optional().nullable(),
  ...clauseFields,
  aiGenerated: z.boolean().optional(),
  tasks: z.array(contractTaskSchema).max(30).optional(),
  // Vínculo com Meta/Projeto: um já existente (por id) ou um novo a criar
  // junto (ex.: sugestão da IA aceita pelo usuário). "new*" tem prioridade.
  goalId: z.string().trim().min(1).optional().nullable(),
  projectId: z.string().trim().min(1).optional().nullable(),
  newGoal: newGoalSchema.optional().nullable(),
  newProject: newProjectSchema.optional().nullable(),
});

export const updateContractSchema = z.object({
  title: z.string().trim().min(2).max(160).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  objective: z.string().trim().max(600).optional().nullable(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  dueDate: dateOnly.optional().nullable(),
  ...clauseFields,
  status: z.enum(["ativo", "arquivado"]).optional(),
  // null desvincula; omitido não mexe no vínculo atual.
  goalId: z.string().trim().min(1).optional().nullable(),
  projectId: z.string().trim().min(1).optional().nullable(),
});

export const addTasksSchema = z.object({ tasks: z.array(contractTaskSchema).min(1).max(30) });

export const linkTaskSchema = z.object({ taskId: z.string().min(1), linked: z.boolean() });

export const proposeContractSchema = z.object({
  goal: z.string().trim().min(8, "Descreva o objetivo com um pouco mais de detalhe.").max(1200),
  difficulty: z.enum(DIFFICULTIES).optional(),
  deadlineDays: z.number().int().min(1).max(365).optional(),
  // Parâmetros extras do contrato (todos opcionais): a IA dimensiona e data as tarefas por eles.
  why: z.string().trim().max(600).optional(),
  area: z.string().trim().max(60).optional(),
  startInDays: z.number().int().min(0).max(90).optional(),
  weeklyHours: z.number().int().min(1).max(80).optional(),
  taskCount: z.enum(["enxuto", "equilibrado", "detalhado"]).optional(),
  goalId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  // Liga/desliga a sugestão de Meta/Projeto pela IA (true por padrão).
  suggestGoalProject: z.boolean().optional(),
});

export const proposeTasksSchema = z.object({ hint: z.string().trim().max(600).optional() });

/** Recompensas por dificuldade (Meu Perfil). Os limites finos são aplicados no serviço. */
const rewardLevel = z.object({
  taskXp: z.number().int().min(0).max(1000),
  taskCoins: z.number().int().min(0).max(1000),
  contractXp: z.number().int().min(0).max(5000),
  contractCoins: z.number().int().min(0).max(5000),
});
export const difficultySettingsSchema = z.object({
  facil: rewardLevel,
  medio: rewardLevel,
  dificil: rewardLevel,
  epico: rewardLevel,
});

/** XP/moedas por prioridade (Missões). Limites finos aplicados no serviço. */
const priorityLevel = z.object({ xp: z.number().int().min(0).max(1000), coins: z.number().int().min(0).max(1000) });
export const prioritySettingsSchema = z.object({ Baixa: priorityLevel, "Média": priorityLevel, Alta: priorityLevel });
