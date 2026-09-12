export type UserRole = "user" | "admin";

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar_url: string | null;
  language: string;
  timezone: string;
  theme: "light" | "dark" | "system";
  onboarding_done: number;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  owner_id: string;
  project_id: string | null;
  parent_task_id: string | null;
  goal_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: "Baixa" | "Média" | "Alta";
  impact: number | null;
  urgency: number | null;
  effort: number | null;
  priority_score: number | null;
  due_date: string | null;
  start_date: string | null;
  estimate_minutes: number | null;
  time_spent_minutes: number;
  recurrence_rule: string | null;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type BookStatus = "Quero Ler" | "Lendo" | "Pausado" | "Concluído" | "Abandonado";
export type BookSource = "manual" | "isbn" | "google_books" | "open_library";

export interface Book {
  id: string;
  owner_id: string;
  isbn: string | null;
  title: string;
  author: string | null;
  publisher: string | null;
  cover_url: string | null;
  published_year: number | null;
  total_pages: number | null;
  current_page: number;
  categories: string | null; // JSON array serializado
  description: string | null;
  status: BookStatus;
  rating: number | null;
  personal_note: string | null;
  started_at: string | null;
  finished_at: string | null;
  source: BookSource;
  created_at: string;
  updated_at: string;
}

export interface BookNote {
  id: string;
  book_id: string;
  owner_id: string;
  kind: "note" | "quote" | "insight" | "summary" | "idea";
  content: string;
  page: number | null;
  created_at: string;
}

export interface ReadingSession {
  id: string;
  book_id: string;
  owner_id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  pages_read: number;
  created_at: string;
}

export type EducationKind =
  | "graduacao"
  | "pos_graduacao"
  | "mestrado"
  | "doutorado"
  | "curso_online"
  | "certificacao"
  | "curso_livre";

export interface Education {
  id: string;
  owner_id: string;
  kind: EducationKind;
  institution: string | null;
  course_name: string;
  started_at: string | null;
  expected_end_at: string | null;
  progress_pct: number;
  notes: string | null;
  created_at: string;
}

export interface Course {
  id: string;
  education_id: string;
  owner_id: string;
  name: string;
  semester: string | null;
  created_at: string;
}

export interface Subject {
  id: string;
  course_id: string;
  owner_id: string;
  name: string;
  professor: string | null;
  workload_hours: number | null;
  status: "Planejada" | "Em andamento" | "Concluída" | "Trancada";
  grades: unknown;
  files: unknown;
  notes: string | null;
  created_at: string;
}

export type AcademicProjectKind = "tcc" | "dissertacao" | "tese" | "artigo" | "projeto_cientifico" | "trabalho_final";

export interface AcademicProject {
  id: string;
  owner_id: string;
  project_id: string | null;
  kind: AcademicProjectKind;
  title: string;
  advisor: string | null;
  progress_pct: number;
  defense_date: string | null;
  created_at: string;
}
