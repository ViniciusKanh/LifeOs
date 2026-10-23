import { Router } from "express";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import {
  waterEntrySchema,
  waterEntryUpdateSchema,
  sleepEntrySchema,
  sleepEntryUpdateSchema,
  workoutSchema,
  workoutUpdateSchema,
  moodEntrySchema,
  moodEntryUpdateSchema,
  healthMetricEntrySchema,
} from "../validators/health.schema.js";
import { computeHealthCorrelations } from "../services/correlationService.js";
import { getStrengthReport } from "../services/strengthService.js";
import {
  WORKOUT_CATEGORY_LABELS,
  attachWorkoutSets,
  inferWorkoutCategory,
  intensityFromRpe,
  isDateKey,
  localDayBoundsUtc,
  nowIso,
  replaceWorkoutSetsStatements,
  resolveTzOffset,
  todayInTz,
  utcRangeFilter,
} from "../services/healthService.js";

export const healthRouter = Router();
healthRouter.use(requireAuth);

function minutesBetween(a: string, b: string) {
  const diff = new Date(b).getTime() - new Date(a).getTime();
  return diff > 0 ? Math.round(diff / 60000) : null;
}

function firstValidationMessage(error: { issues: Array<{ message: string }> }) {
  return error.issues[0]?.message ?? "Dados inválidos.";
}

/* ---------------------------- Água ---------------------------- */

/** GET /api/health/water?date=YYYY-MM-DD */
healthRouter.get("/water", async (req, res) => {
  const { date, tz } = req.query as { date?: string; tz?: string };
  const db = getDb();
  const ownerId = req.user!.id;
  const args: Array<string> = [ownerId];
  let sql = "SELECT * FROM water_entries WHERE owner_id = ?";
  if (date !== undefined) {
    if (!isDateKey(date)) return res.status(400).json({ error: "Data inválida (use YYYY-MM-DD)." });
    // Dia no fuso de quem pediu — ver localDayBoundsUtc/utcRangeFilter em healthService.ts.
    const { start, end } = localDayBoundsUtc(date, await resolveTzOffset(db, ownerId, tz));
    const range = utcRangeFilter("recorded_at", start, end);
    sql += ` AND ${range.sql}`;
    args.push(...range.args);
  }
  sql += " ORDER BY recorded_at DESC";
  const result = await db.execute({ sql, args });
  return res.json(result.rows);
});

/** POST /api/health/water */
healthRouter.post("/water", async (req, res) => {
  const parsed = waterEntrySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: firstValidationMessage(parsed.error) });
  }
  const db = getDb();
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO water_entries (id, owner_id, amount_ml, recorded_at)
          VALUES (?, ?, ?, ?)`,
    args: [id, req.user!.id, parsed.data.amountMl, parsed.data.recordedAt ?? nowIso()],
  });
  const created = await db.execute({ sql: "SELECT * FROM water_entries WHERE id = ?", args: [id] });
  return res.status(201).json(created.rows[0]);
});

/** PATCH /api/health/water/:id */
healthRouter.patch("/water/:id", async (req, res) => {
  const parsed = waterEntryUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: firstValidationMessage(parsed.error) });
  }

  const fieldMap: Record<string, string> = {
    amountMl: "amount_ml",
    recordedAt: "recorded_at",
  };
  const data = parsed.data as Record<string, string | number | undefined>;
  const sets: string[] = [];
  const args: Array<string | number> = [];
  for (const [key, column] of Object.entries(fieldMap)) {
    const value = data[key];
    if (value !== undefined) {
      sets.push(`${column} = ?`);
      args.push(value);
    }
  }
  args.push(req.params.id, req.user!.id);

  const db = getDb();
  const result = await db.execute({
    sql: `UPDATE water_entries SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`,
    args,
  });
  if (result.rowsAffected === 0) return res.status(404).json({ error: "Registro de água não encontrado." });

  const updated = await db.execute({ sql: "SELECT * FROM water_entries WHERE id = ? AND owner_id = ?", args: [req.params.id, req.user!.id] });
  return res.json(updated.rows[0]);
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
    return res.status(400).json({ error: firstValidationMessage(parsed.error) });
  }
  const d = parsed.data;
  const db = getDb();
  const id = nanoid();
  const duration = minutesBetween(d.wentToBedAt, d.wokeUpAt);
  if (duration === null) {
    return res.status(400).json({ error: "O horário de acordar precisa ser depois do horário em que você dormiu." });
  }
  await db.execute({
    sql: `INSERT INTO sleep_entries (id, owner_id, went_to_bed_at, woke_up_at, duration_minutes, quality, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, req.user!.id, d.wentToBedAt, d.wokeUpAt, duration, d.quality ?? null, d.notes ?? null],
  });
  const created = await db.execute({ sql: "SELECT * FROM sleep_entries WHERE id = ?", args: [id] });
  return res.status(201).json(created.rows[0]);
});

/** PATCH /api/health/sleep/:id */
healthRouter.patch("/sleep/:id", async (req, res) => {
  const parsed = sleepEntryUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: firstValidationMessage(parsed.error) });
  }

  const db = getDb();
  const existing = await db.execute({
    sql: "SELECT * FROM sleep_entries WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  if (existing.rows.length === 0) return res.status(404).json({ error: "Registro de sono não encontrado." });

  const row = existing.rows[0] as unknown as { went_to_bed_at: string; woke_up_at: string };
  const d = parsed.data;
  const nextWentToBedAt = d.wentToBedAt ?? row.went_to_bed_at;
  const nextWokeUpAt = d.wokeUpAt ?? row.woke_up_at;
  const nextDuration = minutesBetween(nextWentToBedAt, nextWokeUpAt);
  if (nextDuration === null) {
    return res.status(400).json({ error: "O horário de acordar precisa ser depois do horário em que você dormiu." });
  }

  const fieldMap: Record<string, string> = {
    wentToBedAt: "went_to_bed_at",
    wokeUpAt: "woke_up_at",
    quality: "quality",
    notes: "notes",
  };
  const data = d as Record<string, string | number | null | undefined>;
  const sets: string[] = [];
  const args: Array<string | number | null> = [];
  for (const [key, column] of Object.entries(fieldMap)) {
    const value = data[key];
    if (value !== undefined) {
      sets.push(`${column} = ?`);
      args.push(value ?? null);
    }
  }
  if (d.wentToBedAt !== undefined || d.wokeUpAt !== undefined) {
    sets.push("duration_minutes = ?");
    args.push(nextDuration);
  }
  args.push(req.params.id, req.user!.id);

  await db.execute({ sql: `UPDATE sleep_entries SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`, args });
  const updated = await db.execute({ sql: "SELECT * FROM sleep_entries WHERE id = ? AND owner_id = ?", args: [req.params.id, req.user!.id] });
  return res.json(updated.rows[0]);
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

type WorkoutPayload = {
  kind?: string;
  category?: keyof typeof WORKOUT_CATEGORY_LABELS;
  modality?: string | null;
  intensity?: "leve" | "moderada" | "intensa" | null;
  rpe?: number | null;
  muscleGroups?: string | null;
  rounds?: number | null;
  roundMinutes?: number | null;
};

/**
 * Regras de coerência entre tipo e campos: `kind` sempre recebe o rótulo do
 * tipo (compatibilidade com quem lê essa coluna), campos de luta só valem
 * para luta e o RPE alimenta a intensidade legada.
 */
function normalizeWorkoutPayload(d: WorkoutPayload) {
  const category = d.category ?? (d.kind ? inferWorkoutCategory(d.kind) : undefined);
  const kind = d.category ? WORKOUT_CATEGORY_LABELS[d.category] : d.kind;
  // Tipo conhecido e diferente de luta/musculação → zera os campos que não se aplicam.
  const notFight = category !== undefined && category !== "luta";
  const notStrength = category !== undefined && category !== "musculacao";
  const intensity = d.rpe ? intensityFromRpe(d.rpe) : d.intensity;
  return {
    category,
    kind,
    intensity,
    modality: notFight ? null : d.modality,
    rounds: notFight ? null : d.rounds,
    roundMinutes: notFight ? null : d.roundMinutes,
    muscleGroups: notStrength ? null : d.muscleGroups,
  };
}

async function loadWorkout(ownerId: string, id: string) {
  const db = getDb();
  const result = await db.execute({ sql: "SELECT * FROM workouts WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  if (result.rows.length === 0) return null;
  const [withSets] = await attachWorkoutSets(db, ownerId, result.rows as unknown as Array<{ id: string }>);
  return withSets;
}

/** GET /api/health/workouts?limit=30 — cada treino já vem com `sets` (musculação). */
healthRouter.get("/workouts", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 200);
  const db = getDb();
  const ownerId = req.user!.id;
  const result = await db.execute({
    sql: "SELECT * FROM workouts WHERE owner_id = ? ORDER BY performed_at DESC LIMIT ?",
    args: [ownerId, limit],
  });
  return res.json(await attachWorkoutSets(db, ownerId, result.rows as unknown as Array<{ id: string }>));
});

/** POST /api/health/workouts */
healthRouter.post("/workouts", async (req, res) => {
  const parsed = workoutSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: firstValidationMessage(parsed.error) });
  }
  const d = parsed.data;
  const n = normalizeWorkoutPayload(d);
  const ownerId = req.user!.id;
  const db = getDb();
  const id = nanoid();
  await db.batch(
    [
      {
        sql: `INSERT INTO workouts (id, owner_id, kind, category, modality, duration_minutes, distance_km, calories, intensity, rpe,
                                    muscle_groups, rounds, round_minutes, notes, performed_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          id,
          ownerId,
          n.kind ?? "Outro",
          n.category ?? null,
          n.modality ?? null,
          d.durationMinutes,
          d.distanceKm ?? null,
          d.calories ?? null,
          n.intensity ?? null,
          d.rpe ?? null,
          n.muscleGroups ?? null,
          n.rounds ?? null,
          n.roundMinutes ?? null,
          d.notes ?? null,
          d.performedAt ?? nowIso(),
        ],
      },
      // Séries só fazem sentido em musculação; nos demais tipos são ignoradas.
      ...(d.sets && n.category === "musculacao" ? replaceWorkoutSetsStatements(ownerId, id, d.sets).slice(1) : []),
    ],
    "write"
  );
  return res.status(201).json(await loadWorkout(ownerId, id));
});

/** PATCH /api/health/workouts/:id */
healthRouter.patch("/workouts/:id", async (req, res) => {
  const parsed = workoutUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: firstValidationMessage(parsed.error) });
  }
  const ownerId = req.user!.id;
  const db = getDb();
  const existing = await db.execute({ sql: "SELECT id FROM workouts WHERE id = ? AND owner_id = ?", args: [req.params.id, ownerId] });
  if (existing.rows.length === 0) return res.status(404).json({ error: "Exercício não encontrado." });

  const d = parsed.data;
  const n = normalizeWorkoutPayload(d);
  const values: Record<string, string | number | null | undefined> = {
    kind: n.kind,
    category: n.category,
    modality: n.modality,
    duration_minutes: d.durationMinutes,
    distance_km: d.distanceKm,
    calories: d.calories,
    intensity: n.intensity,
    rpe: d.rpe,
    muscle_groups: n.muscleGroups,
    rounds: n.rounds,
    round_minutes: n.roundMinutes,
    notes: d.notes,
    performed_at: d.performedAt,
  };
  const sets: string[] = [];
  const args: Array<string | number | null> = [];
  for (const [column, value] of Object.entries(values)) {
    if (value !== undefined) {
      sets.push(`${column} = ?`);
      args.push(value);
    }
  }

  const statements = [];
  if (sets.length > 0) {
    statements.push({ sql: `UPDATE workouts SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`, args: [...args, req.params.id, ownerId] });
  }
  // Lista de séries enviada = substitui a anterior; trocar o tipo para algo
  // que não é musculação limpa as séries órfãs.
  if (d.sets !== undefined || (n.category !== undefined && n.category !== "musculacao")) {
    const nextSets = n.category === undefined || n.category === "musculacao" ? d.sets ?? [] : [];
    statements.push(...replaceWorkoutSetsStatements(ownerId, req.params.id, nextSets));
  }
  if (statements.length > 0) await db.batch(statements, "write");

  return res.json(await loadWorkout(ownerId, req.params.id));
});

/** DELETE /api/health/workouts/:id */
healthRouter.delete("/workouts/:id", async (req, res) => {
  const db = getDb();
  const ownerId = req.user!.id;
  // Séries apagadas explicitamente: não depende de PRAGMA foreign_keys estar ligado.
  await db.batch(
    [
      { sql: "DELETE FROM workout_sets WHERE workout_id = ? AND owner_id = ?", args: [req.params.id, ownerId] },
      { sql: "DELETE FROM workouts WHERE id = ? AND owner_id = ?", args: [req.params.id, ownerId] },
    ],
    "write"
  );
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
    return res.status(400).json({ error: firstValidationMessage(parsed.error) });
  }
  const d = parsed.data;
  const db = getDb();
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO mood_entries (id, owner_id, mood, energy, stress, note, recorded_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, req.user!.id, d.mood, d.energy, d.stress ?? null, d.note ?? null, d.recordedAt ?? nowIso()],
  });
  const created = await db.execute({ sql: "SELECT * FROM mood_entries WHERE id = ?", args: [id] });
  return res.status(201).json(created.rows[0]);
});

/** PATCH /api/health/mood/:id */
healthRouter.patch("/mood/:id", async (req, res) => {
  const parsed = moodEntryUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: firstValidationMessage(parsed.error) });
  }

  const fieldMap: Record<string, string> = {
    mood: "mood",
    energy: "energy",
    stress: "stress",
    note: "note",
    recordedAt: "recorded_at",
  };
  const data = parsed.data as Record<string, string | number | null | undefined>;
  const sets: string[] = [];
  const args: Array<string | number | null> = [];
  for (const [key, column] of Object.entries(fieldMap)) {
    const value = data[key];
    if (value !== undefined) {
      sets.push(`${column} = ?`);
      args.push(value ?? null);
    }
  }
  args.push(req.params.id, req.user!.id);

  const db = getDb();
  const result = await db.execute({ sql: `UPDATE mood_entries SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`, args });
  if (result.rowsAffected === 0) return res.status(404).json({ error: "Registro de humor não encontrado." });

  const updated = await db.execute({ sql: "SELECT * FROM mood_entries WHERE id = ? AND owner_id = ?", args: [req.params.id, req.user!.id] });
  return res.json(updated.rows[0]);
});

/** DELETE /api/health/mood/:id */
healthRouter.delete("/mood/:id", async (req, res) => {
  const db = getDb();
  await db.execute({
    sql: "DELETE FROM mood_entries WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  return res.status(204).send();
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
    return res.status(400).json({ error: firstValidationMessage(parsed.error) });
  }
  const d = parsed.data;
  const db = getDb();
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO health_entries (id, owner_id, metric, value, unit, notes, recorded_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, req.user!.id, d.metric, d.value, d.unit ?? null, d.notes ?? null, d.recordedAt ?? nowIso()],
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

/**
 * GET /api/health/strength?days=180&tz=180 — "Atributo Força": evolução por
 * exercício de musculação (carga, 1RM Epley, volume, PRs), resumo de luta e
 * nível de Força. Regras e fórmula em services/strengthService.ts.
 */
healthRouter.get("/strength", async (req, res) => {
  const raw = req.query.days;
  const parsedDays = raw === undefined ? 180 : Number(raw);
  if (!Number.isInteger(parsedDays) || parsedDays < 7 || parsedDays > 730) {
    return res.status(400).json({ error: "Período inválido (use days entre 7 e 730)." });
  }
  const db = getDb();
  const ownerId = req.user!.id;
  const tzOffsetMinutes = await resolveTzOffset(db, ownerId, req.query.tz);
  return res.json(await getStrengthReport(db, ownerId, parsedDays, tzOffsetMinutes));
});

/* ---------------------------- Resumo ---------------------------- */

/** GET /api/health/summary?date=YYYY-MM-DD — usado no Dashboard e na tela Hoje */
healthRouter.get("/summary", async (req, res) => {
  const db = getDb();
  const ownerId = req.user!.id;
  const tzOffsetMinutes = await resolveTzOffset(db, ownerId, req.query.tz);
  const rawDate = req.query.date as string | undefined;
  if (rawDate !== undefined && !isDateKey(rawDate)) return res.status(400).json({ error: "Data inválida (use YYYY-MM-DD)." });
  // Sem "date" explícito, usa "hoje" no fuso de quem pediu (nunca o do servidor).
  const date = rawDate ?? todayInTz(tzOffsetMinutes);
  const { start, end } = localDayBoundsUtc(date, tzOffsetMinutes);
  const waterRange = utcRangeFilter("recorded_at", start, end);
  const workoutRange = utcRangeFilter("performed_at", start, end);

  const [waterToday, lastSleep, workoutsToday, latestMood] = await Promise.all([
    db.execute({
      sql: `SELECT COALESCE(SUM(amount_ml), 0) AS total FROM water_entries WHERE owner_id = ? AND ${waterRange.sql}`,
      args: [ownerId, ...waterRange.args],
    }),
    db.execute({
      sql: "SELECT duration_minutes, quality FROM sleep_entries WHERE owner_id = ? ORDER BY went_to_bed_at DESC LIMIT 1",
      args: [ownerId],
    }),
    db.execute({
      sql: `SELECT COUNT(*) AS total, COALESCE(SUM(duration_minutes), 0) AS minutes FROM workouts WHERE owner_id = ? AND ${workoutRange.sql}`,
      args: [ownerId, ...workoutRange.args],
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
