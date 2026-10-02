import { z } from "zod";
import { IMAGE_DATA_URI, PDF_DATA_URI, fileNameSchema } from "./attachment.schema.js";

export const LIFE_ADMIN_KINDS = ["vencimento", "manutencao", "documento", "conta"] as const;
export const LIFE_ADMIN_CATEGORIES = ["veiculo", "casa", "documentos", "saude", "seguros", "impostos", "assinaturas", "pets", "outro"] as const;

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD.");

const baseShape = {
  kind: z.enum(LIFE_ADMIN_KINDS),
  title: z.string().trim().min(1, "Dê um nome ao item.").max(160),
  category: z.enum(LIFE_ADMIN_CATEGORIES).default("outro"),
  dueDate: dateSchema.optional().nullable(),
  recurrenceMonths: z.number().int().min(1).max(120).optional().nullable(),
  remindDaysBefore: z.number().int().min(0).max(365).default(15),
  amount: z.number().min(0).max(100_000_000).optional().nullable(),
  reference: z.string().trim().max(120).optional().nullable(),
  location: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
  // null remove o arquivo; ausente mantém o atual.
  fileDataUri: z.union([IMAGE_DATA_URI, PDF_DATA_URI]).optional().nullable(),
  fileName: fileNameSchema,
};

export const createLifeAdminSchema = z.object(baseShape);
export const updateLifeAdminSchema = z
  .object({ ...baseShape, status: z.enum(["active", "archived"]) })
  .partial()
  .extend({ category: z.enum(LIFE_ADMIN_CATEGORIES).optional(), remindDaysBefore: z.number().int().min(0).max(365).optional() });

export const markLifeAdminDoneSchema = z.object({
  doneAt: dateSchema.optional(),
  amount: z.number().min(0).max(100_000_000).optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
  /** Para itens sem recorrência: próximo vencimento informado à mão (ex.: nova CNH vale até…). */
  nextDueDate: dateSchema.optional().nullable(),
});

export type CreateLifeAdminInput = z.infer<typeof createLifeAdminSchema>;
export type UpdateLifeAdminInput = z.infer<typeof updateLifeAdminSchema>;
export type MarkLifeAdminDoneInput = z.infer<typeof markLifeAdminDoneSchema>;
