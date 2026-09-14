import { z } from "zod";

export const createWorkNoteSchema = z.object({
  title: z.string().trim().min(1, "Informe um título (ex: 1:1 com o gestor)").max(200),
  content: z.string().max(5000).optional().nullable(),
  occurredAt: z.string().min(1, "Informe a data"),
});

export type CreateWorkNoteInput = z.infer<typeof createWorkNoteSchema>;
