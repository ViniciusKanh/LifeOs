import { z } from "zod";

/**
 * Validação da área de Saúde e Bem-estar. Propositalmente sem
 * nenhum campo de diagnóstico/condição médica — apenas métricas
 * de bem-estar que o próprio usuário registra (ver seção 66 do
 * briefing: tratar como bem-estar, nunca como app médico).
 */

export const waterEntrySchema = z.object({
  amountMl: z.number().int().positive().max(5000, "Quantidade muito alta para um único registro."),
  recordedAt: z.string().datetime().optional(),
});

export const sleepEntrySchema = z.object({
  wentToBedAt: z.string().datetime("Informe data/hora válida."),
  wokeUpAt: z.string().datetime("Informe data/hora válida."),
  quality: z.number().int().min(1).max(5).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const workoutSchema = z.object({
  kind: z.string().trim().min(1, "Informe o tipo de exercício.").max(80),
  durationMinutes: z.number().int().positive().max(600).optional(),
  distanceKm: z.number().positive().max(500).optional(),
  calories: z.number().int().positive().max(5000).optional(),
  intensity: z.enum(["leve", "moderada", "intensa"]).optional(),
  notes: z.string().trim().max(500).optional(),
  performedAt: z.string().datetime().optional(),
});

export const moodEntrySchema = z.object({
  mood: z.number().int().min(1).max(5),
  energy: z.number().int().min(1).max(5),
  stress: z.number().int().min(1).max(5).optional(),
  note: z.string().trim().max(500).optional(),
  recordedAt: z.string().datetime().optional(),
});

export const healthMetricEntrySchema = z.object({
  metric: z.enum(["weight", "steps", "sitting_minutes", "meditation_minutes", "stretching_minutes"]),
  value: z.number(),
  unit: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(500).optional(),
  recordedAt: z.string().datetime().optional(),
});
