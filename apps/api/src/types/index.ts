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
