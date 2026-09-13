import { api } from "./api";

export interface LiveNotification {
  id: string;
  kind: "task_overdue" | "task_due_today" | "habit_pending" | "weekly_review_pending";
  title: string;
  body: string;
  link: string;
  severity: "alta" | "media" | "baixa";
}

export const notificationsService = {
  live: () => api.get<LiveNotification[]>("/notifications/live"),
};
