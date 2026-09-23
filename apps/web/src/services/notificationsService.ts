import { api } from "./api";
import type { CustomNotificationTrigger, NotificationAlertLevel, NotificationTriggerEvent, NotificationTriggerRule } from "@/types";

export interface LiveNotification {
  id: string;
  kind: "task_overdue" | "task_due_today" | "daily_insight" | "custom_trigger" | "habit_pending" | "weekly_review_pending";
  title: string;
  body: string;
  link: string;
  severity: "alta" | "media" | "baixa";
}

export const notificationsService = {
  live: () => api.get<LiveNotification[]>("/notifications/live"),
  /** Marca notificações como vistas — somem do sino até a condição gerar uma nova (ver notifications.routes.ts). */
  dismiss: (ids: string[]) => api.post<void>("/notifications/dismiss", { ids }),
  triggers: () => api.get<NotificationTriggerRule[]>("/notifications/triggers"),
  customTriggers: () => api.get<CustomNotificationTrigger[]>("/notifications/triggers/custom"),
  createCustomTrigger: (input: Omit<CustomNotificationTrigger, "id">) => api.post<CustomNotificationTrigger>("/notifications/triggers/custom", input),
  updateCustomTrigger: (id: string, patch: Partial<Omit<CustomNotificationTrigger, "id">>) => api.patch<CustomNotificationTrigger>(`/notifications/triggers/custom/${id}`, patch),
  deleteCustomTrigger: (id: string) => api.delete(`/notifications/triggers/custom/${id}`),
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
