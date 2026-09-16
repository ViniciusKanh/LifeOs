import { api } from "./api";
import type { NotificationAlertLevel, NotificationTriggerEvent, NotificationTriggerRule } from "@/types";

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
  triggers: () => api.get<NotificationTriggerRule[]>("/notifications/triggers"),
  updateTrigger: (
    eventType: NotificationTriggerEvent,
    patch: Partial<Pick<NotificationTriggerRule, "channelEmail" | "channelPush" | "channelInApp" | "active">> & {
      alertLevel?: NotificationAlertLevel;
    }
  ) => api.patch<NotificationTriggerRule>(`/notifications/triggers/${eventType}`, patch),
  runTriggers: () =>
    api.post<{
      date: string;
      results: Array<{ eventType: NotificationTriggerEvent; count: number; emailSent: boolean; pushSent: number }>;
    }>("/notifications/triggers/run", {}),
};
