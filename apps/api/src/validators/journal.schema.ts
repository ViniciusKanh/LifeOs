import { z } from "zod";

/**
 * Campos manuais/criativos do Diário — o resto (humor, energia, sono,
 * insight do dia, foco sugerido, livro atual) é sempre derivado ao vivo
 * de outros módulos (ver journalService.ts), nunca salvo aqui.
 */
export const journalUpsertSchema = z.object({
  intention: z.string().trim().max(2000).optional().nullable(),
  thoughts: z.string().trim().max(4000).optional().nullable(),
  gratitude: z.array(z.string().trim().max(300)).max(3).optional(),
  selfCare: z.array(z.string().trim().max(60)).max(20).optional(),
  selfCareOther: z.string().trim().max(300).optional().nullable(),
  challenges: z.string().trim().max(4000).optional().nullable(),
  lighterPlan: z.string().trim().max(2000).optional().nullable(),
  feelGood: z.string().trim().max(2000).optional().nullable(),
  nightMood: z.number().int().min(1).max(5).optional().nullable(),
  nightHelped: z.string().trim().max(2000).optional().nullable(),
  nightTakeaway: z.string().trim().max(2000).optional().nullable(),
  focusTaskIds: z.array(z.string()).max(10).optional(),
});
export type JournalUpsertInput = z.infer<typeof journalUpsertSchema>;
