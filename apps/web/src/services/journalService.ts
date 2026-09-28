import { api } from "./api";
import type { JournalEntry, JournalCollection, JournalMedia } from "@/types";

export interface JournalUpsertInput {
  intention?: string | null;
  thoughts?: string | null;
  gratitude?: string[];
  selfCare?: string[];
  selfCareOther?: string | null;
  challenges?: string | null;
  lighterPlan?: string | null;
  feelGood?: string | null;
  nightMood?: number | null;
  nightHelped?: string | null;
  nightTakeaway?: string | null;
  focusTaskIds?: string[];
  journalIds?: string[];
}

export interface JournalInsights {
  totalEntries: number;
  currentStreak: number;
  longestStreak: number;
  totalWords: number;
}

export interface JournalDaySummary {
  date: string;
  preview: string;
  wordCount: number;
  gratitudeCount: number;
  selfCareCount: number;
  nightMood: number | null;
  mood: { mood: number; energy: number } | null;
  journalIds: string[];
  photoCount: number;
  coverPhoto: string | null;
}

export interface JournalDaysPage {
  items: JournalDaySummary[];
  hasMore: boolean;
}

function daysQuery(before?: string, journalId?: string) {
  const params = new URLSearchParams();
  if (before) params.set("before", before);
  if (journalId) params.set("journalId", journalId);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const journalService = {
  get: (date: string) => api.get<JournalEntry>(`/journal/${date}`),
  save: (date: string, input: JournalUpsertInput) => api.put<JournalEntry>(`/journal/${date}`, input),
  insights: () => api.get<JournalInsights>("/journal/insights"),
  days: (before?: string, journalId?: string) => api.get<JournalDaysPage>(`/journal/days${daysQuery(before, journalId)}`),
  calendarMonth: (month: string, journalId?: string) =>
    api.get<{ days: string[] }>(`/journal/calendar?month=${month}${journalId ? `&journalId=${journalId}` : ""}`),
  addMedia: (date: string, dataUri: string, caption?: string | null) =>
    api.post<JournalEntry>(`/journal/${date}/media`, { dataUri, caption }),
  updateMediaCaption: (date: string, mediaId: string, caption: string | null) =>
    api.patch<JournalEntry>(`/journal/${date}/media/${mediaId}`, { caption }),
  removeMedia: (date: string, mediaId: string) => api.delete<JournalEntry>(`/journal/${date}/media/${mediaId}`),
};

export type { JournalMedia };

export interface JournalCollectionInput {
  name: string;
  icon?: string | null;
  color?: "pink" | "blue" | "purple" | "green" | "teal" | null;
  description?: string | null;
}

export const journalCollectionsService = {
  list: () => api.get<JournalCollection[]>("/journals"),
  create: (input: JournalCollectionInput) => api.post<JournalCollection>("/journals", input),
  update: (id: string, input: Partial<JournalCollectionInput>) => api.patch<JournalCollection>(`/journals/${id}`, input),
  remove: (id: string) => api.delete<void>(`/journals/${id}`),
};
