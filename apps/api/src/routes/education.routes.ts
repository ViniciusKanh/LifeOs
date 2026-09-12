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
  createAcademicProjectSchema,
  updateAcademicProjectSchema,
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

educationRouter.get("/educations", async (req, res) => {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM educations WHERE owner_id = ? ORDER BY started_at DESC, created_at DESC",
    args: [req.user!.id],
  });
  return res.json(result.rows);
});

educationRouter.get("/educations/:id", async (req, res) => {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM educations WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  if (result.rows.length === 0) return res.status(404).json({ error: "Formação não encontrada." });
  return res.json(result.rows[0]);
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

educationRouter.delete("/educations/:id", async (req, res) => {
  const db = getDb();
  const result = await db.execute({
    sql: "DELETE FROM educations WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  if (result.rowsAffected === 0) return res.status(404).json({ error: "Formação não encontrada." });
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

/* ========================== Academic Projects ========================== */

educationRouter.get("/academic-projects", async (req, res) => {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM academic_projects WHERE owner_id = ? ORDER BY created_at DESC",
    args: [req.user!.id],
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

  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO academic_projects (id, owner_id, project_id, kind, title, advisor, progress_pct, defense_date)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, req.user!.id, d.projectId ?? null, d.kind, d.title, d.advisor ?? null, d.progressPct ?? 0, d.defenseDate ?? null],
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

educationRouter.delete("/academic-projects/:id", async (req, res) => {
  const db = getDb();
  const result = await db.execute({
    sql: "DELETE FROM academic_projects WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user!.id],
  });
  if (result.rowsAffected === 0) return res.status(404).json({ error: "Projeto acadêmico não encontrado." });
  return res.status(204).send();
});
