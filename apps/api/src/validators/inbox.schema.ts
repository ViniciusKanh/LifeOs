import { z } from "zod";

export const createInboxItemSchema = z.object({
  content: z.string().trim().min(1, "Escreva algo antes de capturar.").max(2000),
});

/**
 * Processar um item do inbox: "task" cria uma tarefa de verdade a
 * partir do conteúdo capturado (título vem do texto original, a
 * menos que o usuário edite antes de confirmar); "discard" só marca
 * o item como processado sem criar nada — a ideia foi registrada,
 * mas não virou ação.
 */
export const processInboxItemSchema = z.object({
  action: z.enum(["task", "discard"]),
  title: z.string().trim().min(1).max(200).optional(),
  projectId: z.string().trim().optional().nullable(),
  priority: z.enum(["Baixa", "Média", "Alta"]).optional(),
  dueDate: z.string().optional().nullable(),
});

export type CreateInboxItemInput = z.infer<typeof createInboxItemSchema>;
export type ProcessInboxItemInput = z.infer<typeof processInboxItemSchema>;
