import { z } from "zod";

export const createGoalSchema = z.object({
  parentGoalId: z.string().trim().min(1).optional().nullable(),
  title: z.string().trim().min(1, "Informe um título.").max(160),
  description: z.string().trim().max(2000).optional(),
  category: z.string().trim().max(60).optional(),
  kind: z.enum(["numeric", "percentage", "binary", "task_based"]).default("task_based"),
  targetValue: z.number().optional(),
  unit: z.string().trim().max(30).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato YYYY-MM-DD").optional(),
  period: z.enum(["semanal", "mensal", "semestral", "anual"]).optional(),
  nextAction: z.string().trim().max(160).optional(),
  nextActionDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato YYYY-MM-DD").optional(),
});

export const updateGoalSchema = createGoalSchema.partial().extend({
  status: z.enum(["active", "done", "abandoned"]).optional(),
  currentValue: z.number().optional(),
  nextAction: z.string().trim().max(160).optional().nullable(),
  nextActionDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato YYYY-MM-DD").optional().nullable(),
});

export const goalProgressSchema = z.object({
  value: z.number(),
  note: z.string().trim().max(500).optional(),
});
