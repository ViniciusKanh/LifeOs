import { getDb } from "../db/client.js";
import { userTimezone } from "./gamificationService.js";
import { utcRangeFilter } from "./healthService.js";
import { localDayRangeUtc } from "./localDayService.js";

type Db = ReturnType<typeof getDb>;

export function isDailyReadingGoal(goal: { title: string; kind: string; unit: string | null; status: string }) {
  const title = goal.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const unit = (goal.unit ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return goal.kind === "numeric" && goal.status === "active" && unit.includes("pag") && /\b(por dia|cada dia|diari[ao])\b/.test(title);
}

/** Páginas lidas no dia local `date` (fuso do perfil; started_at é UTC). */
export async function pagesReadOn(db: Db, ownerId: string, date: string): Promise<number> {
  const { start, end } = localDayRangeUtc(date, await userTimezone(db, ownerId));
  const f = utcRangeFilter("started_at", start, end);
  const result = await db.execute({
    sql: `SELECT COALESCE(SUM(pages_read), 0) AS pages FROM reading_sessions WHERE owner_id = ? AND ${f.sql}`,
    args: [ownerId, ...f.args],
  });
  return Number(result.rows[0]?.pages ?? 0);
}
