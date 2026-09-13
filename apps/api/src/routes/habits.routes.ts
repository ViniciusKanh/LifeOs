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
  category: z.string().trim().max(60).optional(),
  frequency: z.enum(["daily", "specific_days", "times_per_week", "weekly", "monthly"]).default("daily"),
  targetCount: z.number().int().positive().default(1),
});

const updateHabitSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  icon: z.string().optional().nullable(),
  category: z.string().trim().max(60).optional().nullable(),
  frequency: z.enum(["daily", "specific_days", "times_per_week", "weekly", "monthly"]).optional(),
  targetCount: z.number().int().positive().optional(),
});

const checkInSchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato YYYY-MM-DD"),
  count: z.number().int().positive().default(1),
});

/** Calcula sequência atual e recorde a partir das datas com check-in cumprido. */
function computeStreaks(entryDates: string[]): { current: number; best: number } {
  const dates = new Set(entryDates);
  let best = 0;
  let running = 0;
  const sorted = [...dates].sort();
  let prev: string | null = null;
  for (const date of sorted) {
    if (prev) {
      const gapDays = Math.round((Date.parse(date) - Date.parse(prev)) / 86_400_000);
      running = gapDays === 1 ? running + 1 : 1;
    } else {
      running = 1;
    }
    best = Math.max(best, running);
    prev = date;
  }

  // Sequência atual: conta pra trás a partir de hoje (ou ontem, se hoje ainda não teve check-in).
  let current = 0;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const cursor = new Date(today);
  if (!dates.has(cursor.toISOString().slice(0, 10))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    current += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return { current, best };
}

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
    sql: `INSERT INTO habits (id, owner_id, name, icon, category, frequency, target_count)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      req.user!.id,
      parsed.data.name,
      parsed.data.icon ?? null,
      parsed.data.category ?? null,
      parsed.data.frequency,
      parsed.data.targetCount,
    ],
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

/** PATCH /api/habits/:id */
habitsRouter.patch("/:id", async (req, res) => {
  const parsed = updateHabitSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const existing = await db.execute({
    sql: "SELECT id FROM habits WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  if (existing.rows.length === 0) return res.status(404).json({ error: "Hábito não encontrado." });

  const fieldMap: Record<string, string> = {
    name: "name",
    icon: "icon",
    category: "category",
    frequency: "frequency",
    targetCount: "target_count",
  };
  const sets: string[] = [];
  const args: Array<string | number | null> = [];
  for (const [key, column] of Object.entries(fieldMap)) {
    const value = (parsed.data as Record<string, unknown>)[key];
    if (value !== undefined) {
      sets.push(`${column} = ?`);
      args.push(value as string | number | null);
    }
  }
  if (sets.length > 0) {
    args.push(req.params.id, req.user!.id);
    await db.execute({ sql: `UPDATE habits SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`, args });
  }
  const updated = await db.execute({ sql: "SELECT * FROM habits WHERE id = ?", args: [req.params.id] });
  return res.json(updated.rows[0]);
});

/** DELETE /api/habits/:id — arquiva (soft delete) para preservar o histórico de check-ins */
habitsRouter.delete("/:id", async (req, res) => {
  const db = getDb();
  await db.execute({
    sql: "UPDATE habits SET archived_at = datetime('now') WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  return res.status(204).send();
});

/** GET /api/habits/summary — sequência atual, recorde e % de cumprimento dos últimos 30 dias, por hábito */
habitsRouter.get("/summary", async (req, res) => {
  const db = getDb();
  const habits = await db.execute({
    sql: "SELECT * FROM habits WHERE owner_id = ? AND archived_at IS NULL ORDER BY created_at ASC",
    args: [req.user!.id],
  });

  const summaries = await Promise.all(
    (habits.rows as unknown as Array<{ id: string; target_count: number }>).map(async (habit) => {
      const entries = await db.execute({
        sql: "SELECT entry_date, count FROM habit_entries WHERE habit_id = ? AND count >= ? ORDER BY entry_date ASC",
        args: [habit.id, habit.target_count],
      });
      const dateList = (entries.rows as unknown as Array<{ entry_date: string }>).map((r) => r.entry_date);
      const { current, best } = computeStreaks(dateList);
      const todayIso = new Date().toISOString().slice(0, 10);
      const checkedInToday = dateList.includes(todayIso);

      const last30 = await db.execute({
        sql: "SELECT COUNT(*) AS total FROM habit_entries WHERE habit_id = ? AND count >= ? AND entry_date >= date('now', '-29 days')",
        args: [habit.id, habit.target_count],
      });
      const completionPct = Math.round((Number(last30.rows[0]?.total ?? 0) / 30) * 100);

      return { habitId: habit.id, currentStreak: current, bestStreak: best, completionPct30d: completionPct, checkedInToday };
    })
  );

  return res.json(summaries);
});

/**
 * GET /api/habits/stats?days=30 — dados agregados para o dashboard de
 * Hábitos: recorde de sequência entre todos os hábitos, consistência por
 * categoria e o mapa de consistência (heatmap) dos últimos N dias. Tudo
 * calculado a partir dos check-ins reais — nunca um número fixo.
 */
habitsRouter.get("/stats", async (req, res) => {
  const db = getDb();
  const days = Math.min(90, Math.max(7, Number(req.query.days) || 30));

  const habitsResult = await db.execute({
    sql: "SELECT * FROM habits WHERE owner_id = ? AND archived_at IS NULL ORDER BY created_at ASC",
    args: [req.user!.id],
  });
  const habits = habitsResult.rows as unknown as Array<{ id: string; target_count: number; category: string | null }>;

  if (habits.length === 0) {
    return res.json({
      currentStreakMax: 0,
      bestStreakMax: 0,
      categories: [],
      consistency: { days: [], daysWithAnyHabit: 0, ratePct: 0, changePct: null },
    });
  }

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));
  const sinceIso = since.toISOString().slice(0, 10);

  const entriesResult = await db.execute({
    sql: `SELECT habit_id, entry_date, count FROM habit_entries
          WHERE owner_id = ? AND entry_date >= ?
          ORDER BY entry_date ASC`,
    args: [req.user!.id, sinceIso],
  });
  const rangeEntries = entriesResult.rows as unknown as Array<{ habit_id: string; entry_date: string; count: number }>;

  // Sequências (atual/recorde) considerando TODO o histórico de cada hábito.
  const allEntriesResult = await db.execute({
    sql: `SELECT habit_id, entry_date, count FROM habit_entries WHERE owner_id = ? ORDER BY entry_date ASC`,
    args: [req.user!.id],
  });
  const allEntries = allEntriesResult.rows as unknown as Array<{ habit_id: string; entry_date: string; count: number }>;

  let currentStreakMax = 0;
  let bestStreakMax = 0;
  const completionByHabit = new Map<string, number>();

  for (const habit of habits) {
    const dates = allEntries.filter((e) => e.habit_id === habit.id && e.count >= habit.target_count).map((e) => e.entry_date);
    const { current, best } = computeStreaks(dates);
    currentStreakMax = Math.max(currentStreakMax, current);
    bestStreakMax = Math.max(bestStreakMax, best);

    const last30 = await db.execute({
      sql: "SELECT COUNT(*) AS total FROM habit_entries WHERE habit_id = ? AND count >= ? AND entry_date >= date('now', '-29 days')",
      args: [habit.id, habit.target_count],
    });
    completionByHabit.set(habit.id, Math.round((Number(last30.rows[0]?.total ?? 0) / 30) * 100));
  }

  // Agrupamento por categoria (hábitos sem categoria caem em "Geral").
  const categoryMap = new Map<string, { habitCount: number; totalPct: number }>();
  for (const habit of habits) {
    const key = habit.category?.trim() || "Geral";
    const entry = categoryMap.get(key) ?? { habitCount: 0, totalPct: 0 };
    entry.habitCount += 1;
    entry.totalPct += completionByHabit.get(habit.id) ?? 0;
    categoryMap.set(key, entry);
  }
  const categories = [...categoryMap.entries()].map(([category, v]) => ({
    category,
    habitCount: v.habitCount,
    avgCompletionPct: Math.round(v.totalPct / v.habitCount),
  }));

  // Heatmap: para cada dia do período, quantos hábitos (do total ativo hoje)
  // tiveram check-in válido naquele dia.
  const byDate = new Map<string, Set<string>>();
  for (const e of rangeEntries) {
    if (e.count < (habits.find((h) => h.id === e.habit_id)?.target_count ?? 1)) continue;
    if (!byDate.has(e.entry_date)) byDate.set(e.entry_date, new Set());
    byDate.get(e.entry_date)!.add(e.habit_id);
  }
  const dayList: Array<{ date: string; completed: number; total: number; ratio: number }> = [];
  const cursor = new Date(since);
  const todayCursor = new Date();
  todayCursor.setUTCHours(0, 0, 0, 0);
  while (cursor <= todayCursor) {
    const iso = cursor.toISOString().slice(0, 10);
    const completed = byDate.get(iso)?.size ?? 0;
    dayList.push({ date: iso, completed, total: habits.length, ratio: habits.length > 0 ? completed / habits.length : 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const daysWithAnyHabit = dayList.filter((d) => d.completed > 0).length;
  const totalPossible = dayList.length * habits.length;
  const totalCompleted = dayList.reduce((sum, d) => sum + d.completed, 0);
  const ratePct = totalPossible > 0 ? Math.round((totalCompleted / totalPossible) * 100) : 0;

  const half = Math.floor(dayList.length / 2);
  const firstHalf = dayList.slice(0, half);
  const secondHalf = dayList.slice(half);
  const rateOf = (arr: typeof dayList) => {
    const possible = arr.length * habits.length;
    if (possible === 0) return null;
    const completed = arr.reduce((sum, d) => sum + d.completed, 0);
    return (completed / possible) * 100;
  };
  const firstRate = rateOf(firstHalf);
  const secondRate = rateOf(secondHalf);
  const changePct = firstRate !== null && secondRate !== null && firstRate > 0 ? Math.round(((secondRate - firstRate) / firstRate) * 100) : null;

  return res.json({
    currentStreakMax,
    bestStreakMax,
    categories,
    consistency: { days: dayList, daysWithAnyHabit, ratePct, changePct },
  });
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
