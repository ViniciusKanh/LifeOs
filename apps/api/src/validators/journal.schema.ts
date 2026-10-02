import { z } from "zod";
import { IMAGE_DATA_URI, PDF_DATA_URI, VIDEO_DATA_URI, fileNameSchema } from "./attachment.schema.js";

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
  /** "Como foi meu dia" — texto corrido (HTML do editor rico). Teto maior por ser o texto principal. */
  thoughts: z.string().trim().max(40000).optional().nullable(),
  gratitude: z.array(z.string().trim().max(300)).max(3).optional(),
  selfCare: z.array(z.string().trim().max(60)).max(20).optional(),
  selfCareOther: z.string().trim().max(300).optional().nullable(),
  nightTakeaway: z.string().trim().max(4000).optional().nullable(),
  focusTaskIds: z.array(z.string()).max(10).optional(),
  journalIds: z.array(z.string()).max(20).optional(),
  /** Localização real digitada/escolhida no editor (busca via /api/context/geocode) — nunca inventada. */
  locationLabel: z.string().trim().max(200).optional().nullable(),
  locationLat: z.number().min(-90).max(90).optional().nullable(),
  locationLng: z.number().min(-180).max(180).optional().nullable(),
  /** Etiquetas livres do dia (Fase 17 — protótipo Apple Journal). */
  tags: z.array(z.string().trim().min(1).max(40)).max(15).optional(),
});
export type JournalUpsertInput = z.infer<typeof journalUpsertSchema>;

// Upload do Diário: foto (comprimida no cliente — ver apps/web/src/utils/image.ts),
// vídeo curto ou PDF. O tipo real é deduzido do cabeçalho do data URI no
// backend; os tetos de tamanho vêm de attachment.schema.ts (limite de corpo
// da função serverless).
export const journalMediaCreateSchema = z.object({
  dataUri: z.union([IMAGE_DATA_URI, VIDEO_DATA_URI, PDF_DATA_URI], {
    errorMap: () => ({ message: "Envie uma foto, um vídeo (MP4/WebM/MOV) ou um PDF de até ~3 MB." }),
  }),
  caption: z.string().trim().max(200).optional().nullable(),
  story: z.string().trim().max(4000).optional().nullable(),
  fileName: fileNameSchema,
});

export const journalMediaUpdateSchema = z.object({
  caption: z.string().trim().max(200).optional().nullable(),
  story: z.string().trim().max(4000).optional().nullable(),
});

/**
 * Organização por IA confirmada pelo usuário. O Gemini só sugere
 * (POST /ai/organize); este payload é o que o usuário aceitou salvar.
 */
export const journalAiApplySchema = z.object({
  title: z.string().trim().max(120).optional().nullable(),
  summary: z.string().trim().max(1200).optional().nullable(),
  categories: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        points: z.array(z.string().trim().min(1).max(400)).max(12),
      })
    )
    .max(10),
  mediaCategories: z.array(z.object({ id: z.string().min(1), category: z.string().trim().min(1).max(60) })).max(12).optional(),
  tagsToAdd: z.array(z.string().trim().min(1).max(40)).max(15).optional(),
});
export type JournalAiApplyInput = z.infer<typeof journalAiApplySchema>;

/** Fase 12 (Diário): PIN de privacidade — só dígitos, 4 a 8 caracteres. */
export const journalPinSetSchema = z.object({
  pin: z.string().regex(/^\d{4,8}$/, "O PIN deve ter de 4 a 8 dígitos."),
});

export const journalPinVerifySchema = z.object({
  pin: z.string().min(1).max(8),
});

/** Fase 13 (Diário): nota de voz — gravada no navegador (MediaRecorder), enviada como data URI. Limite generoso pra alguns minutos de áudio comprimido. */
const JOURNAL_AUDIO_DATA_URI = z
  .string()
  .max(8_000_000, "Áudio muito grande — grave uma nota mais curta.")
  .regex(/^data:audio\/(webm|ogg|mp4|mpeg|wav);base64,/, "Formato de áudio inválido.");

export const journalAudioCreateSchema = z.object({
  dataUri: JOURNAL_AUDIO_DATA_URI,
  durationSeconds: z.number().int().min(1).max(1800),
  caption: z.string().trim().max(200).optional().nullable(),
});

/** Assistente de escrita: anotações soltas opcionais que a IA ajuda a transformar em texto. */
export const journalAiAssistSchema = z.object({
  notes: z.string().trim().max(2000).optional().nullable(),
});
