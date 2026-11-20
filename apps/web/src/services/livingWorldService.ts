import { api } from "./api";
import type { AdvisorAnswer } from "./moduleHubService";

/** Meu Mundo (/api/world) — tipos espelham livingWorldService.ts da API. */
export type WorldRoomKey = "biblioteca" | "escritorio" | "academia" | "guilda" | "casa" | "jardim" | "praca";

export interface WorldSettings {
  quality: "low" | "medium" | "high";
  effects: 0 | 1 | 2;
  animSpeed: 0.5 | 1 | 1.5;
  sound: boolean;
  autonomous: boolean;
  showNames: boolean;
  showIndicators: boolean;
  followAvatar: boolean;
}

export interface WorldAvatar {
  name: string;
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  x: number;
  y: number;
}

export interface AgentRun {
  id: string;
  status: "running" | "done" | "failed";
  question: string | null;
  result: AdvisorAnswer | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface WorldAgent {
  key: string;
  name: string;
  specialty: string;
  room: WorldRoomKey;
  color: string;
  defaultQuestion: string;
  lastRun: AgentRun | null;
  completedRuns: number;
}

export interface WorldMission {
  id: string;
  title: string;
  status: string;
  priority: string;
  difficulty: string | null;
  dueDate: string | null;
  overdue: boolean;
  progress: { done: number; total: number } | null;
  reward: { xp: number; coins: number } | null;
}

export interface WorldHabit {
  id: string;
  name: string;
  icon: string | null;
  frequency: string;
  target: number;
  todayCount: number;
  doneToday: boolean;
  streak: number;
  stage: 0 | 1 | 2 | 3 | 4;
  pendingToday: boolean;
}

export interface WorldTimelineEvent {
  id: string;
  category: string;
  title: string;
  detail: string | null;
  at: string;
  source: string;
  link: string | null;
  xp: number | null;
}

export interface WorldDecorItem {
  key: string;
  name: string;
  type: string;
  rarity: string;
  art: string;
  artSet: "items" | "rewards" | "codex";
  quantity: number;
}

export interface WorldDecorObject {
  slotKey: string;
  room: string;
  itemKey: string;
  name: string;
  art: string;
  artSet: "items" | "rewards" | "codex";
}

export interface WorldState {
  today: string;
  timezone: string;
  version: number;
  settings: WorldSettings;
  avatar: WorldAvatar;
  profile: { level: number; totalXp: number; xpIntoLevel: number; xpForNextLevel: number; xpToday: number; coins: number; streakDays: number; title?: string };
  activity: {
    kind: "mission";
    taskId: string;
    title: string;
    category: string;
    room: WorldRoomKey;
    since: string;
    progress: { done: number; total: number } | null;
    reward: { xp: number; coins: number } | null;
  } | null;
  habits: WorldHabit[];
  missions: { open: WorldMission[]; doneToday: Array<{ id: string; title: string; reward: { xp: number; coins: number } | null }> };
  rooms: {
    library: { studyMinutesToday: number; readingPagesToday: number; readingMinutesToday: number; currentBook: { title: string; author: string | null } | null };
    gym: { today: Array<{ name: string; minutes: number | null }>; week: { count: number; minutes: number } };
    home: { journalWordsToday: number; waterMl: number; sleepMinutes: number | null; mood: { mood: number; energy: number } | null };
  };
  agents: WorldAgent[];
  decor: { slots: Array<{ key: string; room: WorldRoomKey; x: number; y: number }>; objects: WorldDecorObject[] };
  timeline: WorldTimelineEvent[];
  localHour: number;
}

export const livingWorldService = {
  get: () => api.get<WorldState>("/world"),
  saveSettings: (patch: Partial<WorldSettings>) => api.put<WorldSettings>("/world/settings", patch),
  saveAvatar: (patch: Partial<Omit<WorldAvatar, "name">> & { name?: string | null }) => api.put<WorldAvatar>("/world/avatar", patch),
  events: (q: { category?: string | null; before?: string | null; limit?: number }) => {
    const p = new URLSearchParams();
    if (q.category) p.set("category", q.category);
    if (q.before) p.set("before", q.before);
    p.set("limit", String(q.limit ?? 20));
    return api.get<{ events: WorldTimelineEvent[]; nextBefore: string | null }>(`/world/events?${p.toString()}`);
  },
  decorItems: () => api.get<WorldDecorItem[]>("/world/decor-items"),
  agentRuns: (key: string) => api.get<AgentRun[]>(`/world/agents/${key}/runs`),
  runAgent: (key: string, question: string | null) => api.post<AgentRun>(`/world/agents/${key}/run`, { question }),
  placeDecor: (slot: string, itemKey: string) => api.put<WorldState["decor"]["objects"]>(`/world/decor/${slot}`, { itemKey }),
  removeDecor: (slot: string) => api.delete<WorldState["decor"]["objects"]>(`/world/decor/${slot}`),
};
