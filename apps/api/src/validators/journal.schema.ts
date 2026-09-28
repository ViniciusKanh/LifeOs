import { z } from "zod";

/**
 * Campos manuais/criativos do Diário — o resto (humor, energia, sono,
 * insight do dia, foco sugerido, livro atual) é sempre derivado ao vivo
 * de outros módulos (ver journalService.ts), nunca salvo aqui.
 *
 * Os limites abaixo folgados em relação ao texto puro (Fase 3: os campos
 * narrativos agora guardam HTML do editor de texto rico — negrito, listas,
 * links etc. — que ocupa mais caracteres que o texto visível).
 */
export const journalUpsertSchema = z.object({
  intention: z.string().trim().max(4000).optional().nullable(),
  thoughts: z.string().trim().max(8000).optional().nullable(),
  gratitude: z.array(z.string().trim().max(300)).max(3).optional(),
  selfCare: z.array(z.string().trim().max(60)).max(20).optional(),
  selfCareOther: z.string().trim().max(300).optional().nullable(),
  challenges: z.string().trim().max(8000).optional().nullable(),
  lighterPlan: z.string().trim().max(4000).optional().nullable(),
  feelGood: z.string().trim().max(4000).optional().nullable(),
  nightMood: z.number().int().min(1).max(5).optional().nullable(),
  nightHelped: z.string().trim().max(4000).optional().nullable(),
  nightTakeaway: z.string().trim().max(4000).optional().nullable(),
  focusTaskIds: z.array(z.string()).max(10).optional(),
  journalIds: z.array(z.string()).max(20).optional(),
});
export type JournalUpsertInput = z.infer<typeof journalUpsertSchema>;

// Aceita apenas data URI de imagem (base64), já comprimida no cliente
// (ver apps/web/src/utils/image.ts) — teto generoso o bastante pra uma
// foto de diário em boa qualidade sem deixar o banco inchar (mesmo
// padrão do avatar em auth.schema.ts, com um teto um pouco maior porque
// aqui é o conteúdo principal, não um ícone pequeno).
const JOURNAL_PHOTO_DATA_URI = z
  .string()
  .max(3_000_000, "Imagem muito grande — escolha uma foto menor.")
  .regex(/^data:image\/(png|jpe?g|webp);base64,/, "Formato de imagem inválido.");

export const journalMediaCreateSchema = z.object({
  dataUri: JOURNAL_PHOTO_DATA_URI,
  caption: z.string().trim().max(200).optional().nullable(),
});

export const journalMediaUpdateSchema = z.object({
  caption: z.string().trim().max(200).optional().nullable(),
});
