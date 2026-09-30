import { nanoid } from "nanoid";
import type { getDb } from "../db/client.js";
import { bytesFromDataUri, mimeFromDataUri } from "../validators/attachment.schema.js";

type Db = ReturnType<typeof getDb>;

/** Teto por tarefa — suficiente para prints/evidências sem inchar o banco. */
export const MAX_ATTACHMENTS_PER_TASK = 20;

export interface TaskAttachment {
  id: string;
  taskId: string;
  kind: "image" | "document";
  dataUri: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  caption: string | null;
  createdAt: string;
}

function mapRow(r: Record<string, unknown>): TaskAttachment {
  return {
    id: r.id as string,
    taskId: r.task_id as string,
    kind: r.kind === "document" ? "document" : "image",
    dataUri: r.data_uri as string,
    fileName: (r.file_name as string | null) ?? null,
    mimeType: (r.mime_type as string | null) ?? null,
    sizeBytes: r.size_bytes == null ? null : Number(r.size_bytes),
    caption: (r.caption as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

/** Confirma que a tarefa pertence ao usuário antes de qualquer leitura/escrita de anexo. */
export async function taskBelongsToOwner(db: Db, ownerId: string, taskId: string): Promise<boolean> {
  const res = await db.execute({ sql: "SELECT id FROM tasks WHERE id = ? AND owner_id = ?", args: [taskId, ownerId] });
  return res.rows.length > 0;
}

export async function listTaskAttachments(db: Db, ownerId: string, taskId: string): Promise<TaskAttachment[]> {
  const res = await db.execute({
    sql: "SELECT * FROM task_attachments WHERE task_id = ? AND owner_id = ? ORDER BY created_at ASC",
    args: [taskId, ownerId],
  });
  return (res.rows as unknown as Array<Record<string, unknown>>).map(mapRow);
}

/** Cria o anexo; devolve null quando a tarefa já atingiu o limite. O tipo é deduzido do próprio data URI. */
export async function addTaskAttachment(
  db: Db,
  ownerId: string,
  taskId: string,
  input: { dataUri: string; fileName?: string | null; caption?: string | null }
): Promise<TaskAttachment | null> {
  const countRes = await db.execute({
    sql: "SELECT COUNT(*) AS total FROM task_attachments WHERE task_id = ? AND owner_id = ?",
    args: [taskId, ownerId],
  });
  if (Number((countRes.rows[0] as unknown as { total: number }).total) >= MAX_ATTACHMENTS_PER_TASK) return null;

  const mime = mimeFromDataUri(input.dataUri);
  const kind = mime === "application/pdf" ? "document" : "image";
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO task_attachments (id, task_id, owner_id, kind, data_uri, file_name, mime_type, size_bytes, caption)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, taskId, ownerId, kind, input.dataUri, input.fileName ?? null, mime, bytesFromDataUri(input.dataUri), input.caption ?? null],
  });
  await db.execute({ sql: "UPDATE tasks SET updated_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [taskId, ownerId] });
  const created = await db.execute({ sql: "SELECT * FROM task_attachments WHERE id = ?", args: [id] });
  return mapRow(created.rows[0] as unknown as Record<string, unknown>);
}

export async function updateTaskAttachmentCaption(db: Db, ownerId: string, taskId: string, attachmentId: string, caption: string | null) {
  const res = await db.execute({
    sql: "UPDATE task_attachments SET caption = ? WHERE id = ? AND task_id = ? AND owner_id = ?",
    args: [caption, attachmentId, taskId, ownerId],
  });
  return res.rowsAffected > 0;
}

export async function deleteTaskAttachment(db: Db, ownerId: string, taskId: string, attachmentId: string) {
  const res = await db.execute({
    sql: "DELETE FROM task_attachments WHERE id = ? AND task_id = ? AND owner_id = ?",
    args: [attachmentId, taskId, ownerId],
  });
  return res.rowsAffected > 0;
}
