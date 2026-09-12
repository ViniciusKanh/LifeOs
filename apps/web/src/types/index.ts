export type UserRole = "user" | "admin";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar_url: string | null;
  theme: "light" | "dark" | "system";
  onboarding_done: number;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export type AdminIntegration = "gemini" | "turso" | "smtp";

export interface AdminSetting {
  id: string;
  integration: AdminIntegration;
  key_name: string;
  masked_preview: string;
  is_active: number;
  extra_config: string | null;
  updated_at: string;
}

export type TaskPriority = "Baixa" | "Média" | "Alta";

export interface Task {
  id: string;
  owner_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: TaskPriority;
  due_date: string | null;
  estimate_minutes: number | null;
  time_spent_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface Habit {
  id: string;
  owner_id: string;
  name: string;
  icon: string | null;
  frequency: "daily" | "specific_days" | "times_per_week" | "weekly" | "monthly";
  target_count: number;
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
  categories: string | null;
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
  kind: "note" | "quote" | "insight" | "summary" | "idea";
  content: string;
  page: number | null;
  created_at: string;
}

export interface ReadingSession {
  id: string;
  book_id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  pages_read: number;
  created_at: string;
}

/** Preview retornado pela busca por ISBN — nada é gravado até o usuário confirmar. */
export interface BookLookupResult {
  isbn: string;
  title: string;
  author: string | null;
  publisher: string | null;
  coverUrl: string | null;
  publishedYear: number | null;
  totalPages: number | null;
  categories: string[];
  description: string | null;
  source: "google_books" | "open_library";
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
  name: string;
  semester: string | null;
  created_at: string;
}

export interface Subject {
  id: string;
  course_id: string;
  name: string;
  professor: string | null;
  workload_hours: number | null;
  status: "Planejada" | "Em andamento" | "Concluída" | "Trancada";
  grades: Record<string, unknown> | null;
  files: string[] | null;
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
