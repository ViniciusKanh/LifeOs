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

/** Prévia da crônica completa — `dataUsed` mostra a procedência (Dado real) de cada registro usado. */
export interface ChronicleDraft {
  text: string;
  title: string | null;
  dataUsed: Array<{ source: string; text: string }>;
  original: string;
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
  /** `text` = conteúdo atual do editor (a IA lê o que está na tela, não o que já foi salvo). */
  scribe: (date: string, action: ScribeAction, text: string) => api.post<ScribeResult>(`/chronicle-entry/${date}/scribe`, { action, consent: true, text }),
  /** Crônica completa: reescreve o texto e completa com missões, treinos, contratos e demais registros reais do dia. */
  writeChronicle: (date: string, text: string) => api.post<ChronicleDraft>(`/chronicle-entry/${date}/chronicle`, { consent: true, text }),
  transcribe: (mediaId: string) => api.post<{ text: string }>(`/chronicle-entry/media/${mediaId}/transcribe`, { consent: true }),
  learningToGrimoire: (date: string, text: string) => api.post<{ added: number }>(`/chronicle-entry/${date}/learning-to-grimoire`, { text }),
};
