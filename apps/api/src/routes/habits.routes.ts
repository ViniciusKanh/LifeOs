import { Router } from "express";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";

export const habitsRouter = Router();
habitsRouter.use(requireAuth);

const createHabitSchema = z.object({
  name: z.string().trim().min(1).max(120),
  icon: z.string().optional(),
  frequency: z.enum(["daily", "specific_days", "times_per_week", "weekly", "monthly"]).default("daily"),
  targetCount: z.number().int().positive().default(1),
});

const checkInSchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato YYYY-MM-DD"),
  count: z.number().int().positive().default(1),
});

/** GET /api/habits */
habitsRouter.get("/", async (req, res) => {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM habits WHERE owner_id = ? AND archived_at IS NULL ORDER BY created_at ASC",
    args: [req.user!.id],
  });
  return res.json(result.rows);
});

/** POST /api/habits */
habitsRouter.post("/", async (req, res) => {
  const parsed = createHabitSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO habits (id, owner_id, name, icon, frequency, target_count)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, req.user!.id, parsed.data.name, parsed.data.icon ?? null, parsed.data.frequency, parsed.data.targetCount],
  });
  const created = await db.execute({ sql: "SELECT * FROM habits WHERE id = ?", args: [id] });
  return res.status(201).json(created.rows[0]);
});

/** POST /api/habits/:id/check-in — registra (ou atualiza) o cumprimento do dia */
habitsRouter.post("/:id/check-in", async (req, res) => {
  const parsed = checkInSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();

  const habit = await db.execute({
    sql: "SELECT id FROM habits WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  if (habit.rows.length === 0) {
    return res.status(404).json({ error: "Hábito não encontrado." });
  }

  await db.execute({
    sql: `INSERT INTO habit_entries (id, habit_id, owner_id, entry_date, count)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (habit_id, entry_date) DO UPDATE SET count = excluded.count`,
    args: [nanoid(), req.params.id, req.user!.id, parsed.data.entryDate, parsed.data.count],
  });

  return res.status(204).send();
});

/** GET /api/habits/:id/entries?from=&to= — usado no heatmap de consistência */
habitsRouter.get("/:id/entries", async (req, res) => {
  const { from, to } = req.query as { from?: string; to?: string };
  const db = getDb();

  const conditions = ["habit_id = ?", "owner_id = ?"];
  const args: Array<string | number> = [req.params.id, req.user!.id];
  if (from) { conditions.push("entry_date >= ?"); args.push(from); }
  if (to) { conditions.push("entry_date <= ?"); args.push(to); }

  const result = await db.execute({
    sql: `SELECT entry_date, count FROM habit_entries WHERE ${conditions.join(" AND ")} ORDER BY entry_date ASC`,
    args,
  });
  return res.json(result.rows);
});
