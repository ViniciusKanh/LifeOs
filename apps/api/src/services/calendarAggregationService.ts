import type { getDb } from "../db/client.js";

type Db = ReturnType<typeof getDb>;

export interface CalendarItem {
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
 * Visão unificada do calendário: eventos manuais (tabela `events`) somados a
 * prazos reais de outros módulos (tarefas com due_date, metas com due_date,
 * defesa de TCC/dissertação) — sem duplicar dado, só refletindo o que já
 * existe em cada tabela de origem. Extraído de events.routes.ts (GET /) para
 * ser reaproveitado também pelo feed de assinatura .ics (icsFeedService.ts).
 */
export async function getCalendarItems(db: Db, ownerId: string, from: string, to: string): Promise<CalendarItem[]> {
  const [manual, tasks, goals, academic] = await Promise.all([
    db.execute({
      sql: `SELECT * FROM events WHERE owner_id = ? AND starts_at >= date(?) AND starts_at < date(?, '+1 day') ORDER BY starts_at ASC`,
      args: [ownerId, from, to],
    }),
    db.execute({
      sql: `SELECT id, title, due_date FROM tasks WHERE owner_id = ? AND due_date IS NOT NULL
            AND due_date >= date(?) AND due_date < date(?, '+1 day') AND status != 'Concluído'`,
      args: [ownerId, from, to],
    }),
    db.execute({
      sql: `SELECT id, title, due_date FROM goals WHERE owner_id = ? AND due_date IS NOT NULL
            AND due_date >= date(?) AND due_date < date(?, '+1 day') AND status = 'active'`,
      args: [ownerId, from, to],
    }),
    db.execute({
      sql: `SELECT id, title, defense_date FROM academic_projects WHERE owner_id = ? AND defense_date IS NOT NULL
            AND defense_date >= date(?) AND defense_date < date(?, '+1 day')`,
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
  return items;
}
