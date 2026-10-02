import { z } from "zod";

/** Áreas da roda da vida — chaves estáveis; o rótulo fica no front. */
export const LIFE_AREAS = ["saude", "carreira", "financas", "relacionamentos", "familia", "desenvolvimento", "lazer", "espiritualidade"] as const;
export type LifeArea = (typeof LIFE_AREAS)[number];

/** Ciclo da meta: ano (2026), trimestre (2026-Q4) ou mês (2026-10). */
export const CYCLE_REGEX = /^\d{4}(-Q[1-4]|-(0[1-9]|1[0-2]))?$/;

export const visionSchema = z.object({
  vision: z.string().trim().max(4000).optional().nullable(),
  purpose: z.string().trim().max(400).optional().nullable(),
  values: z
    .array(z.object({ name: z.string().trim().min(1).max(60), description: z.string().trim().max(300).optional().nullable() }))
    .max(12)
    .optional(),
});

export const wheelSchema = z.object({
  assessedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  scores: z
    .array(z.object({ area: z.enum(LIFE_AREAS), score: z.number().int().min(0).max(10), note: z.string().trim().max(300).optional().nullable() }))
    .min(1)
    .max(LIFE_AREAS.length),
});

export const PERIODIC_KINDS = ["monthly", "quarterly", "annual"] as const;
export const PERIOD_KEY_REGEX: Record<(typeof PERIODIC_KINDS)[number], RegExp> = {
  monthly: /^\d{4}-(0[1-9]|1[0-2])$/,
  quarterly: /^\d{4}-Q[1-4]$/,
  annual: /^\d{4}$/,
};

export const periodicReviewSchema = z.object({
  wins: z.string().trim().max(6000).optional().nullable(),
  lessons: z.string().trim().max(6000).optional().nullable(),
  focusNext: z.string().trim().max(6000).optional().nullable(),
  energyScore: z.number().int().min(1).max(10).optional().nullable(),
});
