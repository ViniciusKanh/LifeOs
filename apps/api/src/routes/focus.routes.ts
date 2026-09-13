import { Router } from "express";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { startFocusSessionSchema, stopFocusSessionSchema } from "../validators/focus.schema.js";

export const focusRouter = Router();
focusRouter.use(requireAuth);

/** GET /api/focus/sessions?limit=30 */
focusRouter.get("/sessions", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 200);
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM focus_sessions WHERE owner_id = ? ORDER BY started_at DESC LIMIT ?",
    args: [req.user!.id, limit],
  });
  return res.json(result.rows);
});

/** GET /api/focus/sessions/active — sessão em aberto (ended_at IS NULL), se houver */
focusRouter.get("/sessions/active", async (req, res) => {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM focus_sessions WHERE owner_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1",
    args: [req.user!.id],
  });
  return res.json(result.rows[0] ?? null);
});

/** POST /api/focus/sessions/start */
focusRouter.post("/sessions/start", async (req, res) => {
  const parsed = startFocusSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();

  // Só uma sessão aberta por vez — encerra qualquer sessão pendurada antes de iniciar outra.
  await db.execute({
    sql: "UPDATE focus_sessions SET ended_at = datetime('now') WHERE owner_id = ? AND ended_at IS NULL",
    args: [req.user!.id],
  });

  const d = parsed.data;
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO focus_sessions (id, owner_id, task_id, project_id, mode, planned_minutes, started_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    args: [id, req.user!.id, d.taskId ?? null, d.projectId ?? null, d.mode, d.plannedMinutes ?? null],
  });
  const created = await db.execute({ sql: "SELECT * FROM focus_sessions WHERE id = ?", args: [id] });
  return res.status(201).json(created.rows[0]);
});

/** PATCH /api/focus/sessions/:id/stop */
focusRouter.patch("/sessions/:id/stop", async (req, res) => {
  const parsed = stopFocusSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const existing = await db.execute({
    sql: "SELECT * FROM focus_sessions WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  const session = existing.rows[0];
  if (!session) return res.status(404).json({ error: "Sessão não encontrada." });

  const d = parsed.data;
  await db.execute({
    sql: `UPDATE focus_sessions
          SET ended_at = datetime('now'),
              actual_minutes = CAST((julianday(datetime('now')) - julianday(started_at)) * 24 * 60 AS INTEGER),
              perceived_productivity = COALESCE(?, perceived_productivity),
              distractions = COALESCE(?, distractions),
              notes = COALESCE(?, notes)
          WHERE id = ? AND owner_id = ?`,
    args: [d.perceivedProductivity ?? null, d.distractions ?? null, d.notes ?? null, req.params.id, req.user!.id],
  });
  const updated = await db.execute({ sql: "SELECT * FROM focus_sessions WHERE id = ?", args: [req.params.id] });
  return res.json(updated.rows[0]);
});

/** DELETE /api/focus/sessions/:id */
focusRouter.delete("/sessions/:id", async (req, res) => {
  const db = getDb();
  await db.execute({
    sql: "DELETE FROM focus_sessions WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  return res.status(204).send();
});

/** GET /api/focus/summary — totais de hoje/semana/mês e melhor horário (Focus Score por hora) */
focusRouter.get("/summary", async (req, res) => {
  const db = getDb();
  const ownerId = req.user!.id;

  const [today, week, month, byHour] = await Promise.all([
    db.execute({
      sql: "SELECT COALESCE(SUM(actual_minutes), 0) AS minutes FROM focus_sessions WHERE owner_id = ? AND date(started_at) = date('now') AND ended_at IS NOT NULL",
      args: [ownerId],
    }),
    db.execute({
      sql: "SELECT COALESCE(SUM(actual_minutes), 0) AS minutes FROM focus_sessions WHERE owner_id = ? AND started_at >= date('now', '-6 days') AND ended_at IS NOT NULL",
      args: [ownerId],
    }),
    db.execute({
      sql: "SELECT COALESCE(SUM(actual_minutes), 0) AS minutes FROM focus_sessions WHERE owner_id = ? AND started_at >= date('now', 'start of month') AND ended_at IS NOT NULL",
      args: [ownerId],
    }),
    db.execute({
      sql: `SELECT strftime('%H', started_at) AS hour, AVG(perceived_productivity) AS avg_productivity, COUNT(*) AS total
            FROM focus_sessions WHERE owner_id = ? AND ended_at IS NOT NULL AND perceived_productivity IS NOT NULL
            GROUP BY hour ORDER BY avg_productivity DESC LIMIT 1`,
      args: [ownerId],
    }),
  ]);

  return res.json({
    todayMinutes: Number(today.rows[0]?.minutes ?? 0),
    weekMinutes: Number(week.rows[0]?.minutes ?? 0),
    monthMinutes: Number(month.rows[0]?.minutes ?? 0),
    bestHour: byHour.rows[0] ?? null,
  });
});
