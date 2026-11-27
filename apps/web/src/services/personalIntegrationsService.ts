import { api } from "./api";

/**
 * Integrações pessoais por tela — tipos espelham os services da API
 * (zoteroService, radarService, wakatimeService, clickupService,
 * nutritionService, holidayService). Chaves vão só no POST de conexão
 * e nunca voltam do servidor.
 */

type SyncStatus = "ok" | "parcial" | "erro" | null;
type SyncFail = { ok: false; error: string };

/* ───────── Zotero ───────── */
export interface ZoteroOverview {
  connected: boolean;
  connection: { username: string | null; collectionKey: string | null; lastSyncAt: string | null; lastSyncStatus: SyncStatus; lastSyncError: string | null; neverCompleted: boolean } | null;
  stats: { linked: number; withPdf: number; removed: number };
  collections: Array<{ key: string; name: string; parentKey: string | null }>;
  flags: Array<{ paperId: string; itemKey: string; hasPdf: boolean; removed: boolean }>;
}
export interface ZoteroSync {
  ok: true;
  done: boolean;
  created: number;
  linked: number;
  xp: number;
  removed: number;
  remaining: number | null;
}

/* ───────── Radar ───────── */
export interface RadarItem {
  key: string;
  source: "arxiv" | "openalex";
  topic: string | null;
  title: string;
  authors: string[];
  published: string | null;
  venue: string | null;
  doi: string | null;
  arxivId: string | null;
  abstract: string | null;
  url: string | null;
  pdfUrl: string | null;
  citedBy: number | null;
  status: "novo" | "salvo" | "dispensado";
  paperId: string | null;
}
export interface RadarOverview {
  week: string;
  weekEnd: string;
  topics: Array<{ id: string; query: string }>;
  maxTopics: number;
  items: RadarItem[];
  counts: { total: number; novo: number; salvo: number; dispensado: number };
  scan: { at: string; found: number; errors: string[] } | null;
  needsScan: boolean;
  triagedThisWeek: boolean;
  triagedWeeks: number;
  weekStreak: number;
  savedTotal: number;
  reward: { xp: number; coins: number };
}

/* ───────── WakaTime ───────── */
export interface WakaShare {
  name: string;
  seconds: number;
  pct: number;
}
export interface WakaOverview {
  connected: boolean;
  connection: { username: string | null; lastSyncAt: string | null; lastSyncStatus: "ok" | "erro" | null; lastSyncError: string | null; coverageFrom: string | null } | null;
  today: { seconds: number; blocks: number };
  weekSeconds: number;
  totalSeconds: number;
  activeDays: number;
  bestDaySeconds: number;
  xpTotal: number;
  streak: number;
  series: Array<{ day: string; seconds: number | null }>;
  languages: WakaShare[];
  projects: WakaShare[];
  editors: WakaShare[];
  rules: { perBlock: number; coinsPerBlock: number; blockMinutes: number; maxBlocks: number };
}

/* ───────── ClickUp ───────── */
export interface ClickUpOverview {
  connected: boolean;
  connection: {
    username: string | null;
    team: { id: string; name: string } | null;
    project: { id: string; name: string } | null;
    lastSyncAt: string | null;
    lastSyncStatus: SyncStatus;
    lastSyncError: string | null;
  } | null;
  counts: { open: number; doing: number; overdue: number; dueWeek: number; doneTotal: number; doneWeek: number };
  xpTotal: number;
  today: string;
  upcoming: Array<{ id: string; title: string; status: string; priority: string; dueDate: string | null; url: string | null; list: string | null; clickupStatus: string | null }>;
  recentDone: Array<{ id: string; title: string; completedAt: string; url: string | null }>;
}

/* ───────── Cozinha do Herói ───────── */
export type MealType = "cafe" | "almoco" | "lanche" | "jantar" | "ceia";
export interface FoodProduct {
  barcode: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  quantity: string | null;
  servingGrams: number | null;
  servingLabel: string | null;
  per100: { kcal: number | null; protein: number | null; carbs: number | null; fat: number | null };
}
export interface Meal {
  id: string;
  day: string;
  eatenAt: string;
  mealType: MealType;
  barcode: string | null;
  name: string;
  brand: string | null;
  grams: number | null;
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  source: "openfoodfacts" | "manual";
  imageUrl: string | null;
}
export interface NutritionOverview {
  day: string;
  today: string;
  goals: { kcalGoal: number | null; proteinGoalG: number | null };
  totals: { kcal: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null; incomplete: boolean };
  meals: Meal[];
  history: Array<{ day: string; meals: number; kcal: number | null; protein: number | null; incomplete: boolean }>;
  recent: Array<{ barcode: string | null; name: string; brand: string | null; grams: number | null; kcal: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null; imageUrl: string | null; uses: number }>;
  rewards: { xpToday: number; mealXp: number; mealDailyCap: number; proteinXp: number; proteinGoalDays: number };
  streak: number;
}
export interface MealInput {
  mealType: MealType;
  day?: string;
  barcode?: string | null;
  grams?: number | null;
  name?: string | null;
  brand?: string | null;
  kcal?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
}

/* ───────── Feriados ───────── */
export interface Holiday {
  date: string;
  name: string;
  type: "nacional" | "local";
  id?: string;
}
export interface HolidaysResponse {
  year: number;
  items: Holiday[];
  unavailableYears: number[];
  prefs: { council: boolean; raidTruce: boolean };
}

export const personalIntegrations = {
  zotero: {
    overview: () => api.get<ZoteroOverview>("/zotero"),
    connect: (key: string) => api.post<{ username: string | null; sync: ZoteroSync | SyncFail }>("/zotero/connect", { key }),
    sync: () => api.post<ZoteroSync>("/zotero/sync"),
    collection: (collectionKey: string | null) => api.put<{ ok: true }>("/zotero/collection", { collectionKey }),
    disconnect: () => api.delete<void>("/zotero/connect"),
  },
  radar: {
    overview: () => api.get<RadarOverview>("/radar"),
    addTopic: (query: string) => api.post<{ id: string; query: string }>("/radar/topics", { query }),
    removeTopic: (id: string) => api.delete<void>(`/radar/topics/${encodeURIComponent(id)}`),
    scan: (force?: boolean) => api.post<{ week: string; found: number; skipped: boolean; errors: string[] }>("/radar/scan", force ? { force } : {}),
    decide: (key: string, decision: "salvar" | "dispensar" | "desfazer") => api.post<{ status: RadarItem["status"]; paperId: string | null; xp: number; triaged: boolean }>("/radar/items/decide", { key, decision }),
  },
  waka: {
    overview: () => api.get<WakaOverview>("/wakatime"),
    connect: (key: string) => api.post<{ username: string | null; sync: { ok: true; days: number; xp: number } | SyncFail }>("/wakatime/connect", { key }),
    sync: () => api.post<{ ok: true; days: number; xp: number }>("/wakatime/sync"),
    disconnect: () => api.delete<void>("/wakatime/connect"),
  },
  clickup: {
    overview: () => api.get<ClickUpOverview>("/clickup"),
    teams: () => api.get<Array<{ id: string; name: string }>>("/clickup/teams"),
    connect: (key: string) => api.post<{ username: string | null; team: { id: string; name: string }; sync: { ok: true; created: number; updated: number; completed: number; complete: boolean } | SyncFail }>("/clickup/connect", { key }),
    sync: () => api.post<{ ok: true; created: number; updated: number; completed: number; complete: boolean }>("/clickup/sync"),
    settings: (body: { teamId?: string; projectId?: string | null }) => api.put<ClickUpOverview>("/clickup/settings", body),
    disconnect: () => api.delete<void>("/clickup/connect"),
  },
  nutrition: {
    overview: (day?: string) => api.get<NutritionOverview>(`/nutrition${day ? `?day=${day}` : ""}`),
    product: (barcode: string) => api.get<FoodProduct>(`/nutrition/product/${encodeURIComponent(barcode)}`),
    addMeal: (m: MealInput) => api.post<{ id: string; xp: number; proteinGoalHit: boolean }>("/nutrition/meals", m),
    removeMeal: (id: string) => api.delete<void>(`/nutrition/meals/${encodeURIComponent(id)}`),
    settings: (s: { kcalGoal: number | null; proteinGoalG: number | null }) => api.put<{ kcalGoal: number | null; proteinGoalG: number | null }>("/nutrition/settings", s),
  },
  holidays: {
    list: (year: number) => api.get<HolidaysResponse>(`/holidays?year=${year}`),
    prefs: (p: { council?: boolean; raidTruce?: boolean }) => api.put<HolidaysResponse["prefs"]>("/holidays/prefs", p),
    addLocal: (date: string, name: string) => api.post<Holiday>("/holidays/local", { date, name }),
    removeLocal: (id: string) => api.delete<void>(`/holidays/local/${encodeURIComponent(id)}`),
  },
};
