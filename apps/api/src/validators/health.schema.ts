import { z } from "zod";
import { FIGHT_MODALITIES, WORKOUT_CATEGORIES } from "../services/healthService.js";

/**
 * Validação da área de Saúde e Bem-estar. Propositalmente sem
 * nenhum campo de diagnóstico/condição médica — apenas métricas
 * de bem-estar que o próprio usuário registra (ver seção 66 do
 * briefing: tratar como bem-estar, nunca como app médico).
 */

const noteSchema = z.string().trim().max(500);
const dateTimeSchema = z.string().datetime("Informe data/hora válida.");
const positiveInt = (message: string, max: number) =>
  z.number({ required_error: message, invalid_type_error: message }).int(message).positive(message).max(max);

function hasAtLeastOneField(value: Record<string, unknown>) {
  return Object.values(value).some((field) => field !== undefined);
}

function hasValidSleepRange(value: { wentToBedAt?: string; wokeUpAt?: string }) {
  if (!value.wentToBedAt || !value.wokeUpAt) return true;
  return new Date(value.wokeUpAt).getTime() > new Date(value.wentToBedAt).getTime();
}

export const waterEntrySchema = z.object({
  amountMl: z.number().int().positive().max(5000, "Quantidade muito alta para um único registro."),
  recordedAt: dateTimeSchema.optional(),
});

export const waterEntryUpdateSchema = waterEntrySchema
  .partial()
  .refine(hasAtLeastOneField, "Nenhum campo para atualizar.");

export const sleepEntrySchema = z
  .object({
    wentToBedAt: dateTimeSchema,
    wokeUpAt: dateTimeSchema,
    quality: z.number().int().min(1).max(5).optional(),
    notes: noteSchema.optional(),
  })
  .refine(hasValidSleepRange, {
    message: "O horário de acordar precisa ser depois do horário em que você dormiu.",
    path: ["wokeUpAt"],
  });

export const sleepEntryUpdateSchema = z
  .object({
    wentToBedAt: dateTimeSchema.optional(),
    wokeUpAt: dateTimeSchema.optional(),
    quality: z.number().int().min(1).max(5).nullable().optional(),
    notes: noteSchema.nullable().optional(),
  })
  .refine(hasAtLeastOneField, "Nenhum campo para atualizar.")
  .refine(hasValidSleepRange, {
    message: "O horário de acordar precisa ser depois do horário em que você dormiu.",
    path: ["wokeUpAt"],
  });

/* Exercícios — campos opcionais por tipo (musculação, luta, cardio). Tudo
 * opcional além de tipo e duração, para não travar o registro rápido. */
const workoutSetSchema = z.object({
  exercise: z.string().trim().min(1, "Informe o nome do exercício.").max(80),
  sets: z.number().int().positive().max(50).nullable().optional(),
  reps: z.number().int().positive().max(500).nullable().optional(),
  loadKg: z.number().min(0).max(1000).nullable().optional(),
});

const workoutDetailFields = {
  category: z.enum(WORKOUT_CATEGORIES, { errorMap: () => ({ message: "Tipo de exercício inválido." }) }),
  modality: z.enum(FIGHT_MODALITIES, { errorMap: () => ({ message: "Modalidade inválida." }) }).nullable().optional(),
  rpe: z.number().int().min(1, "Esforço vai de 1 a 10.").max(10, "Esforço vai de 1 a 10.").nullable().optional(),
  muscleGroups: z.string().trim().max(120).nullable().optional(),
  rounds: z.number().int().positive().max(100).nullable().optional(),
  roundMinutes: z.number().positive().max(60).nullable().optional(),
  sets: z.array(workoutSetSchema).max(40, "No máximo 40 exercícios por treino.").optional(),
};

export const workoutSchema = z.object({
  kind: z.string().trim().min(1, "Informe o tipo de exercício.").max(80).optional(),
  category: workoutDetailFields.category.optional(),
  modality: workoutDetailFields.modality,
  durationMinutes: positiveInt("Informe uma duração maior que zero.", 600),
  distanceKm: z.number().positive().max(500).nullable().optional(),
  calories: z.number().int().positive().max(5000).nullable().optional(),
  intensity: z.enum(["leve", "moderada", "intensa"]).nullable().optional(),
  rpe: workoutDetailFields.rpe,
  muscleGroups: workoutDetailFields.muscleGroups,
  rounds: workoutDetailFields.rounds,
  roundMinutes: workoutDetailFields.roundMinutes,
  sets: workoutDetailFields.sets,
  notes: noteSchema.nullable().optional(),
  performedAt: dateTimeSchema.optional(),
}).refine((value) => Boolean(value.kind || value.category), { message: "Informe o tipo de exercício.", path: ["category"] });

export const workoutUpdateSchema = z
  .object({
    kind: z.string().trim().min(1, "Informe o tipo de exercício.").max(80).optional(),
    category: workoutDetailFields.category.optional(),
    modality: workoutDetailFields.modality,
    durationMinutes: positiveInt("Informe uma duração maior que zero.", 600).optional(),
    distanceKm: z.number().positive().max(500).nullable().optional(),
    calories: z.number().int().positive().max(5000).nullable().optional(),
    intensity: z.enum(["leve", "moderada", "intensa"]).nullable().optional(),
    rpe: workoutDetailFields.rpe,
    muscleGroups: workoutDetailFields.muscleGroups,
    rounds: workoutDetailFields.rounds,
    roundMinutes: workoutDetailFields.roundMinutes,
    sets: workoutDetailFields.sets,
    notes: noteSchema.nullable().optional(),
    performedAt: dateTimeSchema.optional(),
  })
  .refine(hasAtLeastOneField, "Nenhum campo para atualizar.");

export const moodEntrySchema = z.object({
  mood: z.number().int().min(1).max(5),
  energy: z.number().int().min(1).max(5),
  stress: z.number().int().min(1).max(5).optional(),
  note: noteSchema.optional(),
  recordedAt: dateTimeSchema.optional(),
});

export const moodEntryUpdateSchema = z
  .object({
    mood: z.number().int().min(1).max(5).optional(),
    energy: z.number().int().min(1).max(5).optional(),
    stress: z.number().int().min(1).max(5).nullable().optional(),
    note: noteSchema.nullable().optional(),
    recordedAt: dateTimeSchema.optional(),
  })
  .refine(hasAtLeastOneField, "Nenhum campo para atualizar.");

export const healthMetricEntrySchema = z.object({
  metric: z.enum(["weight", "steps", "sitting_minutes", "meditation_minutes", "stretching_minutes"]),
  value: z.number(),
  unit: z.string().trim().max(20).optional(),
  notes: noteSchema.optional(),
  recordedAt: dateTimeSchema.optional(),
});
