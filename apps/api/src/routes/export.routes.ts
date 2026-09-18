import { Router } from "express";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";

export const exportRouter = Router();
exportRouter.use(requireAuth);

/**
 * Toda tabela que guarda dado do usuário (owner_id), na ordem em que
 * aparece nas migrations. Tabelas de junção sem owner_id próprio
 * (task_tags, task_dependencies, project_members) ficam de fora desta
 * v1 — são derivadas do que já está em `tasks`/`tags`/`projects`.
 */
const EXPORTABLE_TABLES = [
  "goals",
  "goal_progress",
  "habits",
  "habit_entries",
  "projects",
  "task_statuses",
  "tasks",
  "subtasks",
  "tags",
  "time_entries",
  "books",
  "book_notes",
  "reading_sessions",
  "educations",
  "courses",
  "subjects",
  "academic_projects",
  "academic_deadlines",
  "study_sessions",
  "semester_checklist",
  "health_entries",
  "water_entries",
  "sleep_entries",
  "workouts",
  "mood_entries",
  "focus_sessions",
  "daily_reviews",
  "weekly_reviews",
  "events",
  "notifications",
  "user_achievements",
  "life_scores",
  "analytics_snapshots",
  "personal_experiments",
  "personal_experiment_logs",
] as const;

/**
 * GET /api/export/me — exporta todos os dados reais do usuário logado
 * num único JSON (um objeto por tabela, na mesma forma das linhas do
 * banco). Nunca inclui password_hash nem nenhuma credencial — só o
 * perfil básico e o conteúdo que o próprio usuário criou.
 */
exportRouter.get("/me", async (req, res) => {
  const db = getDb();
  const ownerId = req.user!.id;

  const profileResult = await db.execute({
    sql: "SELECT id, name, email, role, avatar_url, created_at FROM users WHERE id = ?",
    args: [ownerId],
  });

  const tableResults = await Promise.all(
    EXPORTABLE_TABLES.map((table) =>
      db.execute({ sql: `SELECT * FROM ${table} WHERE owner_id = ?`, args: [ownerId] })
    )
  );

  const data: Record<string, unknown> = {};
  EXPORTABLE_TABLES.forEach((table, i) => {
    data[table] = tableResults[i].rows;
  });

  const payload = {
    exportedAt: new Date().toISOString(),
    profile: profileResult.rows[0] ?? null,
    data,
  };

  res.setHeader("Content-Disposition", `attachment; filename="lifeos-export-${new Date().toISOString().slice(0, 10)}.json"`);
  return res.json(payload);
});
