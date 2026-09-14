import { Router } from "express";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import {
  createEducationSchema,
  updateEducationSchema,
  createCourseSchema,
  updateCourseSchema,
  createSubjectSchema,
  updateSubjectSchema,
  quickCreateSubjectSchema,
  createAcademicProjectSchema,
  updateAcademicProjectSchema,
  createDeadlineSchema,
  updateDeadlineSchema,
  createStudySessionSchema,
  createChecklistItemSchema,
  updateChecklistItemSchema,
} from "../validators/education.schema.js";

export const educationRouter = Router();

// Mesma regra de todo o app: toda rota exige sessão, e cada tabela
// (educations, courses, subjects, academic_projects) tem owner_id
// próprio — toda query filtra por ele, nunca por um id vindo do corpo.
educationRouter.use(requireAuth);

function jsonOrNull(value: unknown): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}
function parseJson<T>(value: unknown): T | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/* ============================== Educations ============================== */

/**
 * Fase da formação — derivada de dados reais, nunca perguntada nem
 * fabricada: se há disciplina em andamento/planejada, o usuário
 * ainda está em período de aulas; senão, se há projeto acadêmico
 * (TCC/dissertação/tese...) vinculado e não concluído, está na fase
 * de projeto; caso contrário, entra como "sem atividade" (nem aula
 * nem projeto abertos) ou "concluída" (progresso 100%).
 */
type EducationPhase = "cursando_disciplinas" | "fase_projeto" | "concluida" | "sem_atividade";

async function computePhases(db: ReturnType<typeof getDb>, ownerId: string, educationIds: string[]) {
  if (educationIds.length === 0) return { withActiveCourses: new Set<string>(), withOpenProjects: new Set<string>() };
  const placeholders = educationIds.map(() => "?").join(",");

  const [activeCourses, openProjects] = await Promise.all([
    db.execute({
      sql: `SELECT DISTINCT education_id FROM courses
            WHERE owner_id = ? AND education_id IN (${placeholders})
            AND id IN (SELECT course_id FROM subjects WHERE status IN ('Planejada', 'Em andamento'))`,
      args: [ownerId, ...educationIds],
    }),
    db.execute({
      sql: `SELECT DISTINCT education_id FROM academic_projects
            WHERE owner_id = ? AND education_id IN (${placeholders}) AND progress_pct < 100`,
      args: [ownerId, ...educationIds],
    }),
  ]);

  const withActiveCourses = new Set(activeCourses.rows.map((r) => r.education_id as string));
  const withOpenProjects = new Set(openProjects.rows.map((r) => r.education_id as string));

  return { withActiveCourses, withOpenProjects };
}

function resolvePhase(
  educationId: string,
  progressPct: number,
  withActiveCourses: Set<string>,
  withOpenProjects: Set<string>
): EducationPhase {
  if (withActiveCourses.has(educationId)) return "cursando_disciplinas";
  if (withOpenProjects.has(educationId)) return "fase_projeto";
  if (progressPct >= 100) return "concluida";
  return "sem_atividade";
}

educationRouter.get("/educations", async (req, res) => {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM educations WHERE owner_id = ? ORDER BY started_at DESC, created_at DESC",
    args: [req.user!.id],
  });
  const rows = result.rows as unknown as Array<{ id: string; progress_pct: number }>;
  const { withActiveCourses, withOpenProjects } = await computePhases(db, req.user!.id, rows.map((r) => r.id));

  return res.json(
    rows.map((row) => ({
      ...row,
      phase: resolvePhase(row.id, row.progress_pct, withActiveCourses, withOpenProjects),
    }))
  );
});

educationRouter.get("/educations/:id", async (req, res) => {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM educations WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  if (result.rows.length === 0) return res.status(404).json({ error: "Formação não encontrada." });

  const education = result.rows[0] as unknown as { id: string; progress_pct: number };
  const { withActiveCourses, withOpenProjects } = await computePhases(db, req.user!.id, [education.id]);
  const academicProjects = await db.execute({
    sql: "SELECT * FROM academic_projects WHERE education_id = ? AND owner_id = ? ORDER BY created_at DESC",
    args: [req.params.id, req.user!.id],
  });

  return res.json({
    ...education,
    phase: resolvePhase(education.id, education.progress_pct, withActiveCourses, withOpenProjects),
    academicProjects: academicProjects.rows,
  });
});

educationRouter.post("/educations", async (req, res) => {
  const parsed = createEducationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const d = parsed.data;
  const db = getDb();
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO educations (id, owner_id, kind, institution, course_name, started_at, expected_end_at, progress_pct, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, req.user!.id, d.kind, d.institution ?? null, d.courseName, d.startedAt ?? null, d.expectedEndAt ?? null, d.progressPct ?? 0, d.notes ?? null],
  });
  const created = await db.execute({ sql: "SELECT * FROM educations WHERE id = ?", args: [id] });
  return res.status(201).json(created.rows[0]);
});

const EDUCATION_FIELD_MAP: Record<string, string> = {
  kind: "kind",
  institution: "institution",
  courseName: "course_name",
  startedAt: "started_at",
  expectedEndAt: "expected_end_at",
  progressPct: "progress_pct",
  notes: "notes",
};

educationRouter.patch("/educations/:id", async (req, res) => {
  const parsed = updateEducationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const existing = await db.execute({
    sql: "SELECT id FROM educations WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  if (existing.rows.length === 0) return res.status(404).json({ error: "Formação não encontrada." });

  const data = parsed.data as Record<string, unknown>;
  const sets: string[] = [];
  const args: Array<string | number | null> = [];
  for (const [key, column] of Object.entries(EDUCATION_FIELD_MAP)) {
    if (key in data) {
      sets.push(`${column} = ?`);
      args.push((data[key] as string | number | null) ?? null);
    }
  }
  if (sets.length === 0) return res.status(400).json({ error: "Nenhum campo para atualizar." });
  args.push(req.params.id, req.user!.id);

  await db.execute({ sql: `UPDATE educations SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`, args });
  const updated = await db.execute({ sql: "SELECT * FROM educations WHERE id = ? AND owner_id = ?", args: [req.params.id, req.user!.id] });
  return res.json(updated.rows[0]);
});

/**
 * DELETE /education/educations/:id — apaga a formação inteira
 * (cursos e disciplinas somem via ON DELETE CASCADE do próprio
 * schema). Os projetos acadêmicos vinculados (TCC/dissertação/tese)
 * são o único caso que o schema não cascateia sozinho —
 * academic_projects.education_id é ON DELETE SET NULL de propósito
 * (um projeto acadêmico pode existir sem formação), mas isso deixava
 * projeto genérico + Kanban órfãos em Projetos toda vez que uma
 * formação era apagada. Aqui apagamos esses projetos acadêmicos
 * (e seus projetos genéricos vinculados) explicitamente antes de
 * apagar a formação, para não sobrar lixo relacionado à educação.
 */
educationRouter.delete("/educations/:id", async (req, res) => {
  const db = getDb();
  const owned = await db.execute({ sql: "SELECT id FROM educations WHERE id = ? AND owner_id = ?", args: [req.params.id, req.user!.id] });
  if (owned.rows.length === 0) return res.status(404).json({ error: "Formação não encontrada." });

  const linkedProjects = await db.execute({
    sql: "SELECT project_id FROM academic_projects WHERE education_id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  for (const row of linkedProjects.rows as unknown as Array<{ project_id: string | null }>) {
    if (row.project_id) {
      // Cascade cuida de apagar a linha de academic_projects também.
      await db.execute({ sql: "DELETE FROM projects WHERE id = ? AND owner_id = ?", args: [row.project_id, req.user!.id] });
    } else {
      await db.execute({
        sql: "DELETE FROM academic_projects WHERE education_id = ? AND owner_id = ? AND project_id IS NULL",
        args: [req.params.id, req.user!.id],
      });
    }
  }

  await db.execute({ sql: "DELETE FROM educations WHERE id = ? AND owner_id = ?", args: [req.params.id, req.user!.id] });
  return res.status(204).send();
});

/* ============================== Courses ============================== */

educationRouter.get("/educations/:educationId/courses", async (req, res) => {
  const db = getDb();
  const education = await db.execute({
    sql: "SELECT id FROM educations WHERE id = ? AND owner_id = ?",
    args: [req.params.educationId, req.user!.id],
  });
  if (education.rows.length === 0) return res.status(404).json({ error: "Formação não encontrada." });

  const result = await db.execute({
    sql: "SELECT * FROM courses WHERE education_id = ? AND owner_id = ? ORDER BY created_at ASC",
    args: [req.params.educationId, req.user!.id],
  });
  return res.json(result.rows);
});

educationRouter.post("/educations/:educationId/courses", async (req, res) => {
  const parsed = createCourseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const education = await db.execute({
    sql: "SELECT id FROM educations WHERE id = ? AND owner_id = ?",
    args: [req.params.educationId, req.user!.id],
  });
  if (education.rows.length === 0) return res.status(404).json({ error: "Formação não encontrada." });

  const id = nanoid();
  await db.execute({
    sql: "INSERT INTO courses (id, education_id, owner_id, name, semester) VALUES (?, ?, ?, ?, ?)",
    args: [id, req.params.educationId, req.user!.id, parsed.data.name, parsed.data.semester ?? null],
  });
  const created = await db.execute({ sql: "SELECT * FROM courses WHERE id = ?", args: [id] });
  return res.status(201).json(created.rows[0]);
});

educationRouter.patch("/courses/:id", async (req, res) => {
  const parsed = updateCourseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const existing = await db.execute({
    sql: "SELECT id FROM courses WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  if (existing.rows.length === 0) return res.status(404).json({ error: "Curso não encontrado." });

  const sets: string[] = [];
  const args: Array<string | number | null> = [];
  if (parsed.data.name !== undefined) { sets.push("name = ?"); args.push(parsed.data.name); }
  if (parsed.data.semester !== undefined) { sets.push("semester = ?"); args.push(parsed.data.semester ?? null); }
  if (sets.length === 0) return res.status(400).json({ error: "Nenhum campo para atualizar." });
  args.push(req.params.id, req.user!.id);

  await db.execute({ sql: `UPDATE courses SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`, args });
  const updated = await db.execute({ sql: "SELECT * FROM courses WHERE id = ? AND owner_id = ?", args: [req.params.id, req.user!.id] });
  return res.json(updated.rows[0]);
});

educationRouter.delete("/courses/:id", async (req, res) => {
  const db = getDb();
  const result = await db.execute({
    sql: "DELETE FROM courses WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  if (result.rowsAffected === 0) return res.status(404).json({ error: "Curso não encontrado." });
  return res.status(204).send();
});

/* ============================== Subjects ============================== */

educationRouter.get("/courses/:courseId/subjects", async (req, res) => {
  const db = getDb();
  const course = await db.execute({
    sql: "SELECT id FROM courses WHERE id = ? AND owner_id = ?",
    args: [req.params.courseId, req.user!.id],
  });
  if (course.rows.length === 0) return res.status(404).json({ error: "Curso não encontrado." });

  const result = await db.execute({
    sql: "SELECT * FROM subjects WHERE course_id = ? AND owner_id = ? ORDER BY created_at ASC",
    args: [req.params.courseId, req.user!.id],
  });
  return res.json(
    result.rows.map((row) => ({
      ...row,
      grades: parseJson(row.grades),
      files: parseJson(row.files),
    }))
  );
});

educationRouter.post("/courses/:courseId/subjects", async (req, res) => {
  const parsed = createSubjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const course = await db.execute({
    sql: "SELECT id FROM courses WHERE id = ? AND owner_id = ?",
    args: [req.params.courseId, req.user!.id],
  });
  if (course.rows.length === 0) return res.status(404).json({ error: "Curso não encontrado." });

  const d = parsed.data;
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO subjects (id, course_id, owner_id, name, professor, workload_hours, status, grades, files, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      req.params.courseId,
      req.user!.id,
      d.name,
      d.professor ?? null,
      d.workloadHours ?? null,
      d.status ?? "Planejada",
      jsonOrNull(d.grades),
      jsonOrNull(d.files),
      d.notes ?? null,
    ],
  });
  const created = await db.execute({ sql: "SELECT * FROM subjects WHERE id = ?", args: [id] });
  const row = created.rows[0];
  return res.status(201).json({ ...row, grades: parseJson(row.grades), files: parseJson(row.files) });
});

const SUBJECT_FIELD_MAP: Record<string, string> = {
  name: "name",
  professor: "professor",
  workloadHours: "workload_hours",
  status: "status",
  progressPct: "progress_pct",
  notes: "notes",
};

educationRouter.patch("/subjects/:id", async (req, res) => {
  const parsed = updateSubjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const existing = await db.execute({
    sql: "SELECT id FROM subjects WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  if (existing.rows.length === 0) return res.status(404).json({ error: "Disciplina não encontrada." });

  const data = parsed.data as Record<string, unknown>;
  const sets: string[] = [];
  const args: Array<string | number | null> = [];
  for (const [key, column] of Object.entries(SUBJECT_FIELD_MAP)) {
    if (key in data) {
      sets.push(`${column} = ?`);
      args.push((data[key] as string | number | null) ?? null);
    }
  }
  if ("grades" in data) { sets.push("grades = ?"); args.push(jsonOrNull(data.grades)); }
  if ("files" in data) { sets.push("files = ?"); args.push(jsonOrNull(data.files)); }
  if (sets.length === 0) return res.status(400).json({ error: "Nenhum campo para atualizar." });
  args.push(req.params.id, req.user!.id);

  await db.execute({ sql: `UPDATE subjects SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`, args });
  const updated = await db.execute({ sql: "SELECT * FROM subjects WHERE id = ? AND owner_id = ?", args: [req.params.id, req.user!.id] });
  const row = updated.rows[0];
  return res.json({ ...row, grades: parseJson(row.grades), files: parseJson(row.files) });
});

educationRouter.delete("/subjects/:id", async (req, res) => {
  const db = getDb();
  const result = await db.execute({
    sql: "DELETE FROM subjects WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  if (result.rowsAffected === 0) return res.status(404).json({ error: "Disciplina não encontrada." });
  return res.status(204).send();
});

/* ==================== Disciplinas (visão consolidada) ==================== */

/**
 * Lista todas as disciplinas da formação (de todos os períodos/cursos
 * cadastrados), já com o nome do período — é o que alimenta o card
 * "Disciplinas do semestre" do painel, sem depender de o usuário
 * navegar período por período.
 */
educationRouter.get("/educations/:id/subjects", async (req, res) => {
  const db = getDb();
  const education = await db.execute({
    sql: "SELECT id FROM educations WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  if (education.rows.length === 0) return res.status(404).json({ error: "Formação não encontrada." });

  const result = await db.execute({
    sql: `SELECT s.*, c.name as course_name, c.semester as course_semester
          FROM subjects s
          JOIN courses c ON c.id = s.course_id
          WHERE c.education_id = ? AND s.owner_id = ?
          ORDER BY s.created_at ASC`,
    args: [req.params.id, req.user!.id],
  });
  return res.json(
    result.rows.map((row) => ({ ...row, grades: parseJson(row.grades), files: parseJson(row.files) }))
  );
});

/**
 * Criação rápida de disciplina direto do painel: se a formação ainda
 * não tem nenhum período/curso cadastrado, cria um automaticamente
 * (rotulado com o ano corrente) em vez de obrigar o usuário a criar
 * um período manualmente antes de registrar sua primeira disciplina.
 */
educationRouter.post("/educations/:id/subjects", async (req, res) => {
  const parsed = quickCreateSubjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const education = await db.execute({
    sql: "SELECT id FROM educations WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  if (education.rows.length === 0) return res.status(404).json({ error: "Formação não encontrada." });

  let courseId: string;
  const latestCourse = await db.execute({
    sql: "SELECT id FROM courses WHERE education_id = ? AND owner_id = ? ORDER BY created_at DESC LIMIT 1",
    args: [req.params.id, req.user!.id],
  });
  if (latestCourse.rows.length > 0) {
    courseId = latestCourse.rows[0].id as string;
  } else {
    courseId = nanoid();
    const year = new Date().getFullYear();
    await db.execute({
      sql: "INSERT INTO courses (id, education_id, owner_id, name) VALUES (?, ?, ?, ?)",
      args: [courseId, req.params.id, req.user!.id, `Período ${year}`],
    });
  }

  const d = parsed.data;
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO subjects (id, course_id, owner_id, name, professor, status)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, courseId, req.user!.id, d.name, d.professor ?? null, d.status ?? "Em andamento"],
  });
  const created = await db.execute({
    sql: `SELECT s.*, c.name as course_name, c.semester as course_semester
          FROM subjects s JOIN courses c ON c.id = s.course_id WHERE s.id = ?`,
    args: [id],
  });
  const row = created.rows[0];
  return res.status(201).json({ ...row, grades: parseJson(row.grades), files: parseJson(row.files) });
});

/* ============================ Prazos acadêmicos ============================ */

educationRouter.get("/educations/:id/deadlines", async (req, res) => {
  const db = getDb();
  const education = await db.execute({
    sql: "SELECT id FROM educations WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  if (education.rows.length === 0) return res.status(404).json({ error: "Formação não encontrada." });

  const result = await db.execute({
    sql: `SELECT d.*, s.name as subject_name FROM academic_deadlines d
          LEFT JOIN subjects s ON s.id = d.subject_id
          WHERE d.education_id = ? AND d.owner_id = ?
          ORDER BY d.done ASC, d.due_date ASC`,
    args: [req.params.id, req.user!.id],
  });
  return res.json(result.rows);
});

educationRouter.post("/educations/:id/deadlines", async (req, res) => {
  const parsed = createDeadlineSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const education = await db.execute({
    sql: "SELECT id FROM educations WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  if (education.rows.length === 0) return res.status(404).json({ error: "Formação não encontrada." });

  const d = parsed.data;
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO academic_deadlines (id, owner_id, education_id, subject_id, title, due_date)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, req.user!.id, req.params.id, d.subjectId ?? null, d.title, d.dueDate],
  });
  const created = await db.execute({ sql: "SELECT * FROM academic_deadlines WHERE id = ?", args: [id] });
  return res.status(201).json(created.rows[0]);
});

educationRouter.patch("/deadlines/:id", async (req, res) => {
  const parsed = updateDeadlineSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const existing = await db.execute({
    sql: "SELECT id FROM academic_deadlines WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  if (existing.rows.length === 0) return res.status(404).json({ error: "Prazo não encontrado." });

  const d = parsed.data;
  const sets: string[] = [];
  const args: Array<string | number | null> = [];
  if (d.title !== undefined) { sets.push("title = ?"); args.push(d.title); }
  if (d.dueDate !== undefined) { sets.push("due_date = ?"); args.push(d.dueDate); }
  if (d.subjectId !== undefined) { sets.push("subject_id = ?"); args.push(d.subjectId); }
  if (d.done !== undefined) { sets.push("done = ?"); args.push(d.done ? 1 : 0); }
  if (sets.length === 0) return res.status(400).json({ error: "Nenhum campo para atualizar." });
  args.push(req.params.id, req.user!.id);

  await db.execute({ sql: `UPDATE academic_deadlines SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`, args });
  const updated = await db.execute({ sql: "SELECT * FROM academic_deadlines WHERE id = ? AND owner_id = ?", args: [req.params.id, req.user!.id] });
  return res.json(updated.rows[0]);
});

educationRouter.delete("/deadlines/:id", async (req, res) => {
  const db = getDb();
  const result = await db.execute({
    sql: "DELETE FROM academic_deadlines WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  if (result.rowsAffected === 0) return res.status(404).json({ error: "Prazo não encontrado." });
  return res.status(204).send();
});

/* ============================ Sessões de estudo ============================ */

educationRouter.post("/educations/:id/study-sessions", async (req, res) => {
  const parsed = createStudySessionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const education = await db.execute({
    sql: "SELECT id FROM educations WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  if (education.rows.length === 0) return res.status(404).json({ error: "Formação não encontrada." });

  const d = parsed.data;
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO study_sessions (id, owner_id, education_id, subject_id, occurred_at, duration_minutes)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, req.user!.id, req.params.id, d.subjectId ?? null, d.occurredAt, d.durationMinutes],
  });
  const created = await db.execute({ sql: "SELECT * FROM study_sessions WHERE id = ?", args: [id] });
  return res.status(201).json(created.rows[0]);
});

/* =============================== Checklist =============================== */

educationRouter.get("/educations/:id/checklist", async (req, res) => {
  const db = getDb();
  const education = await db.execute({
    sql: "SELECT id FROM educations WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  if (education.rows.length === 0) return res.status(404).json({ error: "Formação não encontrada." });

  const result = await db.execute({
    sql: "SELECT * FROM semester_checklist WHERE education_id = ? AND owner_id = ? ORDER BY position ASC, created_at ASC",
    args: [req.params.id, req.user!.id],
  });
  return res.json(result.rows);
});

educationRouter.post("/educations/:id/checklist", async (req, res) => {
  const parsed = createChecklistItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const education = await db.execute({
    sql: "SELECT id FROM educations WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  if (education.rows.length === 0) return res.status(404).json({ error: "Formação não encontrada." });

  const countRow = await db.execute({
    sql: "SELECT COUNT(*) as n FROM semester_checklist WHERE education_id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  const position = Number((countRow.rows[0] as unknown as { n: number }).n ?? 0);

  const d = parsed.data;
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO semester_checklist (id, owner_id, education_id, title, due_date, position)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, req.user!.id, req.params.id, d.title, d.dueDate ?? null, position],
  });
  const created = await db.execute({ sql: "SELECT * FROM semester_checklist WHERE id = ?", args: [id] });
  return res.status(201).json(created.rows[0]);
});

educationRouter.patch("/checklist/:id", async (req, res) => {
  const parsed = updateChecklistItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const existing = await db.execute({
    sql: "SELECT id FROM semester_checklist WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  if (existing.rows.length === 0) return res.status(404).json({ error: "Item não encontrado." });

  const d = parsed.data;
  const sets: string[] = [];
  const args: Array<string | number | null> = [];
  if (d.title !== undefined) { sets.push("title = ?"); args.push(d.title); }
  if (d.dueDate !== undefined) { sets.push("due_date = ?"); args.push(d.dueDate); }
  if (d.position !== undefined) { sets.push("position = ?"); args.push(d.position); }
  if (d.done !== undefined) { sets.push("done = ?"); args.push(d.done ? 1 : 0); }
  if (sets.length === 0) return res.status(400).json({ error: "Nenhum campo para atualizar." });
  args.push(req.params.id, req.user!.id);

  await db.execute({ sql: `UPDATE semester_checklist SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`, args });
  const updated = await db.execute({ sql: "SELECT * FROM semester_checklist WHERE id = ? AND owner_id = ?", args: [req.params.id, req.user!.id] });
  return res.json(updated.rows[0]);
});

educationRouter.delete("/checklist/:id", async (req, res) => {
  const db = getDb();
  const result = await db.execute({
    sql: "DELETE FROM semester_checklist WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  if (result.rowsAffected === 0) return res.status(404).json({ error: "Item não encontrado." });
  return res.status(204).send();
});

/* =============================== Painel/Stats =============================== */

/**
 * Todo número aqui vem de uma contagem/soma real no banco — nunca é
 * estimado. "studyChangePct" só aparece quando havia estudo registrado
 * na semana anterior (para não dividir por zero nem inventar uma
 * variação); os minutos por dia da semana atual (seg-dom) alimentam o
 * gráfico de barras do painel.
 */
educationRouter.get("/educations/:id/stats", async (req, res) => {
  const db = getDb();
  const eduRes = await db.execute({
    sql: "SELECT id, weekly_study_goal_minutes FROM educations WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  if (eduRes.rows.length === 0) return res.status(404).json({ error: "Formação não encontrada." });
  const weeklyGoalMinutes = Number((eduRes.rows[0] as unknown as { weekly_study_goal_minutes: number }).weekly_study_goal_minutes);

  const [subjectsCount, activeSubjectsCount, deadlinesCount, activeProjectsCount] = await Promise.all([
    db.execute({
      sql: `SELECT COUNT(*) as n FROM subjects s JOIN courses c ON c.id = s.course_id WHERE c.education_id = ? AND s.owner_id = ?`,
      args: [req.params.id, req.user!.id],
    }),
    db.execute({
      sql: `SELECT COUNT(*) as n FROM subjects s JOIN courses c ON c.id = s.course_id WHERE c.education_id = ? AND s.owner_id = ? AND s.status = 'Em andamento'`,
      args: [req.params.id, req.user!.id],
    }),
    db.execute({
      sql: `SELECT COUNT(*) as n FROM academic_deadlines WHERE education_id = ? AND owner_id = ? AND done = 0 AND due_date <= date('now', '+30 days')`,
      args: [req.params.id, req.user!.id],
    }),
    db.execute({
      sql: `SELECT COUNT(*) as n FROM academic_projects WHERE education_id = ? AND owner_id = ? AND progress_pct < 100`,
      args: [req.params.id, req.user!.id],
    }),
  ]);

  // Semana corrente (segunda a domingo) e semana anterior, para o
  // comparativo real de horas de estudo.
  const dayLabels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  const now = new Date();
  const jsDay = now.getDay(); // 0=domingo
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() + mondayOffset);

  const isoDate = (dt: Date) => dt.toISOString().slice(0, 10);
  const weekStart = isoDate(monday);
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);
  const weekEnd = isoDate(nextMonday);
  const prevMonday = new Date(monday);
  prevMonday.setDate(monday.getDate() - 7);
  const prevWeekStart = isoDate(prevMonday);

  const [thisWeekRows, lastWeekRow] = await Promise.all([
    db.execute({
      sql: `SELECT occurred_at, SUM(duration_minutes) as minutes FROM study_sessions
            WHERE education_id = ? AND owner_id = ? AND occurred_at >= ? AND occurred_at < ?
            GROUP BY occurred_at`,
      args: [req.params.id, req.user!.id, weekStart, weekEnd],
    }),
    db.execute({
      sql: `SELECT COALESCE(SUM(duration_minutes), 0) as minutes FROM study_sessions
            WHERE education_id = ? AND owner_id = ? AND occurred_at >= ? AND occurred_at < ?`,
      args: [req.params.id, req.user!.id, prevWeekStart, weekStart],
    }),
  ]);

  const byDate = new Map<string, number>();
  for (const row of thisWeekRows.rows) {
    byDate.set(row.occurred_at as string, Number(row.minutes));
  }
  const dailyStudyMinutes = dayLabels.map((label, idx) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + idx);
    return { weekday: label, minutes: byDate.get(isoDate(d)) ?? 0 };
  });
  const studyMinutesThisWeek = dailyStudyMinutes.reduce((sum, d) => sum + d.minutes, 0);
  const studyMinutesLastWeek = Number((lastWeekRow.rows[0] as unknown as { minutes: number }).minutes);
  const studyChangePct =
    studyMinutesLastWeek > 0 ? Math.round(((studyMinutesThisWeek - studyMinutesLastWeek) / studyMinutesLastWeek) * 100) : null;

  return res.json({
    totalSubjects: Number((subjectsCount.rows[0] as unknown as { n: number }).n),
    activeSubjects: Number((activeSubjectsCount.rows[0] as unknown as { n: number }).n),
    upcomingDeadlines: Number((deadlinesCount.rows[0] as unknown as { n: number }).n),
    activeAcademicProjects: Number((activeProjectsCount.rows[0] as unknown as { n: number }).n),
    studyMinutesThisWeek,
    studyMinutesLastWeek,
    studyChangePct,
    weeklyGoalMinutes,
    dailyStudyMinutes,
  });
});

/* ========================== Academic Projects ========================== */

educationRouter.get("/academic-projects", async (req, res) => {
  const { educationId } = req.query as { educationId?: string };
  const db = getDb();
  const conditions = ["owner_id = ?"];
  const args: string[] = [req.user!.id];
  if (educationId) {
    conditions.push("education_id = ?");
    args.push(educationId);
  }
  const result = await db.execute({
    sql: `SELECT * FROM academic_projects WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`,
    args,
  });
  return res.json(result.rows);
});

educationRouter.post("/academic-projects", async (req, res) => {
  const parsed = createAcademicProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const d = parsed.data;
  const db = getDb();

  // Se um project_id (Kanban/Gantt genérico) foi informado, confirma
  // que ele pertence ao mesmo usuário antes de vincular.
  if (d.projectId) {
    const project = await db.execute({
      sql: "SELECT id FROM projects WHERE id = ? AND owner_id = ?",
      args: [d.projectId, req.user!.id],
    });
    if (project.rows.length === 0) {
      return res.status(400).json({ error: "Projeto vinculado não encontrado." });
    }
  }
  if (d.educationId) {
    const education = await db.execute({
      sql: "SELECT id FROM educations WHERE id = ? AND owner_id = ?",
      args: [d.educationId, req.user!.id],
    });
    if (education.rows.length === 0) {
      return res.status(400).json({ error: "Formação vinculada não encontrada." });
    }
  }

  // Sem project_id explícito, cria automaticamente um projeto (kind
  // 'academic') pra este trabalho — é o que dá a ele um Kanban de
  // tarefas de verdade, igual a qualquer outro projeto do LifeOS.
  let projectId = d.projectId ?? null;
  if (!projectId) {
    projectId = nanoid();
    await db.execute({
      sql: "INSERT INTO projects (id, owner_id, name, kind) VALUES (?, ?, ?, 'academic')",
      args: [projectId, req.user!.id, d.title],
    });
  }

  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO academic_projects (id, owner_id, project_id, education_id, kind, title, advisor, progress_pct, defense_date)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      req.user!.id,
      projectId,
      d.educationId ?? null,
      d.kind,
      d.title,
      d.advisor ?? null,
      d.progressPct ?? 0,
      d.defenseDate ?? null,
    ],
  });
  const created = await db.execute({ sql: "SELECT * FROM academic_projects WHERE id = ?", args: [id] });
  return res.status(201).json(created.rows[0]);
});

const ACADEMIC_PROJECT_FIELD_MAP: Record<string, string> = {
  kind: "kind",
  title: "title",
  advisor: "advisor",
  progressPct: "progress_pct",
  defenseDate: "defense_date",
};

educationRouter.patch("/academic-projects/:id", async (req, res) => {
  const parsed = updateAcademicProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const existing = await db.execute({
    sql: "SELECT id FROM academic_projects WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  if (existing.rows.length === 0) return res.status(404).json({ error: "Projeto acadêmico não encontrado." });

  const data = parsed.data as Record<string, unknown>;
  const sets: string[] = [];
  const args: Array<string | number | null> = [];
  for (const [key, column] of Object.entries(ACADEMIC_PROJECT_FIELD_MAP)) {
    if (key in data) {
      sets.push(`${column} = ?`);
      args.push((data[key] as string | number | null) ?? null);
    }
  }
  if (sets.length === 0) return res.status(400).json({ error: "Nenhum campo para atualizar." });
  args.push(req.params.id, req.user!.id);

  await db.execute({ sql: `UPDATE academic_projects SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`, args });
  const updated = await db.execute({ sql: "SELECT * FROM academic_projects WHERE id = ? AND owner_id = ?", args: [req.params.id, req.user!.id] });
  return res.json(updated.rows[0]);
});

/**
 * DELETE /education/academic-projects/:id — apaga o projeto acadêmico
 * (TCC/dissertação/tese...) e também o projeto genérico vinculado
 * (Kanban/Gantt), quando existir. Sem isso o projeto genérico ficava
 * órfão em Projetos (kind='academic', mas sem nenhum vínculo com
 * Educação) e não havia como removê-lo — era exatamente o "lixo"
 * de projetos de educação que o usuário não conseguia apagar.
 * Apagar direto a linha de `projects` já é suficiente: a FK
 * academic_projects.project_id é ON DELETE CASCADE, então a linha de
 * academic_projects some junto — só precisamos apagar academic_projects
 * primeiro nos casos (raros) em que project_id é nulo.
 */
educationRouter.delete("/academic-projects/:id", async (req, res) => {
  const db = getDb();
  const existing = await db.execute({
    sql: "SELECT project_id FROM academic_projects WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  if (existing.rows.length === 0) return res.status(404).json({ error: "Projeto acadêmico não encontrado." });

  const projectId = (existing.rows[0] as unknown as { project_id: string | null }).project_id;
  if (projectId) {
    // Cascade cuida de apagar a linha de academic_projects também.
    await db.execute({ sql: "DELETE FROM projects WHERE id = ? AND owner_id = ?", args: [projectId, req.user!.id] });
  } else {
    await db.execute({ sql: "DELETE FROM academic_projects WHERE id = ? AND owner_id = ?", args: [req.params.id, req.user!.id] });
  }
  return res.status(204).send();
});
