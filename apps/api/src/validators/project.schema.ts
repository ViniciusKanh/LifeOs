import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Informe um nome para o projeto").max(160),
  description: z.string().trim().max(2000).optional().nullable(),
  kind: z.enum(["personal", "workspace", "professional", "academic"]).optional().default("personal"),
  color: z.string().trim().max(20).optional().nullable(),
  parentId: z.string().optional().nullable(),
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  color: z.string().trim().max(20).optional().nullable(),
  archived: z.boolean().optional(),
});

export const addDependencySchema = z.object({
  dependsOnId: z.string().min(1, "Informe a tarefa da qual esta depende."),
});
