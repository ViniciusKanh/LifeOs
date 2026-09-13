import { z } from "zod";

const EDUCATION_KIND = [
  "graduacao",
  "pos_graduacao",
  "mestrado",
  "doutorado",
  "curso_online",
  "certificacao",
  "curso_livre",
] as const;

const SUBJECT_STATUS = ["Planejada", "Em andamento", "Concluída", "Trancada"] as const;

const ACADEMIC_PROJECT_KIND = [
  "tcc",
  "dissertacao",
  "tese",
  "artigo",
  "projeto_cientifico",
  "trabalho_final",
] as const;

export const createEducationSchema = z.object({
  kind: z.enum(EDUCATION_KIND),
  institution: z.string().trim().max(300).optional().nullable(),
  courseName: z.string().trim().min(1, "Informe o nome do curso/formação").max(300),
  startedAt: z.string().optional().nullable(),
  expectedEndAt: z.string().optional().nullable(),
  progressPct: z.number().int().min(0).max(100).optional().default(0),
  notes: z.string().max(5000).optional().nullable(),
});
export const updateEducationSchema = createEducationSchema.partial();

export const createCourseSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do curso").max(300),
  semester: z.string().trim().max(50).optional().nullable(),
});
export const updateCourseSchema = createCourseSchema.partial();

export const createSubjectSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da disciplina").max(300),
  professor: z.string().trim().max(200).optional().nullable(),
  workloadHours: z.number().int().nonnegative().optional().nullable(),
  status: z.enum(SUBJECT_STATUS).optional().default("Planejada"),
  progressPct: z.number().int().min(0).max(100).optional().default(0),
  grades: z.record(z.string(), z.unknown()).optional().nullable(),
  files: z.array(z.string()).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});
export const updateSubjectSchema = createSubjectSchema.partial();

/** Disciplina criada direto do painel da formação — resolve/cria o
 * período (curso) automaticamente, então não pede courseId. */
export const quickCreateSubjectSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da disciplina").max(300),
  professor: z.string().trim().max(200).optional().nullable(),
  status: z.enum(SUBJECT_STATUS).optional().default("Em andamento"),
});

export const createDeadlineSchema = z.object({
  title: z.string().trim().min(1, "Informe o título do prazo").max(300),
  dueDate: z.string().trim().min(1, "Informe a data"),
  subjectId: z.string().trim().optional().nullable(),
});
export const updateDeadlineSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  dueDate: z.string().trim().min(1).optional(),
  subjectId: z.string().trim().optional().nullable(),
  done: z.boolean().optional(),
});

export const createStudySessionSchema = z.object({
  occurredAt: z.string().trim().min(1, "Informe a data"),
  durationMinutes: z.number().int().positive().max(1440),
  subjectId: z.string().trim().optional().nullable(),
});

export const createChecklistItemSchema = z.object({
  title: z.string().trim().min(1, "Informe o título do item").max(300),
  dueDate: z.string().trim().optional().nullable(),
});
export const updateChecklistItemSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  dueDate: z.string().trim().optional().nullable(),
  done: z.boolean().optional(),
  position: z.number().int().optional(),
});

export const createAcademicProjectSchema = z.object({
  projectId: z.string().trim().optional().nullable(),
  educationId: z.string().trim().optional().nullable(),
  kind: z.enum(ACADEMIC_PROJECT_KIND),
  title: z.string().trim().min(1, "Informe o título do trabalho").max(300),
  advisor: z.string().trim().max(200).optional().nullable(),
  progressPct: z.number().int().min(0).max(100).optional().default(0),
  defenseDate: z.string().optional().nullable(),
});
export const updateAcademicProjectSchema = createAcademicProjectSchema.partial();
