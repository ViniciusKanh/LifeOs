import { Router } from "express";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import {
  waterEntrySchema,
  sleepEntrySchema,
  workoutSchema,
  moodEntrySchema,
  healthMetricEntrySchema,
} from "../validators/health.schema.js";
import { computeHealthCorrelations } from "../services/correlationService.js";

export const healthRouter = Router();
healthRouter.use(requireAuth);

function minutesBetween(a: string, b: string) {
  const diff = new Date(b).getTime() - new Date(a).getTime();
  return diff > 0 ? Math.round(diff / 60000) : null;
}

/* ---------------------------- Água ---------------------------- */

/** GET /api/health/water?date=YYYY-MM-DD */
healthRouter.get("/water", async (req, res) => {
  const { date } = req.query as { date?: string };
  const db = getDb();
  const args: Array<string> = [req.user!.id];
  let sql = "SELECT * FROM water_entries WHERE owner_id = ?";
  if (date) {
    sql += " AND date(recorded_at) = date(?)";
    args.push(date);
  }
  sql += " ORDER BY recorded_at DESC";
  const result = await db.execute({ sql, args });
  return res.json(result.rows);
});

/** POST /api/health/water */
healthRouter.post("/water", async (req, res) => {
  const parsed = waterEntrySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO water_entries (id, owner_id, amount_ml, recorded_at)
          VALUES (?, ?, ?, COALESCE(?, datetime('now')))`,
    args: [id, req.user!.id, parsed.data.amountMl, parsed.data.recordedAt ?? null],
  });
  const created = await db.execute({ sql: "SELECT * FROM water_entries WHERE id = ?", args: [id] });
  return res.status(201).json(created.rows[0]);
});

/** DELETE /api/health/water/:id */
healthRouter.delete("/water/:id", async (req, res) => {
  const db = getDb();
  await db.execute({
    sql: "DELETE FROM water_entries WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  return res.status(204).send();
});

/* ---------------------------- Sono ---------------------------- */

/** GET /api/health/sleep?limit=30 */
healthRouter.get("/sleep", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 200);
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM sleep_entries WHERE owner_id = ? ORDER BY went_to_bed_at DESC LIMIT ?",
    args: [req.user!.id, limit],
  });
  return res.json(result.rows);
});

/** POST /api/health/sleep */
healthRouter.post("/sleep", async (req, res) => {
  const parsed = sleepEntrySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const d = parsed.data;
  const db = getDb();
  const id = nanoid();
  const duration = minutesBetween(d.wentToBedAt, d.wokeUpAt);
  await db.execute({
    sql: `INSERT INTO sleep_entries (id, owner_id, went_to_bed_at, woke_up_at, duration_minutes, quality, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, req.user!.id, d.wentToBedAt, d.wokeUpAt, duration, d.quality ?? null, d.notes ?? null],
  });
  const created = await db.execute({ sql: "SELECT * FROM sleep_entries WHERE id = ?", args: [id] });
  return res.status(201).json(created.rows[0]);
});

/** DELETE /api/health/sleep/:id */
healthRouter.delete("/sleep/:id", async (req, res) => {
  const db = getDb();
  await db.execute({
    sql: "DELETE FROM sleep_entries WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  return res.status(204).send();
});

/* -------------------------- Exercícios -------------------------- */

/** GET /api/health/workouts?limit=30 */
healthRouter.get("/workouts", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 200);
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM workouts WHERE owner_id = ? ORDER BY performed_at DESC LIMIT ?",
    args: [req.user!.id, limit],
  });
  return res.json(result.rows);
});

/** POST /api/health/workouts */
healthRouter.post("/workouts", async (req, res) => {
  const parsed = workoutSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const d = parsed.data;
  const db = getDb();
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO workouts (id, owner_id, kind, duration_minutes, distance_km, calories, intensity, notes, performed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))`,
    args: [
      id,
      req.user!.id,
      d.kind,
      d.durationMinutes ?? null,
      d.distanceKm ?? null,
      d.calories ?? null,
      d.intensity ?? null,
      d.notes ?? null,
      d.performedAt ?? null,
    ],
  });
  const created = await db.execute({ sql: "SELECT * FROM workouts WHERE id = ?", args: [id] });
  return res.status(201).json(created.rows[0]);
});

/** DELETE /api/health/workouts/:id */
healthRouter.delete("/workouts/:id", async (req, res) => {
  const db = getDb();
  await db.execute({
    sql: "DELETE FROM workouts WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  return res.status(204).send();
});

/* ---------------------------- Humor ---------------------------- */

/** GET /api/health/mood?limit=30 */
healthRouter.get("/mood", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 200);
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM mood_entries WHERE owner_id = ? ORDER BY recorded_at DESC LIMIT ?",
    args: [req.user!.id, limit],
  });
  return res.json(result.rows);
});

/** POST /api/health/mood */
healthRouter.post("/mood", async (req, res) => {
  const parsed = moodEntrySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const d = parsed.data;
  const db = getDb();
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO mood_entries (id, owner_id, mood, energy, stress, note, recorded_at)
          VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))`,
    args: [id, req.user!.id, d.mood, d.energy, d.stress ?? null, d.note ?? null, d.recordedAt ?? null],
  });
  const created = await db.execute({ sql: "SELECT * FROM mood_entries WHERE id = ?", args: [id] });
  return res.status(201).json(created.rows[0]);
});

/* ------------------------ Métricas gerais ------------------------ */

/** GET /api/health/metrics?metric=weight&limit=90 */
healthRouter.get("/metrics", async (req, res) => {
  const { metric } = req.query as { metric?: string };
  const limit = Math.min(Number(req.query.limit) || 90, 500);
  const db = getDb();
  const args: Array<string | number> = [req.user!.id];
  let sql = "SELECT * FROM health_entries WHERE owner_id = ?";
  if (metric) {
    sql += " AND metric = ?";
    args.push(metric);
  }
  sql += " ORDER BY recorded_at DESC LIMIT ?";
  args.push(limit);
  const result = await db.execute({ sql, args });
  return res.json(result.rows);
});

/** POST /api/health/metrics */
healthRouter.post("/metrics", async (req, res) => {
  const parsed = healthMetricEntrySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const d = parsed.data;
  const db = getDb();
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO health_entries (id, owner_id, metric, value, unit, notes, recorded_at)
          VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))`,
    args: [id, req.user!.id, d.metric, d.value, d.unit ?? null, d.notes ?? null, d.recordedAt ?? null],
  });
  const created = await db.execute({ sql: "SELECT * FROM health_entries WHERE id = ?", args: [id] });
  return res.status(201).json(created.rows[0]);
});

/* ------------------------- Correlações ------------------------- */

/** GET /api/health/correlations — cruza sono, exercício, água e humor/energia/estresse (ver correlationService.ts). */
healthRouter.get("/correlations", async (req, res) => {
  const db = getDb();
  const results = await computeHealthCorrelations(db, req.user!.id);
  return res.json(results);
});

/* ---------------------------- Resumo ---------------------------- */

/** GET /api/health/summary?date=YYYY-MM-DD — usado no Dashboard e na tela Hoje */
healthRouter.get("/summary", async (req, res) => {
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const db = getDb();
  const ownerId = req.user!.id;

  const [waterToday, lastSleep, workoutsToday, latestMood] = await Promise.all([
    db.execute({
      sql: "SELECT COALESCE(SUM(amount_ml), 0) AS total FROM water_entries WHERE owner_id = ? AND date(recorded_at) = date(?)",
      args: [ownerId, date],
    }),
    db.execute({
      sql: "SELECT duration_minutes, quality FROM sleep_entries WHERE owner_id = ? ORDER BY went_to_bed_at DESC LIMIT 1",
      args: [ownerId],
    }),
    db.execute({
      sql: "SELECT COUNT(*) AS total, COALESCE(SUM(duration_minutes), 0) AS minutes FROM workouts WHERE owner_id = ? AND date(performed_at) = date(?)",
      args: [ownerId, date],
    }),
    db.execute({
      sql: "SELECT mood, energy, stress FROM mood_entries WHERE owner_id = ? ORDER BY recorded_at DESC LIMIT 1",
      args: [ownerId],
    }),
  ]);

  return res.json({
    date,
    waterMl: Number(waterToday.rows[0]?.total ?? 0),
    lastSleepMinutes: lastSleep.rows[0]?.duration_minutes ?? null,
    lastSleepQuality: lastSleep.rows[0]?.quality ?? null,
    workoutsToday: Number(workoutsToday.rows[0]?.total ?? 0),
    workoutMinutesToday: Number(workoutsToday.rows[0]?.minutes ?? 0),
    mood: latestMood.rows[0] ?? null,
  });
});
