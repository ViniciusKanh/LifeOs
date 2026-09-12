export type UserRole = "user" | "admin";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  theme: "light" | "dark" | "system";
  onboarding_done: number;
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
