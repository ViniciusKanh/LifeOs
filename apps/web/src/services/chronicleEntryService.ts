import { api } from "./api";

/** Espelho de /api/chronicle-entry (Entrada do Diário 3.0). */

export type ScribeAction = "review" | "organize" | "summary" | "title" | "moments" | "learnings" | "tasks" | "tags" | "expand";

export interface ChronicleEntryMeta {
  date: string;
  today: string;
  journeyDay: number;
  chapter: { number: number; roman: string; title: string; daysInChapter: number; chapterSpan: number | null; pct: number; next: { title: string; at: number; missing: number } | null };
  cronista: { streak: number; bestStreak: number; totalEntries: number; daysWritten: number; totalWords: number };
  reflectionXp: number;
  writingGoal: number;
  writingGoalIsDefault: boolean;
  prevDate: string | null;
  nextDate: string | null;
  media: { visual: number; audio: number };
  insights: Array<{ icon: "pen" | "water" | "book" | "mood"; text: string }>;
  achievement: { title: string; description: string | null; tier: string; unlocked: boolean; current: number; threshold: number; reward: { xp: number; coins: number } } | null;
}

export interface ScribeResult {
  action: ScribeAction;
  text: string | null;
  items: string[];
  original: string;
}

export const chronicleEntryService = {
  meta: (date: string) => api.get<ChronicleEntryMeta>(`/chronicle-entry/${date}/meta`),
  setGoal: (goal: number) => api.put<{ ok: true }>("/chronicle-entry/settings/writing-goal", { goal }),
  scribe: (date: string, action: ScribeAction) => api.post<ScribeResult>(`/chronicle-entry/${date}/scribe`, { action, consent: true }),
  transcribe: (mediaId: string) => api.post<{ text: string }>(`/chronicle-entry/media/${mediaId}/transcribe`, { consent: true }),
  learningToGrimoire: (date: string, text: string) => api.post<{ added: number }>(`/chronicle-entry/${date}/learning-to-grimoire`, { text }),
};
