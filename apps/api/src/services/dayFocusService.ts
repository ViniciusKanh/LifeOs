import type { Client } from "@libsql/client";

/**
 * Foco do dia (missão principal) — antes ficava em journal_entries.focus_task_ids.
 * Com a remoção do Diário, vive na tabela própria day_focus (migração 0111).
 * A PRIMEIRA posição é a missão principal (bônus oficial em awardTaskCompletion).
 */

function parseIds(raw: unknown): string[] {
  try {
    const v = JSON.parse(String(raw ?? "[]")) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function getFocusTaskIds(db: Client, ownerId: string, day: string): Promise<string[]> {
  const r = await db.execute({ sql: "SELECT focus_task_ids FROM day_focus WHERE owner_id = ? AND day_key = ?", args: [ownerId, day] });
  return parseIds(r.rows[0]?.focus_task_ids);
}

export async function setFocusTaskIds(db: Client, ownerId: string, day: string, ids: string[]): Promise<void> {
  await db.execute({
    sql: `INSERT INTO day_focus (owner_id, day_key, focus_task_ids) VALUES (?, ?, ?)
          ON CONFLICT (owner_id, day_key) DO UPDATE SET focus_task_ids = excluded.focus_task_ids, updated_at = datetime('now')`,
    args: [ownerId, day, JSON.stringify(ids.slice(0, 10))],
  });
}
