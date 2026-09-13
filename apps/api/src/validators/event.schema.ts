import { z } from "zod";

export const createEventSchema = z.object({
  title: z.string().trim().min(1, "Título é obrigatório").max(200),
  description: z.string().max(2000).optional().nullable(),
  startsAt: z.string().min(1, "Data de início é obrigatória"),
  endsAt: z.string().optional().nullable(),
  allDay: z.boolean().optional().default(false),
});

export const updateEventSchema = createEventSchema.partial();

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
