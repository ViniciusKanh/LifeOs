import type { getDb } from "../db/client.js";
import type { ProjectDetailsInput } from "../validators/project.schema.js";

type Db = ReturnType<typeof getDb>;
type SqlArg = string | number | null;

/**
 * Serviço do cadastro completo de projeto e da visão "Detalhe do projeto".
 *
 * Regra central: progresso, tempo, prazos e documentos de um projeto são
 * SEMPRE derivados das tarefas vinculadas (tasks.project_id) e dos anexos
 * dessas tarefas (task_attachments) — nunca copiados para a linha do
 * projeto, pra não existir duas fontes de verdade.
 */

const DONE_STATUS = "Concluído";

/** Mapeamento campo da API (camelCase) → coluna do banco. */
const DETAIL_COLUMNS: Record<string, string> = {
  name: "name",
  description: "description",
  kind: "kind",
  color: "color",
  status: "status",
  priority: "priority",
  startDate: "start_date",
  dueDate: "due_date",
  objective: "objective",
  scope: "scope",
  successCriteria: "success_criteria",
  client: "client",
  area: "area",
  budget: "budget",
  repositoryUrl: "repository_url",
  goalId: "goal_id",
};

/**
 * Monta os pares "coluna = ?" de um PATCH/INSERT a partir do input já
 * validado pelo zod. Arrays (links/tags) viram JSON; status "completed"
 * carimba completed_at (e sai dele limpa o carimbo).
 */
export function buildProjectColumnValues(input: ProjectDetailsInput & { name?: string }): Array<[string, SqlArg]> {
  const pairs: Array<[string, SqlArg]> = [];
  for (const [field, column] of Object.entries(DETAIL_COLUMNS)) {
    const value = (input as Record<string, unknown>)[field];
    if (value !== undefined) pairs.push([column, (value as SqlArg) ?? null]);
  }
  if (input.links !== undefined) pairs.push(["links", JSON.stringify(input.links)]);
  if (input.tags !== undefined) pairs.push(["tags", JSON.stringify(input.tags)]);
  if (input.status !== undefined) {
    pairs.push(["completed_at", input.status === "completed" ? new Date().toISOString() : null]);
  }
  return pairs;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Normaliza a linha crua do banco: links/tags voltam como arrays de verdade. */
export function serializeProjectRow(row: Record<string, unknown>) {
  return {
    ...row,
    status: (row.status as string | null) ?? "active",
    links: parseJson<Array<{ label: string; url: string }>>(row.links, []),
    tags: parseJson<string[]>(row.tags, []),
    task_count: Number(row.task_count ?? 0),
    done_count: Number(row.done_count ?? 0),
  };
}

export async function getOwnedProject(db: Db, ownerId: string, projectId: string) {
  const res = await db.execute({
    sql: `SELECT p.*,
            (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.owner_id = p.owner_id) AS task_count,
            (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.owner_id = p.owner_id AND t.status = ?) AS done_count
          FROM projects p WHERE p.id = ? AND p.owner_id = ?`,
    args: [DONE_STATUS, projectId, ownerId],
  });
  const row = res.rows[0] as unknown as Record<string, unknown> | undefined;
  return row ? serializeProjectRow(row) : null;
}

export interface ProjectOverview {
  totals: {
    tasks: number;
    done: number;
    open: number;
    overdue: number;
    dueThisWeek: number;
    progressPct: number;
    estimateMinutes: number;
    timeSpentMinutes: number;
    attachments: number;
    journalEntries: number;
  };
  byStatus: Array<{ status: string; count: number }>;
  byPriority: Array<{ priority: string; count: number }>;
  upcoming: Array<{ id: string; title: string; dueDate: string; status: string; priority: string }>;
  recentlyCompleted: Array<{ id: string; title: string; completedAt: string }>;
  journalEntries: Array<{ date: string; preview: string | null }>;
  /** Dias até o prazo do projeto (negativo = atrasado); null sem prazo definido. */
  daysToDeadline: number | null;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** Visão agregada do projeto — tudo derivado de tasks/task_attachments/journal_entry_links. */
export async function getProjectOverview(db: Db, ownerId: string, projectId: string, projectDueDate: string | null): Promise<ProjectOverview> {
  const today = todayIso();
  const weekAhead = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

  const [totalsRes, statusRes, priorityRes, upcomingRes, doneRes, attachRes, journalRes] = await Promise.all([
    db.execute({
      sql: `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) AS done,
              SUM(CASE WHEN status <> ? AND due_date IS NOT NULL AND substr(due_date, 1, 10) < ? THEN 1 ELSE 0 END) AS overdue,
              SUM(CASE WHEN status <> ? AND due_date IS NOT NULL AND substr(due_date, 1, 10) BETWEEN ? AND ? THEN 1 ELSE 0 END) AS due_week,
              COALESCE(SUM(estimate_minutes), 0) AS estimate,
              COALESCE(SUM(time_spent_minutes), 0) AS spent
            FROM tasks WHERE owner_id = ? AND project_id = ? AND parent_task_id IS NULL`,
      args: [DONE_STATUS, DONE_STATUS, today, DONE_STATUS, today, weekAhead, ownerId, projectId],
    }),
    db.execute({
      sql: "SELECT status, COUNT(*) AS c FROM tasks WHERE owner_id = ? AND project_id = ? AND parent_task_id IS NULL GROUP BY status ORDER BY c DESC",
      args: [ownerId, projectId],
    }),
    db.execute({
      sql: "SELECT priority, COUNT(*) AS c FROM tasks WHERE owner_id = ? AND project_id = ? AND parent_task_id IS NULL AND status <> ? GROUP BY priority",
      args: [ownerId, projectId, DONE_STATUS],
    }),
    db.execute({
      sql: `SELECT id, title, due_date, status, priority FROM tasks
            WHERE owner_id = ? AND project_id = ? AND status <> ? AND due_date IS NOT NULL
            ORDER BY due_date ASC LIMIT 6`,
      args: [ownerId, projectId, DONE_STATUS],
    }),
    db.execute({
      sql: `SELECT id, title, COALESCE(completed_at, updated_at) AS done_at FROM tasks
            WHERE owner_id = ? AND project_id = ? AND status = ?
            ORDER BY done_at DESC LIMIT 5`,
      args: [ownerId, projectId, DONE_STATUS],
    }),
    db.execute({
      sql: `SELECT COUNT(*) AS c FROM task_attachments a
            JOIN tasks t ON t.id = a.task_id
            WHERE a.owner_id = ? AND t.owner_id = ? AND t.project_id = ?`,
      args: [ownerId, ownerId, projectId],
    }),
    db.execute({
      sql: `SELECT e.entry_date, e.thoughts, e.intention FROM journal_entry_links l
            JOIN journal_entries e ON e.id = l.entry_id
            WHERE l.owner_id = ? AND e.owner_id = ? AND l.target_type = 'project' AND l.target_id = ?
            ORDER BY e.entry_date DESC LIMIT 10`,
      args: [ownerId, ownerId, projectId],
    }),
  ]);

  const t = totalsRes.rows[0] as unknown as Record<string, number | null>;
  const total = Number(t.total ?? 0);
  const done = Number(t.done ?? 0);

  let daysToDeadline: number | null = null;
  if (projectDueDate) {
    const due = new Date(`${projectDueDate.slice(0, 10)}T00:00:00Z`).getTime();
    const now = new Date(`${today}T00:00:00Z`).getTime();
    daysToDeadline = Math.round((due - now) / 86_400_000);
  }

  const plain = (html: unknown) =>
    typeof html === "string" ? html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 140) || null : null;

  return {
    totals: {
      tasks: total,
      done,
      open: total - done,
      overdue: Number(t.overdue ?? 0),
      dueThisWeek: Number(t.due_week ?? 0),
      progressPct: total > 0 ? Math.round((done / total) * 100) : 0,
      estimateMinutes: Number(t.estimate ?? 0),
      timeSpentMinutes: Number(t.spent ?? 0),
      attachments: Number((attachRes.rows[0] as unknown as { c: number }).c ?? 0),
      journalEntries: journalRes.rows.length,
    },
    byStatus: (statusRes.rows as unknown as Array<{ status: string; c: number }>).map((r) => ({ status: r.status, count: Number(r.c) })),
    byPriority: (priorityRes.rows as unknown as Array<{ priority: string; c: number }>).map((r) => ({ priority: r.priority, count: Number(r.c) })),
    upcoming: (upcomingRes.rows as unknown as Array<{ id: string; title: string; due_date: string; status: string; priority: string }>).map((r) => ({
      id: r.id,
      title: r.title,
      dueDate: r.due_date,
      status: r.status,
      priority: r.priority,
    })),
    recentlyCompleted: (doneRes.rows as unknown as Array<{ id: string; title: string; done_at: string }>).map((r) => ({
      id: r.id,
      title: r.title,
      completedAt: r.done_at,
    })),
    journalEntries: (journalRes.rows as unknown as Array<{ entry_date: string; thoughts: string | null; intention: string | null }>).map((r) => ({
      date: r.entry_date,
      preview: plain(r.thoughts) ?? plain(r.intention),
    })),
    daysToDeadline,
  };
}

/** Documentos do projeto = anexos das tarefas vinculadas a ele (sem duplicar arquivo). */
export async function listProjectDocuments(db: Db, ownerId: string, projectId: string) {
  const res = await db.execute({
    sql: `SELECT a.id, a.task_id, a.kind, a.data_uri, a.file_name, a.mime_type, a.size_bytes, a.caption, a.created_at,
                 t.title AS task_title, t.status AS task_status
          FROM task_attachments a
          JOIN tasks t ON t.id = a.task_id
          WHERE a.owner_id = ? AND t.owner_id = ? AND t.project_id = ?
          ORDER BY a.created_at DESC`,
    args: [ownerId, ownerId, projectId],
  });
  return (res.rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    taskId: r.task_id as string,
    taskTitle: r.task_title as string,
    taskStatus: r.task_status as string,
    kind: r.kind as "image" | "document",
    dataUri: r.data_uri as string,
    fileName: (r.file_name as string | null) ?? null,
    mimeType: (r.mime_type as string | null) ?? null,
    sizeBytes: r.size_bytes == null ? null : Number(r.size_bytes),
    caption: (r.caption as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}
