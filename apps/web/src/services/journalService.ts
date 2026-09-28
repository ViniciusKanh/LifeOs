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
  locationLabel?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  tags?: string[];
}

export interface JournalInsights {
  totalEntries: number;
  currentStreak: number;
  longestStreak: number;
  totalWords: number;
  avgWordsPerEntry: number;
  bestWeekday: string | null;
  moodCorrelation: {
    onWritingDays: number;
    onOtherDays: number;
    sampleSize: { writingDays: number; otherDays: number };
  } | null;
  entriesByMonth: Array<{ month: string; count: number }>;
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
  photos: string[];
  isFavorite: boolean;
  locationLabel: string | null;
  tags: string[];
}

export interface JournalLocationSummary {
  label: string;
  count: number;
  lat: number | null;
  lng: number | null;
  lastDate: string;
}

export interface JournalDaysPage {
  items: JournalDaySummary[];
  hasMore: boolean;
}

function daysQuery(before?: string, journalId?: string, favoritesOnly?: boolean) {
  const params = new URLSearchParams();
  if (before) params.set("before", before);
  if (journalId) params.set("journalId", journalId);
  if (favoritesOnly) params.set("favoritesOnly", "1");
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const journalService = {
  get: (date: string) => api.get<JournalEntry>(`/journal/${date}`),
  save: (date: string, input: JournalUpsertInput) => api.put<JournalEntry>(`/journal/${date}`, input),
  insights: () => api.get<JournalInsights>("/journal/insights"),
  days: (before?: string, journalId?: string, favoritesOnly?: boolean) =>
    api.get<JournalDaysPage>(`/journal/days${daysQuery(before, journalId, favoritesOnly)}`),
  calendarMonth: (month: string, journalId?: string) =>
    api.get<{ days: string[] }>(`/journal/calendar?month=${month}${journalId ? `&journalId=${journalId}` : ""}`),
  addMedia: (date: string, dataUri: string, caption?: string | null) =>
    api.post<JournalEntry>(`/journal/${date}/media`, { dataUri, caption }),
  addAudioMedia: (date: string, dataUri: string, durationSeconds: number, caption?: string | null) =>
    api.post<JournalEntry>(`/journal/${date}/media/audio`, { dataUri, durationSeconds, caption }),
  updateMediaCaption: (date: string, mediaId: string, caption: string | null) =>
    api.patch<JournalEntry>(`/journal/${date}/media/${mediaId}`, { caption }),
  removeMedia: (date: string, mediaId: string) => api.delete<JournalEntry>(`/journal/${date}/media/${mediaId}`),
  toggleFavorite: (date: string, isFavorite: boolean) => api.patch<JournalEntry>(`/journal/${date}/favorite`, { isFavorite }),
  setTags: (date: string, tags: string[]) => api.patch<JournalEntry>(`/journal/${date}/tags`, { tags }),
  deleteEntry: (date: string) => api.delete<void>(`/journal/${date}`),
  moveToJournals: (date: string, journalIds: string[]) => api.patch<JournalEntry>(`/journal/${date}/journals`, { journalIds }),
  onThisDay: (date?: string) => api.get<{ items: JournalDaySummary[] }>(`/journal/on-this-day${date ? `?date=${date}` : ""}`),
  pinStatus: () => api.get<{ hasPin: boolean }>("/journal/pin/status"),
  setPin: (pin: string) => api.post<void>("/journal/pin", { pin }),
  verifyPin: (pin: string) => api.post<{ valid: boolean }>("/journal/pin/verify", { pin }),
  removePin: (pin: string) => api.delete<void>("/journal/pin", { pin }),
  moveDate: (date: string, newDate: string) => api.patch<JournalEntry>(`/journal/${date}/date`, { newDate }),
  addLink: (date: string, targetType: "project" | "goal", targetId: string) =>
    api.post<JournalEntry>(`/journal/${date}/links`, { targetType, targetId }),
  removeLink: (date: string, linkId: string) => api.delete<JournalEntry>(`/journal/${date}/links/${linkId}`),
  locations: () => api.get<{ items: JournalLocationSummary[] }>("/journal/locations"),
  daysByLocation: (label: string) => api.get<{ items: JournalDaySummary[] }>(`/journal/locations/${encodeURIComponent(label)}/days`),
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
