import { api } from "./api";

/**
 * Xadrez (Lichess), Advent of Code, Expedições (Overpass), Bestiário
 * (iNaturalist) e Leitura em Áudio (Podcast Index). Tipos espelham os services
 * da API; credenciais só vão nos POST/PUT de conexão e nunca voltam.
 */

type SyncStatus = "ok" | "parcial" | "erro" | null;
type SyncFail = { ok: false; error: string };

/* ───────── Xadrez ───────── */
export interface ChessDaily { id: string; rating: number | null; plays: number | null; themes: string[]; url: string; imageUrl: string | null; perf: string | null; solved: boolean }
export interface ChessGame { id: string; url: string; playedAt: string; speed: string | null; rated: boolean; result: "vitoria" | "derrota" | "empate"; color: string | null; ratingDiff: number | null; myRating: number | null; opponent: string | null; opponentRating: number | null; opening: string | null }
export type ChessRules = { win: number; winCoins: number; winCap: number; draw: number; puzzle: number; puzzleCap: number; daily: number; record: number; recordCoins: number };
export type ChessOverview =
  | { connected: false; daily: ChessDaily | null; rules: ChessRules }
  | {
      connected: true;
      account: { username: string; hasToken: boolean; url: string; lastSyncAt: string | null; lastSyncStatus: SyncStatus; lastSyncError: string | null };
      perfs: Array<{ key: string; rating: number | null; games: number; prog: number; provisional: boolean }>;
      peak: Record<string, number>;
      lifetime: { all: number; win: number; loss: number; draw: number };
      tracked: { win: number; loss: number; draw: number };
      history: Array<{ name: string; points: Array<{ day: string; rating: number }> }>;
      games: ChessGame[];
      puzzles: { total: number; solved: number; today: number };
      daily: ChessDaily | null;
      xpTotal: number;
      rules: ChessRules;
    };

/* ───────── Advent of Code ───────── */
export type AocRules = { part1: number; part1Coins: number; part2: number; part2Coins: number; boss: number; full: number; fullCoins: number };
interface AocBase { year: number; latestYear: number; years: number[]; days: number; nextEvent: { year: number; startsAt: string; days: number }; rules: AocRules }
export type AocOverview =
  | (AocBase & { connected: false })
  | (AocBase & {
      connected: true;
      account: { leaderboardId: string; memberId: string | null; lastSyncAt: string | null; lastSyncStatus: "ok" | "erro" | null; lastSyncError: string | null };
      syncedAt: string | null;
      grid: Array<{ day: number; unlockAt: string; open: boolean; boss: boolean; part1: string | null; part2: string | null }>;
      myStars: number;
      maxStars: number;
      leaderboard: Array<{ rank: number; id: string; name: string; stars: number; score: number; me: boolean }>;
      members: Array<{ id: string; name: string }>;
      starsByYear: Array<{ year: number; stars: number; max: number }>;
      xpTotal: number;
    });

/* ───────── Expedições ───────── */
export type ExpeditionKind = "parque" | "museu" | "biblioteca" | "mirante" | "trilha" | "cultura";
export interface ExpeditionMission { id: string; osmRef: string; name: string; kind: ExpeditionKind; category: string; lat: number; lng: number; distanceM: number | null; status: "ativa" | "concluida"; completedAt: string | null; mapUrl: string }
interface ExpBase { settings: { radiusM: number; centerPlaceId: string | null; kinds: ExpeditionKind[] }; kinds: ExpeditionKind[]; centerOptions: Array<{ id: string; name: string }>; rules: { mission: number; missionCoins: number; week: number; weekCoins: number; perWeek: number; swapsPerWeek: number; nearMeters: number }; week: string }
export type ExpeditionOverview =
  | (ExpBase & { configured: false })
  | (ExpBase & { configured: true; center: { label: string; source: "atlas" | "cidade" }; unavailable: string | null; justEarned: number; missions: ExpeditionMission[]; swapsLeft: number; completedTotal: number; xpTotal: number });

/* ───────── Bestiário ───────── */
export type Rarity = "comum" | "incomum" | "rara" | "epica" | "lendaria";
export interface BestiarySpecies { taxonId: number; name: string; commonName: string | null; rank: string | null; iconic: string | null; globalCount: number | null; rarity: Rarity; myCount: number; photoUrl: string | null; url: string; firstSeenAt: string }
export interface BestiaryOverview {
  connected: boolean;
  account: { login: string; observations: number; url: string; lastSyncAt: string | null; lastSyncStatus: SyncStatus; lastSyncError: string | null } | null;
  species: BestiarySpecies[];
  total: number;
  byRarity: Record<Rarity, number>;
  groups: Array<{ iconic: string; count: number }>;
  xpTotal: number;
  rules: { species: number; coins: number; dailyCap: number; bonus: Record<Rarity, number> };
}

/* ───────── Leitura em Áudio ───────── */
export interface PodcastEpisode { episodeId: number; feedId: number; title: string; podcastTitle: string | null; publishedAt: string | null; durationSeconds: number | null; audioUrl: string | null; imageUrl: string | null; link: string | null; listened: boolean }
export interface PodcastFeed { feedId: number; title: string; author: string | null; imageUrl: string | null; siteUrl: string | null; episodes?: number | null; language?: string | null; following?: boolean }
export interface PodcastOverview {
  key: { source: "pessoal" | "servidor" | null; masked: string | null };
  follows: PodcastFeed[];
  episodes: PodcastEpisode[];
  recent: Array<{ episodeId: number; title: string; podcastTitle: string | null; durationSeconds: number | null; day: string }>;
  unavailable: string | null;
  stats: { episodes: number; seconds: number; todaySeconds: number; month: number; podcasts: number };
  goal: number | null;
  xpTotal: number;
  rules: { episode: number; block: number; blockMinutes: number; maxBlocks: number; goal: number; goalCoins: number };
}

const enc = encodeURIComponent;
export const adventuresMore = {
  chess: {
    overview: () => api.get<ChessOverview>("/chess"),
    connect: (p: { username: string; token?: string | null }) => api.post<{ username: string; hasToken: boolean; sync: { ok: true; games: number; xp: number; records: string[] } | SyncFail }>("/chess/connect", p),
    sync: () => api.post<{ ok: true; games: number; xp: number; records: string[] }>("/chess/sync"),
    disconnect: () => api.delete<void>("/chess/connect"),
  },
  aoc: {
    overview: (year?: number) => api.get<AocOverview>(`/aoc${year ? `?year=${year}` : ""}`),
    connect: (p: { session: string; leaderboardId: string }) => api.post<{ year: number; members: number; memberId: string | null }>("/aoc/connect", p),
    sync: (year: number) => api.post<{ ok: true; year: number; xp: number; newStars: number }>("/aoc/sync", { year }),
    member: (memberId: string) => api.put<{ ok: true }>("/aoc/member", { memberId }),
    disconnect: () => api.delete<void>("/aoc/connect"),
  },
  expeditions: {
    overview: () => api.get<ExpeditionOverview>("/expeditions"),
    settings: (p: { radiusM?: number; centerPlaceId?: string | null; kinds?: ExpeditionKind[] }) => api.put<unknown>("/expeditions/settings", p),
    swap: (id: string) => api.post<ExpeditionOverview>(`/expeditions/${enc(id)}/swap`),
  },
  bestiary: {
    overview: () => api.get<BestiaryOverview>("/bestiary"),
    connect: (login: string) => api.post<{ login: string; sync: { ok: true; species: number; xp: number; newSpecies: number } | SyncFail }>("/bestiary/connect", { login }),
    sync: () => api.post<{ ok: true; species: number; xp: number; newSpecies: number }>("/bestiary/sync"),
    disconnect: () => api.delete<void>("/bestiary/connect"),
  },
  podcasts: {
    overview: () => api.get<PodcastOverview>("/podcasts"),
    keys: (key: string, secret: string) => api.put<{ ok: true }>("/podcasts/keys", { key, secret }),
    removeKeys: () => api.delete<void>("/podcasts/keys"),
    search: (q: string) => api.get<PodcastFeed[]>(`/podcasts/search?q=${enc(q)}`),
    follow: (feedId: number) => api.post<PodcastFeed>("/podcasts/follows", { feedId }),
    unfollow: (feedId: number) => api.delete<void>(`/podcasts/follows/${feedId}`),
    listen: (episodeId: number) => api.post<{ xp: number; goalHit: boolean }>("/podcasts/listens", { episodeId }),
    unlisten: (episodeId: number) => api.delete<void>(`/podcasts/listens/${episodeId}`),
    goal: (goal: number | null) => api.put<{ goal: number | null }>("/podcasts/goal", { goal }),
  },
};
