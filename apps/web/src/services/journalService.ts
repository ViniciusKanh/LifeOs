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

export const journalService = {
  get: (date: string) => api.get<JournalEntry>(`/journal/${date}`),
  save: (date: string, input: JournalUpsertInput) => api.put<JournalEntry>(`/journal/${date}`, input),
  insights: () => api.get<JournalInsights>("/journal/insights"),
};
