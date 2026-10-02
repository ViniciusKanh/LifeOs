import { Router } from "express";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";

/**
 * Importação de tarefas de outros apps (Todoist, Notion, Google Tasks).
 * O arquivo é lido e convertido NO NAVEGADOR (o usuário revisa a prévia);
 * aqui chega só a lista já normalizada, validada de novo. Projetos citados
 * por nome são reaproveitados se já existirem, ou criados sob demanda.
 */
export const importRouter = Router();
importRouter.use(requireAuth);

const STATUSES = ["Backlog", "A Fazer", "Em Andamento", "Em Revisão", "Concluído"] as const;

const importSchema = z.object({
  source: z.enum(["todoist", "notion", "google_tasks", "csv"]),
  createProjects: z.boolean().default(true),
  items: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        description: z.string().max(5000).optional().nullable(),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
        priority: z.enum(["Baixa", "Média", "Alta"]).default("Média"),
        status: z.enum(STATUSES).default("A Fazer"),
        projectName: z.string().trim().max(160).optional().nullable(),
      })
    )
    .min(1, "Nada para importar.")
    .max(1000, "No máximo 1000 tarefas por importação."),
});

importRouter.post("/tasks", rateLimit({ windowMs: 10 * 60 * 1000, max: 10 }), async (req, res) => {
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  const { items, createProjects } = parsed.data;
  const db = getDb();
  const ownerId = req.user!.id;

  // Projetos existentes do usuário, por nome (sem diferenciar maiúsculas).
  const existing = await db.execute({ sql: "SELECT id, name FROM projects WHERE owner_id = ? AND archived_at IS NULL", args: [ownerId] });
  const byName = new Map((existing.rows as unknown as Array<{ id: string; name: string }>).map((p) => [p.name.trim().toLowerCase(), p.id]));
  let projectsCreated = 0;

  const statements: Array<{ sql: string; args: Array<string | null> }> = [];
  for (const name of new Set(items.map((i) => i.projectName?.trim()).filter((n): n is string => !!n))) {
    if (byName.has(name.toLowerCase()) || !createProjects) continue;
    const id = nanoid();
    byName.set(name.toLowerCase(), id);
    projectsCreated += 1;
    statements.push({ sql: "INSERT INTO projects (id, owner_id, name, kind) VALUES (?, ?, ?, 'personal')", args: [id, ownerId, name] });
  }

  const now = new Date().toISOString();
  for (const it of items) {
    const projectId = it.projectName ? byName.get(it.projectName.trim().toLowerCase()) ?? null : null;
    statements.push({
      sql: `INSERT INTO tasks (id, owner_id, project_id, title, description, status, priority, due_date, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [nanoid(), ownerId, projectId, it.title, it.description ?? null, it.status, it.priority, it.dueDate ?? null, it.status === "Concluído" ? now : null],
    });
  }

  // Em lotes, numa transação por lote — se um lote falhar, nada dele fica pela metade.
  for (let i = 0; i < statements.length; i += 200) await db.batch(statements.slice(i, i + 200), "write");
  return res.status(201).json({ imported: items.length, projectsCreated });
});
