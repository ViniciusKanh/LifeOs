import { api } from "./api";

/**
 * APIs públicas gratuitas por tela — tipos espelham os services da API
 * (videoCourseService, airQualityService, hfTrendsService,
 * loreScrollService, skyWindowService, cinemaService, marketThermometerService).
 * Chaves só vão no PUT e nunca voltam: o servidor devolve apenas a origem.
 */

export type PublicApiProvider = "youtube" | "nasa" | "tmdb" | "sptrans";
export interface KeyStatus {
  source: "pessoal" | "servidor" | null;
  masked: string | null;
}

/* ───────── Cursos em Vídeo ───────── */
export interface VideoLesson {
  id: string;
  videoId: string;
  position: number;
  title: string;
  seconds: number | null;
  thumbnailUrl: string | null;
  unavailable: boolean;
  doneAt: string | null;
}
export interface VideoCourse {
  id: string;
  playlistId: string;
  title: string;
  channel: string | null;
  thumbnailUrl: string | null;
  subject: { id: string; name: string } | null;
  status: "ativo" | "concluido" | "arquivado";
  completedAt: string | null;
  syncedAt: string | null;
  total: number;
  done: number;
  totalSeconds: number;
  doneSeconds: number;
  nextLessonId: string | null;
  lessons: VideoLesson[];
}
export interface VideoCoursesOverview {
  key: KeyStatus;
  courses: VideoCourse[];
  subjects: Array<{ id: string; name: string }>;
  today: { lessons: number; seconds: number };
  xpTotal: number;
  stats: { active: number; completed: number; lessonsDone: number; secondsDone: number };
  rules: { lesson: number; lessonCoins: number; dailyLessonCap: number; course: number; courseCoins: number };
}

/* ───────── Ar do Treino ───────── */
export type AqiKey = "bom" | "moderado" | "sensiveis" | "ruim" | "muito_ruim" | "perigoso" | "sem_dado";
export interface AirHour {
  hour: number;
  aqi: number | null;
  pm25: number | null;
  pm10: number | null;
  uv: number | null;
  pollen: number | null;
  level: AqiKey;
}
export interface AirWindow {
  start: number;
  end: number;
  quality: "ouro" | "aceitavel" | "ruim";
  avgAqi: number;
}
export type AirOverview =
  | { configured: false }
  | { configured: true; unavailable: true; message: string }
  | {
      configured: true;
      unavailable?: undefined;
      location: { city: string | null; region: string | null };
      stale: boolean;
      nowHour: number;
      current: (Omit<AirHour, "level"> & { level: { key: AqiKey; label: string }; uvLevel: string | null }) | null;
      uvMax: number | null;
      uvMaxLevel: string | null;
      pollenMax: number | null;
      hours: AirHour[];
      window: AirWindow | null;
      windowTomorrow: AirWindow | null;
      workouts: Array<{ workoutId: string; kind: string; day: string; hour: number; aqi: number | null; outdoor: boolean; eligible: boolean; paid: boolean }>;
      bonus: { count: number; xp: number };
      rules: { bonus: number; coins: number; dailyCap: number; goodAqi: number };
      source: "Open-Meteo";
    };

/* ───────── Papers em Alta ───────── */
export interface HfPaper {
  arxivId: string;
  title: string;
  summary: string | null;
  authors: string[];
  upvotes: number;
  comments: number;
  publishedAt: string | null;
  thumbnail: string | null;
  keywords: string[];
  topics: string[];
  decision: "salvo" | "dispensado" | null;
  paperId: string | null;
}
export interface HfHubItem {
  id: string;
  downloads: number;
  likes: number;
  task: string | null;
  updatedAt: string | null;
  url: string;
}
export interface HfOverview {
  day: string;
  unavailable: string | null;
  topics: string[];
  papers: HfPaper[];
  hub: Array<{ topic: string; models: HfHubItem[]; datasets: HfHubItem[] }>;
  triagedTotal: number;
  xpTotal: number;
  triagedToday: number;
  rules: { triage: number; dailyCap: number };
}

/* ───────── Pergaminho do Dia ───────── */
export interface LoreFact {
  year: number | null;
  text: string;
  pageTitle: string | null;
  pageUrl: string | null;
  thumbUrl: string | null;
  extract?: string | null;
}
export interface LoreOverview {
  day: string;
  lang: "pt" | "en";
  facts: LoreFact[];
  unavailable: string | null;
  readToday: (LoreFact & { day: string }) | null;
  collection: Array<LoreFact & { day: string }>;
  total: number;
  streak: number;
  xpTotal: number;
  rules: { read: number; coins: number; streakBonus: number; streakEvery: number };
}

/* ───────── Vitral do Céu ───────── */
export interface Apod {
  date: string;
  title: string;
  explanation: string;
  mediaType: "image" | "video" | "other";
  url: string | null;
  hdUrl: string | null;
  thumbUrl: string | null;
  copyright: string | null;
  collected: boolean;
}
export interface SkyOverview {
  key: KeyStatus;
  usingDemoKey: boolean;
  unavailable: string | null;
  today: Apod | null;
  recent: Array<{ date: string; title: string; mediaType: Apod["mediaType"]; thumbUrl: string | null; collected: boolean }>;
  album: Array<{ date: string; title: string; mediaType: string | null; thumbUrl: string | null }>;
  albumCount: number;
  xpTotal: number;
  rules: { collect: number; coins: number; milestone: number; milestoneEvery: number; windowDays: number };
}

/* ───────── Sala de Cinema ───────── */
export type CinemaStatus = "quero_ver" | "assistindo" | "visto" | "abandonado";
export interface CinemaItem {
  id: string;
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  originalTitle: string | null;
  year: number | null;
  posterUrl: string | null;
  overview: string | null;
  genres: string[];
  runtimeMinutes: number | null;
  seasons: number | null;
  status: CinemaStatus;
  rating: number | null;
  review: string | null;
  watchedDay: string | null;
}
export interface CinemaSearchResult {
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  originalTitle: string | null;
  year: number | null;
  posterUrl: string | null;
  overview: string | null;
  genres: string[];
  voteAverage: number | null;
  mine: { id: string; status: string } | null;
}
export interface CinemaOverview {
  key: KeyStatus;
  items: CinemaItem[];
  goal: number | null;
  stats: { month: number; watched: number; queue: number; watching: number; avgRating: number | null; movieMinutes: number };
  genres: Array<{ name: string; count: number }>;
  xpTotal: number;
  rules: { watched: number; coins: number; dailyCap: number; monthGoal: number; monthGoalCoins: number };
}

/* ───────── Termômetro do Reino ───────── */
export interface SgsPoint {
  date: string;
  value: number;
}
export type Thermometer =
  | { available: false; message: string }
  | {
      available: true;
      partial: boolean;
      selic: SgsPoint | null;
      cdi: SgsPoint | null;
      ipca12: SgsPoint | null;
      ipcaMonth: SgsPoint | null;
      poupancaMonth: SgsPoint | null;
      poupancaYear: number | null;
      realRate: number | null;
      sim: { cdiGross: number | null; cdiNet: number | null; poupanca: number | null; inflation: number | null };
      history: { selic: SgsPoint[]; ipca12: SgsPoint[] };
      plans: Array<{ id: string; label: string; termDays: number; gamePct: number; cdiSamePeriodPct: number | null }>;
      source: string;
    };

const enc = encodeURIComponent;

export const publicApis = {
  keys: {
    status: () => api.get<Record<PublicApiProvider, KeyStatus>>("/public-keys"),
    save: (provider: PublicApiProvider, key: string) => api.put<KeyStatus>(`/public-keys/${provider}`, { key }),
    remove: (provider: PublicApiProvider) => api.delete<void>(`/public-keys/${provider}`),
  },
  video: {
    overview: () => api.get<VideoCoursesOverview>("/video-courses"),
    enroll: (p: { playlist: string; subjectId?: string | null }) => api.post<{ id: string; title: string; lessons: number }>("/video-courses", p),
    sync: (id: string) => api.post<{ added: number; lessons: number }>(`/video-courses/${enc(id)}/sync`),
    update: (id: string, p: { subjectId?: string | null; archived?: boolean }) => api.patch<{ ok: true }>(`/video-courses/${enc(id)}`, p),
    remove: (id: string) => api.delete<void>(`/video-courses/${enc(id)}`),
    lesson: (id: string, done: boolean) => api.post<{ xp: number; courseCompleted: boolean }>(`/video-courses/lessons/${enc(id)}`, { done }),
  },
  air: { overview: () => api.get<AirOverview>("/air") },
  hf: {
    overview: () => api.get<HfOverview>("/hf"),
    decide: (arxivId: string, decision: "salvar" | "dispensar" | "desfazer") => api.post<{ xp: number; paperId: string | null }>("/hf/decide", { arxivId, decision }),
  },

  lore: {
    overview: () => api.get<LoreOverview>("/lore"),
    read: (index: number) => api.post<{ xp: number; streak: number }>("/lore/read", { index }),
  },
  sky: {
    overview: () => api.get<SkyOverview>("/sky"),
    collect: (date: string) => api.post<{ xp: number; albumCount: number }>("/sky/collect", { date }),
  },
  cinema: {
    overview: () => api.get<CinemaOverview>("/cinema"),
    search: (q: string) => api.get<CinemaSearchResult[]>(`/cinema/search?q=${enc(q)}`),
    trending: () => api.get<CinemaSearchResult[]>("/cinema/trending"),
    add: (p: { mediaType: "movie" | "tv"; tmdbId: number; status?: "quero_ver" | "assistindo" | "visto" }) => api.post<{ id: string; xp: number }>("/cinema/items", p),
    update: (id: string, p: { status?: CinemaStatus; rating?: number | null; review?: string | null; watchedDay?: string | null }) => api.patch<{ xp: number; monthGoal: boolean }>(`/cinema/items/${enc(id)}`, p),
    remove: (id: string) => api.delete<void>(`/cinema/items/${enc(id)}`),
    goal: (goal: number | null) => api.put<{ goal: number | null }>("/cinema/goal", { goal }),
  },
  thermometer: { get: () => api.get<Thermometer>("/thermometer") },
};
