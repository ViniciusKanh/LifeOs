import { api } from "./api";
import type { HubMission } from "./moduleHubService";

/** Espelho de /api/habits-hub, /api/library-hub e /api/life-admin-hub (dados derivados). */

export type HabitFrequency = "daily" | "specific_days" | "times_per_week" | "weekly" | "monthly";
export interface Consistency {
  expected: number;
  fulfilled: number;
  pct: number | null;
}
export interface HubHabit {
  id: string;
  name: string;
  icon: string | null;
  category: string | null;
  frequency: HabitFrequency;
  days: number[];
  timesPerCycle: number;
  target: number;
  unit: string | null;
  priority: string | null;
  reminderTime: string | null;
  experimentId: string | null;
  autoSource: string | null;
  createdDay: string;
  pausedDay: string | null;
  paused: boolean;
  todayCount: number;
  doneToday: boolean;
  scheduledToday: boolean;
  cycle: { done: number; need: number; label: string } | null;
  streak: number;
  bestStreak: number;
  consistency30: Consistency;
}
export interface HabitsHub {
  today: string;
  indicators: {
    currentStreak: number;
    bestStreak: number;
    doneToday: number;
    scheduledToday: number;
    active: number;
    paused: number;
    consistency30: number | null;
    consistencyDeltaPts: number | null;
    week: Consistency;
    xpToday: number;
    xp30: number;
    xpTotal: number;
  };
  ritual: {
    items: Array<{ id: string; name: string; icon: string | null; done: boolean; count: number; target: number; unit: string | null }>;
    done: number;
    total: number;
    nextReward: { habitId: string; habitName: string; days: number; missing: number; xp: number; coins: number } | null;
  };
  milestones: Array<{ days: number; xp: number; coins: number; reached: boolean; claimedCount: number }>;
  habits: HubHabit[];
  calendar: Array<{ day: string; scheduled: number; done: number; paused: number; doneIds: string[]; future: boolean }>;
  hoursUtc: number[];
  missions: Array<{ key: string; title: string; current: number; target: number; done: boolean }>;
}
export interface HabitMetaInput {
  frequency?: HabitFrequency;
  days?: number[];
  timesPerCycle?: number;
  unit?: string | null;
  priority?: "Baixa" | "Média" | "Alta" | null;
  reminderTime?: string | null;
  experimentId?: string | null;
  paused?: boolean;
}

export interface LibBook {
  id: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
  status: string;
  currentPage: number;
  totalPages: number | null;
  categories: string | null;
  favorite: boolean;
  updatedAt: string;
  lastReadDay: string | null;
}
export interface LibSession {
  id: string;
  bookId: string;
  title: string;
  at: string;
  day: string;
  minutes: number | null;
  pages: number;
  startPage: number | null;
  endPage: number | null;
  note: string | null;
  learning: string | null;
}
export interface Trail {
  id: string;
  name: string;
  theme: string | null;
  objective: string | null;
  goalId: string | null;
  goalTitle: string | null;
  books: Array<{ id: string; title: string; author: string | null; coverUrl: string | null; status: string; currentPage: number; totalPages: number | null }>;
  done: number;
  pct: number;
  nextBookId: string | null;
}
export interface LibraryHub {
  today: string;
  indicators: {
    total: number;
    reading: number;
    completed: number;
    completedYear: number;
    pagesRead: number;
    pagesYear: number;
    uniquePages: number;
    streak: number;
    bestStreak: number;
    xp: number;
    minutesTotal: number;
    minutesYear: number;
    yearGoal: { booksTarget: number | null; pagesTarget: number | null } | null;
    yearBooks: { target: number; done: number; pct: number; status: string } | null;
  };
  featured: (LibBook & { lastSession: LibSession | null }) | null;
  desk: { pagesToday: number; minutesToday: number; dailyGoal: { id: string; title: string; target: number } | null; streak: number; readDays30: number };
  books: LibBook[];
  recentSessions: LibSession[];
  calendar: Array<{ day: string; pages: number; minutes: number; future: boolean }>;
  trails: Trail[];
  trailTemplates: ReadonlyArray<{ name: string; theme: string; objective: string }>;
  learnings: Array<{ sessionId: string; bookId: string; title: string; day: string; learning: string }>;
}
export interface SessionInput {
  bookId: string;
  date: string;
  durationMinutes?: number | null;
  startPage?: number | null;
  endPage?: number | null;
  pages?: number | null;
  note?: string | null;
  learning?: string | null;
}
export interface TrailInput {
  name: string;
  theme?: string | null;
  objective?: string | null;
  goalId?: string | null;
  bookIds: string[];
}

export type AdminUrgency = "overdue" | "today" | "soon" | "ok" | "no_date";
export interface AdminHub {
  today: string;
  month: string;
  indicators: {
    overdue: number;
    soon: number;
    ok: number;
    noDate: number;
    withFile: number;
    remindersActive: number;
    critical: number;
    nextMaintenance: { id: string; title: string; dueDate: string | null; daysLeft: number | null } | null;
    total: number;
  };
  order: { score: number; parts: { onTimePct: number; remindersPct: number; completePct: number }; basis: { items: number; dated: number } } | null;
  orderWeights: { onTime: number; reminders: number; completeness: number };
  critical: Array<{ id: string; title: string; urgency: AdminUrgency; daysLeft: number | null; priority: string | null }>;
  upcoming: Array<{ id: string; title: string; kind: string; category: string; dueDate: string | null; daysLeft: number | null; amount: number | null; urgency: AdminUrgency; recurrenceMonths: number | null; hasFile: boolean; priority: string | null; currency: string }>;
  calendar: Array<{ day: string; due: Array<{ id: string; title: string; kind: string; urgency: AdminUrgency; amount: number | null; currency: string }>; done: Array<{ itemId: string; title: string }> }>;
  subscriptions: { items: Array<{ id: string; title: string; amount: number | null; currency: string; recurrenceMonths: number | null; dueDate: string | null }>; totals: Array<{ currency: string; count: number; monthly: number; yearly: number }> };
  missingFiles: Array<{ id: string; title: string; kind: string }>;
  chest: { days: number; since: string | null; target: number; xp: number; coins: number; claimable: boolean; claimedTotal: number };
  missions: Array<{ key: string; title: string; current: number; target: number; done: boolean }>;
  recentDone: Array<{ itemId: string; title: string; doneAt: string; dueDate: string | null; late: boolean }>;
}

export const toHubMissions = (list: Array<{ key: string; title: string; current: number; target: number; done: boolean }>, description: string): HubMission[] =>
  list.map((m) => ({ key: m.key, title: m.title, description, current: m.current, target: m.target, done: m.done }) as HubMission);

export const routineHubService = {
  habits: () => api.get<HabitsHub>("/habits-hub"),
  habitsDay: (day: string) => api.get<Array<{ id: string; name: string; icon: string | null; scheduled: boolean; cycle: boolean; done: boolean; count: number; target: number; unit: string | null }>>(`/habits-hub/day/${day}`),
  habitsPlan: () => api.get<{ day: string; suggestions: Array<{ habitId: string; name: string; at: string | null }>; basis: string }>("/habits-hub/plan"),
  habitMeta: (id: string, input: HabitMetaInput) => api.patch<{ ok: true }>(`/habits-hub/${id}/meta`, input),
  library: () => api.get<LibraryHub>("/library-hub"),
  addSession: (input: SessionInput) => api.post<{ id: string; currentPage: number }>("/library-hub/sessions", input),
  updateSession: (id: string, input: Omit<SessionInput, "bookId">) => api.patch<{ currentPage: number }>(`/library-hub/sessions/${id}`, input),
  deleteSession: (id: string) => api.delete<{ currentPage: number }>(`/library-hub/sessions/${id}`),
  sessionCard: (id: string, card: { front: string; back: string }) => api.post<{ deckId: string }>(`/library-hub/sessions/${id}/card`, card),
  favorite: (id: string, favorite: boolean) => api.put<{ ok: true }>(`/library-hub/books/${id}/favorite`, { favorite }),
  createTrail: (input: TrailInput) => api.post<{ id: string }>("/library-hub/trails", input),
  updateTrail: (id: string, input: TrailInput) => api.put<{ id: string }>(`/library-hub/trails/${id}`, input),
  deleteTrail: (id: string) => api.delete<{ ok: true }>(`/library-hub/trails/${id}`),
  admin: (month?: string) => api.get<AdminHub>(`/life-admin-hub${month ? `?month=${month}` : ""}`),
  adminMeta: (id: string, input: { priority?: "Baixa" | "Média" | "Alta" | null; currency?: string }) => api.patch<{ ok: true }>(`/life-admin-hub/items/${id}/meta`, input),
  reopen: (id: string) => api.post<{ ok: true }>(`/life-admin-hub/items/${id}/reopen`, {}),
  claimChest: () => api.post<{ awarded: boolean; xp: number; coins: number }>("/life-admin-hub/chest/claim", {}),
};
