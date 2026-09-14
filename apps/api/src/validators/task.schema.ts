import { z } from "zod";

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Título é obrigatório").max(200),
  description: z.string().max(5000).optional(),
  projectId: z.string().optional().nullable(),
  status: z.string().max(50).optional(),
  priority: z.enum(["Baixa", "Média", "Alta"]).optional().default("Média"),
  dueDate: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  estimateMinutes: z.number().int().nonnegative().optional(),
  // Priority Score profissional (Área Profissional): 1-5 cada, usado
  // em (impacto*urgência)/esforço — ver priorityService.ts. Opcionais:
  // a maioria das tarefas do dia a dia nunca precisa disso.
  impact: z.number().int().min(1).max(5).optional().nullable(),
  urgency: z.number().int().min(1).max(5).optional().nullable(),
  effort: z.number().int().min(1).max(5).optional().nullable(),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  timeSpentMinutes: z.number().int().nonnegative().optional(),
  completedAt: z.string().nullable().optional(),
});

export const moveTaskSchema = z.object({
  status: z.string().min(1).max(50),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
