import { Router } from "express";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { journalUpsertSchema } from "../validators/journal.schema.js";
import { getJournalAutoData } from "../services/journalService.js";

export const journalRouter = Router();
journalRouter.use(requireAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(date: string) {
  return DATE_RE.test(date);
}

function parseJsonArray(value: unknown): string[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/**
 * GET /api/journal/:date — entrada do Diário do dia, já mesclada com os
 * dados reais derivados de outros módulos (humor, sono, insight, foco
 * sugerido, livro atual). Sempre devolve um objeto (mesmo sem entrada
 * salva ainda), pra o front não precisar tratar 404 como caso especial.
 */
async function buildJournalResponse(db: ReturnType<typeof getDb>, ownerId: string, date: string) {
  const [entryRes, auto] = await Promise.all([
    db.execute({ sql: "SELECT * FROM journal_entries WHERE owner_id = ? AND entry_date = ?", args: [ownerId, date] }),
    getJournalAutoData(db, ownerId, date),
  ]);
  const row = entryRes.rows[0] as unknown as Record<string, unknown> | undefined;
  return {
    date,
    intention: row?.intention ?? null,
    thoughts: row?.thoughts ?? null,
    gratitude: parseJsonArray(row?.gratitude),
    selfCare: parseJsonArray(row?.self_care),
    selfCareOther: row?.self_care_other ?? null,
    challenges: row?.challenges ?? null,
    lighterPlan: row?.lighter_plan ?? null,
    feelGood: row?.feel_good ?? null,
    nightMood: row?.night_mood ?? null,
    nightHelped: row?.night_helped ?? null,
    nightTakeaway: row?.night_takeaway ?? null,
    focusTaskIds: parseJsonArray(row?.focus_task_ids),
    auto,
  };
}

journalRouter.get("/:date", async (req, res) => {
  const { date } = req.params;
  if (!isValidDate(date)) return res.status(400).json({ error: "Data inválida. Use o formato YYYY-MM-DD." });
  const db = getDb();
  return res.json(await buildJournalResponse(db, req.user!.id, date));
});

/** PUT /api/journal/:date — cria ou atualiza a entrada do dia (upsert). */
journalRouter.put("/:date", async (req, res) => {
  const { date } = req.params;
  if (!isValidDate(date)) return res.status(400).json({ error: "Data inválida. Use o formato YYYY-MM-DD." });

  const parsed = journalUpsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const data = parsed.data;
  const db = getDb();
  const ownerId = req.user!.id;

  const existing = await db.execute({
    sql: "SELECT id FROM journal_entries WHERE owner_id = ? AND entry_date = ?",
    args: [ownerId, date],
  });
  const existingRow = existing.rows[0] as unknown as { id: string } | undefined;

  const values = {
    intention: data.intention ?? null,
    thoughts: data.thoughts ?? null,
    gratitude: JSON.stringify(data.gratitude ?? []),
    self_care: JSON.stringify(data.selfCare ?? []),
    self_care_other: data.selfCareOther ?? null,
    challenges: data.challenges ?? null,
    lighter_plan: data.lighterPlan ?? null,
    feel_good: data.feelGood ?? null,
    night_mood: data.nightMood ?? null,
    night_helped: data.nightHelped ?? null,
    night_takeaway: data.nightTakeaway ?? null,
    focus_task_ids: JSON.stringify(data.focusTaskIds ?? []),
  };

  if (existingRow) {
    await db.execute({
      sql: `UPDATE journal_entries SET
              intention = ?, thoughts = ?, gratitude = ?, self_care = ?, self_care_other = ?,
              challenges = ?, lighter_plan = ?, feel_good = ?, night_mood = ?, night_helped = ?,
              night_takeaway = ?, focus_task_ids = ?, updated_at = datetime('now')
            WHERE id = ?`,
      args: [
        values.intention,
        values.thoughts,
        values.gratitude,
        values.self_care,
        values.self_care_other,
        values.challenges,
        values.lighter_plan,
        values.feel_good,
        values.night_mood,
        values.night_helped,
        values.night_takeaway,
        values.focus_task_ids,
        existingRow.id,
      ],
    });
  } else {
    await db.execute({
      sql: `INSERT INTO journal_entries
              (id, owner_id, entry_date, intention, thoughts, gratitude, self_care, self_care_other,
               challenges, lighter_plan, feel_good, night_mood, night_helped, night_takeaway, focus_task_ids)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        nanoid(),
        ownerId,
        date,
        values.intention,
        values.thoughts,
        values.gratitude,
        values.self_care,
        values.self_care_other,
        values.challenges,
        values.lighter_plan,
        values.feel_good,
        values.night_mood,
        values.night_helped,
        values.night_takeaway,
        values.focus_task_ids,
      ],
    });
  }

  return res.json(await buildJournalResponse(db, ownerId, date));
});
