import { api } from "./api";
import type { JournalEntry } from "@/types";

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
}

export interface JournalDaysPage {
  items: JournalDaySummary[];
  hasMore: boolean;
}

export const journalService = {
  get: (date: string) => api.get<JournalEntry>(`/journal/${date}`),
  save: (date: string, input: JournalUpsertInput) => api.put<JournalEntry>(`/journal/${date}`, input),
  insights: () => api.get<JournalInsights>("/journal/insights"),
  days: (before?: string) => api.get<JournalDaysPage>(`/journal/days${before ? `?before=${before}` : ""}`),
  calendarMonth: (month: string) => api.get<{ days: string[] }>(`/journal/calendar?month=${month}`),
};
