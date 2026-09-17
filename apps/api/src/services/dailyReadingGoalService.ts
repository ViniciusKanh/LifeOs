import { getDb } from "../db/client.js";

type Db = ReturnType<typeof getDb>;

export function isDailyReadingGoal(goal: { title: string; kind: string; unit: string | null; status: string }) {
  const title = goal.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const unit = (goal.unit ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return goal.kind === "numeric" && goal.status === "active" && unit.includes("pag") && /\b(por dia|cada dia|diari[ao])\b/.test(title);
}

export async function pagesReadOn(db: Db, ownerId: string, date: string): Promise<number> {
  const result = await db.execute({
    sql: "SELECT COALESCE(SUM(pages_read), 0) AS pages FROM reading_sessions WHERE owner_id = ? AND date(started_at) = date(?)",
    args: [ownerId, date],
  });
  return Number(result.rows[0]?.pages ?? 0);
}
