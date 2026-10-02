import { z } from "zod";

// Ciclo de vida do projeto — "completed" grava completed_at no backend.
export const PROJECT_STATUSES = ["planning", "active", "paused", "completed", "cancelled"] as const;
export const PROJECT_PRIORITIES = ["Baixa", "Média", "Alta", "Crítica"] as const;

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD.")
  .optional()
  .nullable();

const linkSchema = z.object({
  label: z.string().trim().min(1).max(80),
  url: z.string().trim().url("Link inválido.").max(500),
});

/** Campos de cadastro completo — compartilhados entre criação e edição. */
const projectDetailsShape = {
  description: z.string().trim().max(4000).optional().nullable(),
  color: z.string().trim().max(20).optional().nullable(),
  status: z.enum(PROJECT_STATUSES).optional(),
  priority: z.enum(PROJECT_PRIORITIES).optional().nullable(),
  startDate: dateSchema,
  dueDate: dateSchema,
  objective: z.string().trim().max(2000).optional().nullable(),
  scope: z.string().trim().max(4000).optional().nullable(),
  successCriteria: z.string().trim().max(2000).optional().nullable(),
  client: z.string().trim().max(160).optional().nullable(),
  area: z.string().trim().max(80).optional().nullable(),
  budget: z.number().min(0).max(1_000_000_000).optional().nullable(),
  repositoryUrl: z.string().trim().url("URL do repositório inválida.").max(500).optional().nullable().or(z.literal("").transform(() => null)),
  links: z.array(linkSchema).max(20).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  /** Meta a que o projeto serve (Direção) — o dono é validado na rota. */
  goalId: z.string().trim().min(1).max(64).optional().nullable(),
};

function datesInOrder(d: { startDate?: string | null; dueDate?: string | null }) {
  return !d.startDate || !d.dueDate || d.startDate <= d.dueDate;
}
const DATES_MESSAGE = { message: "O prazo não pode ser anterior à data de início.", path: ["dueDate"] };

export const createProjectSchema = z
  .object({
    name: z.string().trim().min(1, "Informe um nome para o projeto").max(160),
    kind: z.enum(["personal", "workspace", "professional", "academic"]).optional().default("personal"),
    parentId: z.string().optional().nullable(),
    ...projectDetailsShape,
  })
  .refine(datesInOrder, DATES_MESSAGE);

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    // Flegar um projeto já existente como profissional/workspace (ou
    // reverter) — é o que faz as tarefas dele passarem a contar (ou
    // deixarem de contar) na dimensão Profissional do Life Score.
    kind: z.enum(["personal", "workspace", "professional", "academic"]).optional(),
    archived: z.boolean().optional(),
    ...projectDetailsShape,
  })
  .refine(datesInOrder, DATES_MESSAGE);

export type ProjectDetailsInput = z.infer<typeof updateProjectSchema>;

export const addDependencySchema = z.object({
  dependsOnId: z.string().min(1, "Informe a tarefa da qual esta depende."),
});
