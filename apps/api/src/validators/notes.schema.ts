import { z } from "zod";

export const NOTE_KINDS = ["nota", "ideia", "referencia"] as const;
export const NOTE_LINK_TYPES = ["note", "task", "project", "goal", "book", "journal", "education"] as const;
export type NoteLinkType = (typeof NOTE_LINK_TYPES)[number];

export const createNoteSchema = z.object({
  title: z.string().trim().min(1, "Dê um título à nota.").max(200),
  content: z.string().max(200_000).optional().nullable(),
  kind: z.enum(NOTE_KINDS).default("nota"),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  sourceUrl: z.string().trim().url("Link inválido.").max(1000).optional().nullable().or(z.literal("").transform(() => null)),
  pinned: z.boolean().optional(),
});

export const updateNoteSchema = createNoteSchema.partial().extend({ archived: z.boolean().optional() });

export const noteLinkSchema = z.object({
  targetType: z.enum(NOTE_LINK_TYPES),
  targetId: z.string().trim().min(1).max(64),
});
