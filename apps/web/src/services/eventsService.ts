import { api } from "./api";
import type { CalendarItem } from "@/types";

export const eventsService = {
  list: (from: string, to: string) => api.get<CalendarItem[]>(`/events?from=${from}&to=${to}`),
  create: (input: { title: string; description?: string | null; startsAt: string; endsAt?: string | null; allDay?: boolean }) =>
    api.post<CalendarItem>("/events", input),
  update: (id: string, input: Partial<{ title: string; description: string | null; startsAt: string; endsAt: string | null; allDay: boolean }>) =>
    api.patch<CalendarItem>(`/events/${id}`, input),
  remove: (id: string) => api.delete<void>(`/events/${id}`),
};
