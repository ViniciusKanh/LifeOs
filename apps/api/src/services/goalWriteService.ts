import { nanoid } from "nanoid";
import type { z } from "zod";
import type { getDb } from "../db/client.js";
import type { createGoalSchema } from "../validators/goals.schema.js";

type Db = ReturnType<typeof getDb>;
export type CreateGoalInput = z.infer<typeof createGoalSchema>;

/**
 * Insere uma meta já validada por createGoalSchema — extraído de
 * POST /api/goals para o Copilot gravar do mesmo jeito. A posse da meta
 * superior (parentGoalId) é validada por quem chama.
 */
export async function insertGoal(db: Db, ownerId: string, d: CreateGoalInput) {
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO goals (id, owner_id, parent_goal_id, title, description, category, kind, target_value, unit, due_date, period, next_action, next_action_due, life_area, cycle)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      ownerId,
      d.parentGoalId ?? null,
      d.title,
      d.description ?? null,
      d.category ?? null,
      d.kind,
      d.targetValue ?? null,
      d.unit ?? null,
      d.dueDate ?? null,
      d.period ?? null,
      d.nextAction ?? null,
      d.nextActionDue ?? null,
      d.lifeArea ?? null,
      d.cycle ?? null,
    ],
  });
  const created = await db.execute({ sql: "SELECT * FROM goals WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  return created.rows[0];
}
