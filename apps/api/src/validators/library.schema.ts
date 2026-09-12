import { z } from "zod";

const BOOK_STATUS = ["Quero Ler", "Lendo", "Pausado", "Concluído", "Abandonado"] as const;
const BOOK_SOURCE = ["manual", "isbn", "google_books", "open_library"] as const;
const NOTE_KIND = ["note", "quote", "insight", "summary", "idea"] as const;

export const createBookSchema = z.object({
  isbn: z.string().trim().max(20).optional().nullable(),
  title: z.string().trim().min(1, "Título é obrigatório").max(300),
  author: z.string().trim().max(300).optional().nullable(),
  publisher: z.string().trim().max(300).optional().nullable(),
  coverUrl: z.string().trim().max(1000).optional().nullable(),
  publishedYear: z.number().int().min(0).max(9999).optional().nullable(),
  totalPages: z.number().int().nonnegative().optional().nullable(),
  categories: z.array(z.string()).optional(),
  description: z.string().max(5000).optional().nullable(),
  status: z.enum(BOOK_STATUS).optional().default("Quero Ler"),
  source: z.enum(BOOK_SOURCE).optional().default("manual"),
});

export const updateBookSchema = createBookSchema.partial().extend({
  currentPage: z.number().int().nonnegative().optional(),
  rating: z.number().int().min(1).max(5).optional().nullable(),
  personalNote: z.string().max(5000).optional().nullable(),
  startedAt: z.string().optional().nullable(),
  finishedAt: z.string().optional().nullable(),
});

export const bookNoteSchema = z.object({
  kind: z.enum(NOTE_KIND).optional().default("note"),
  content: z.string().trim().min(1, "Conteúdo é obrigatório").max(5000),
  page: z.number().int().nonnegative().optional().nullable(),
});

export const readingSessionSchema = z
  .object({
    startedAt: z.string().min(1, "Informe o início da sessão"),
    endedAt: z.string().optional().nullable(),
    durationMinutes: z.number().int().nonnegative().optional().nullable(),
    pagesRead: z.number().int().nonnegative().optional().default(0),
  })
  .refine((d) => d.durationMinutes != null || d.endedAt != null, {
    message: "Informe a duração ou o horário de término da sessão",
    path: ["durationMinutes"],
  });

export type CreateBookInput = z.infer<typeof createBookSchema>;
export type UpdateBookInput = z.infer<typeof updateBookSchema>;
export type BookNoteInput = z.infer<typeof bookNoteSchema>;
export type ReadingSessionInput = z.infer<typeof readingSessionSchema>;
