import { Router } from "express";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { createEventSchema, updateEventSchema } from "../validators/event.schema.js";

export const eventsRouter = Router();

// Toda rota exige sessão — req.user.id é a única fonte de verdade
// sobre "de quem" são os dados (nunca aceitar owner vindo do corpo).
eventsRouter.use(requireAuth);

interface CalendarItem {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  sourceType: "manual" | "task" | "goal" | "academic_project";
  sourceId: string | null;
  link: string | null;
}

/**
 * GET /api/events?from=YYYY-MM-DD&to=YYYY-MM-DD — visão unificada do
 * calendário: eventos manuais (tabela `events`) somados a prazos reais
 * de outros módulos (tarefas com due_date, metas com due_date, defesa
 * de TCC/dissertação) — sem duplicar dado, só refletindo o que já
 * existe em cada tabela de origem. Sem `from`/`to`, devolve os
 * próximos 60 dias a partir de hoje.
 */
eventsRouter.get("/", async (req, res) => {
  const db = getDb();
  const ownerId = req.user!.id;
  const today = new Date().toISOString().slice(0, 10);
  const in60 = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const from = (req.query.from as string) || today;
  const to = (req.query.to as string) || in60;

  const [manual, tasks, goals, academic] = await Promise.all([
    db.execute({
      sql: `SELECT * FROM events WHERE owner_id = ? AND date(starts_at) BETWEEN date(?) AND date(?) ORDER BY starts_at ASC`,
      args: [ownerId, from, to],
    }),
    db.execute({
      sql: `SELECT id, title, due_date FROM tasks WHERE owner_id = ? AND due_date IS NOT NULL
            AND date(due_date) BETWEEN date(?) AND date(?) AND status != 'Concluído'`,
      args: [ownerId, from, to],
    }),
    db.execute({
      sql: `SELECT id, title, due_date FROM goals WHERE owner_id = ? AND due_date IS NOT NULL
            AND date(due_date) BETWEEN date(?) AND date(?) AND status = 'active'`,
      args: [ownerId, from, to],
    }),
    db.execute({
      sql: `SELECT id, title, defense_date FROM academic_projects WHERE owner_id = ? AND defense_date IS NOT NULL
            AND date(defense_date) BETWEEN date(?) AND date(?)`,
      args: [ownerId, from, to],
    }),
  ]);

  const items: CalendarItem[] = [];

  for (const row of manual.rows as unknown as Array<{
    id: string;
    title: string;
    description: string | null;
    starts_at: string;
    ends_at: string | null;
    all_day: number;
  }>) {
    items.push({
      id: row.id,
      title: row.title,
      description: row.description,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      allDay: !!row.all_day,
      sourceType: "manual",
      sourceId: null,
      link: null,
    });
  }
  for (const row of tasks.rows as unknown as Array<{ id: string; title: string; due_date: string }>) {
    items.push({
      id: `task_${row.id}`,
      title: row.title,
      description: null,
      startsAt: row.due_date,
      endsAt: null,
      allDay: true,
      sourceType: "task",
      sourceId: row.id,
      link: "/tarefas",
    });
  }
  for (const row of goals.rows as unknown as Array<{ id: string; title: string; due_date: string }>) {
    items.push({
      id: `goal_${row.id}`,
      title: `Meta: ${row.title}`,
      description: null,
      startsAt: row.due_date,
      endsAt: null,
      allDay: true,
      sourceType: "goal",
      sourceId: row.id,
      link: "/metas",
    });
  }
  for (const row of academic.rows as unknown as Array<{ id: string; title: string; defense_date: string }>) {
    items.push({
      id: `academic_${row.id}`,
      title: `Defesa: ${row.title}`,
      description: null,
      startsAt: row.defense_date,
      endsAt: null,
      allDay: true,
      sourceType: "academic_project",
      sourceId: row.id,
      link: "/educacao",
    });
  }

  items.sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1));
  return res.json(items);
});

/** POST /api/events — cria um evento manual */
eventsRouter.post("/", async (req, res) => {
  const parsed = createEventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const d = parsed.data;
  const db = getDb();
  const id = nanoid();

  await db.execute({
    sql: `INSERT INTO events (id, owner_id, title, description, starts_at, ends_at, all_day, source_type)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'manual')`,
    args: [id, req.user!.id, d.title, d.description ?? null, d.startsAt, d.endsAt ?? null, d.allDay ? 1 : 0],
  });

  const created = await db.execute({ sql: "SELECT * FROM events WHERE id = ? AND owner_id = ?", args: [id, req.user!.id] });
  return res.status(201).json(created.rows[0]);
});

/** PATCH /api/events/:id — só edita eventos manuais (os derivados de outras telas se editam na tela de origem) */
eventsRouter.patch("/:id", async (req, res) => {
  const parsed = updateEventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();

  const existing = await db.execute({
    sql: "SELECT id FROM events WHERE id = ? AND owner_id = ? AND source_type = 'manual'",
    args: [req.params.id, req.user!.id],
  });
  if (existing.rows.length === 0) {
    return res.status(404).json({ error: "Evento não encontrado." });
  }

  const fieldMap: Record<string, string> = {
    title: "title",
    description: "description",
    startsAt: "starts_at",
    endsAt: "ends_at",
    allDay: "all_day",
  };
  const sets: string[] = [];
  const args: Array<string | number | null> = [];
  for (const [key, column] of Object.entries(fieldMap)) {
    if (key in parsed.data) {
      const value = (parsed.data as Record<string, unknown>)[key];
      sets.push(`${column} = ?`);
      args.push(typeof value === "boolean" ? (value ? 1 : 0) : (value as string | null));
    }
  }
  if (sets.length === 0) {
    const current = await db.execute({ sql: "SELECT * FROM events WHERE id = ?", args: [req.params.id] });
    return res.json(current.rows[0]);
  }
  args.push(req.params.id, req.user!.id);

  await db.execute({ sql: `UPDATE events SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`, args });
  const updated = await db.execute({ sql: "SELECT * FROM events WHERE id = ? AND owner_id = ?", args: [req.params.id, req.user!.id] });
  return res.json(updated.rows[0]);
});

/** DELETE /api/events/:id — só remove eventos manuais */
eventsRouter.delete("/:id", async (req, res) => {
  const db = getDb();
  const result = await db.execute({
    sql: "DELETE FROM events WHERE id = ? AND owner_id = ? AND source_type = 'manual'",
    args: [req.params.id, req.user!.id],
  });
  if (result.rowsAffected === 0) {
    return res.status(404).json({ error: "Evento não encontrado (ou não pode ser removido por aqui)." });
  }
  return res.status(204).send();
});
