import { api } from "./api";
import type { CustomNotificationTrigger, InAppNotificationItem, NotificationAlertLevel, NotificationTriggerEvent, NotificationTriggerRule } from "@/types";

export const notificationsService = {
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
  /** Sino de notificações: histórico real do que já foi disparado (canal "No app"). */
  feed: (limit = 30) =>
    api.get<{ items: InAppNotificationItem[]; unreadCount: number }>(`/notifications/feed?limit=${limit}`),
  markFeedItemRead: (id: string) => api.post<{ ok: true }>(`/notifications/feed/${id}/read`, {}),
  markAllFeedRead: () => api.post<{ marked: number }>("/notifications/feed/read-all", {}),
};
