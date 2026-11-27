import { api } from "./api";

/** Raid, Companheiro, Atlas e Steam — tipos espelham os services da API. */

export type RaidFamily = "tarefas" | "habitos" | "leitura" | "treinos" | "estudo" | "codigo" | "exploracao";
export type RaidState = "nao_iniciada" | "em_batalha" | "derrotado" | "encerrada";
export type RaidDifficulty = "leve" | "normal" | "desafiador";

export interface RaidOverview {
  today: string;
  state: RaidState;
  boss: { key: string; name: string; title: string; lore: string; level: number };
  raid: { id: string; weekStart: string; weekEnd: string; endsAt: string; maxHp: number; hp: number; difficulty: RaidDifficulty; status: string; defeatedAt: string | null; rewarded: boolean; baselineWeeklyAvg: number };
  damage: { total: number; byFamily: Partial<Record<RaidFamily, number>>; strikes: number };
  recentStrikes: Array<{ id: string; family: RaidFamily; kind: string; at: string; label: string; damage: number; afterDefeat: boolean }>;
  healing: { total: number; days: Array<{ day: string; amount: number }>; enabled: boolean; capPct: number; perDayPct: number };
  weekDays: Array<{ day: string; damage: number; heal: number; rest: boolean; future: boolean; holiday?: string | null }>;
  effect: { key: string; name: string; description: string; pct: number; families: RaidFamily[] };
  objectives: Array<{ key: RaidFamily; label: string; target: number; done: number; complete: boolean }>;
  rewards: { xp: number; coins: number; trophy: string; monument: boolean };
  settings: { difficulty: RaidDifficulty; healingEnabled: boolean; restWeekdays: number[] };
  damageTable: Record<string, number>;
  history: Array<{ id: string; weekStart: string; weekEnd: string; boss: string; maxHp: number; difficulty: string; status: string; defeatedAt: string | null; finalDamage: number | null }>;
}

export type PetColor = "cinza" | "marrom" | "branco" | "preto" | "dourado";
export type PetMood = "feliz" | "focado" | "cansado" | "faminto" | "entediado" | "descansando";
export type CareAction = "alimentar" | "hidratar" | "brincar" | "descansar" | "carinho";
export type PetSlot = "pescoco" | "cabeca" | "costas";
export interface CompanionData {
  adopted: boolean;
  today: string;
  stages: Array<{ key: string; name: string; minXp: number; benefits: readonly string[] }>;
  careActions: CareAction[];
  companion?: {
    name: string;
    species: string;
    color: PetColor;
    showInWorld: boolean;
    adoptedAt: string;
    xp: number;
    stage: { index: number; key: string; name: string; benefits: string[]; next: { name: string; minXp: number } | null; progressPct: number };
    status: { fome: number; hidratacao: number; energia: number; bemEstar: number; vinculo: number; mood: PetMood };
    traits: Array<{ key: string; name: string; hint: string; count: number; active: boolean; strength: number }>;
    accessories: Array<{ key: string; name: string; slot: PetSlot; unlocked: boolean }>;
    equipped: Partial<Record<PetSlot, string | null>>;
    appearance: Record<PetSlot, string | null>;
    care: { today: string[]; cooldowns: Record<CareAction, string | null>; xpActionsLeft: number };
    activeDays: number;
  };
  recent?: Array<{ kind: string; family: RaidFamily; label: string; at: string }>;
  careLog?: Array<{ action: string; at: string }>;
}

export interface AtlasPlace {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  favorite: boolean;
  visits: number;
  firstVisitAt: string | null;
  lastVisitAt: string | null;
}
export interface AtlasOverview {
  settings: { locationEnabled: boolean; preciseLocation: boolean };
  cellDeg: number;
  cells: string[];
  places: AtlasPlace[];
  routes: Array<{ id: string; name: string; source: string; points: Array<[number, number]>; distanceKm: number | null; startedAt: string }>;
  recent: Array<{ id: string; placeId: string; name: string; category: string; method: string; visitedAt: string; xp: number; where: string }>;
  progress: {
    places: number;
    neighborhoods: number;
    cities: number;
    states: number;
    countries: number;
    routes: number;
    routeKm: number;
    cells: number;
    areaKm2: number;
    region: { key: string; city: string; state: string | null; revealedCells: number; totalCells: number; pct: number; bbox: [number, number, number, number] } | null;
    regions: Array<{ key: string; label: string; places: number }>;
  };
  achievements: Array<{ code: string; title: string; description: string; threshold: number; unlockedAt: string | null }>;
  xpRules: Record<string, number>;
}
export interface PlaceSearchResult {
  osmRef: string;
  name: string;
  displayName: string;
  lat: number;
  lng: number;
  category: string;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  countryCode: string | null;
}

export interface SteamOverview {
  configured: boolean;
  today: string;
  account: {
    steamId: string;
    personaName: string | null;
    avatarUrl: string | null;
    profileUrl: string | null;
    publicProfile: boolean;
    connectedAt: string;
    lastSyncAt: string | null;
    lastError: string | null;
    settings: { weeklyLimitHours: number | null; achievementXp: boolean };
  } | null;
  totals?: { games: number; playedGames: number; totalMin: number; last14Min: number; achievements: number };
  period?: { rangeDays: number; from: string; to: string; gameMin: number; coveredDays: number; prevGameMin: number | null; estimated: boolean; note: string };
  daily?: Array<{ day: string; minutes: number | null; spanDays: number; productiveMin: number }>;
  balance?: { gameMin: number; productiveMin: number; productiveSources: string; weekGameMin: number; weeklyLimitHours: number | null };
  games?: SteamGame[];
  achievementSync?: { playedGames: number; withAchievements: number; noAchievements: number; privateGames: number; errors: number; pending: number; lastError: string | null };
  recentAchievements?: Array<{ appid: number; apiName: string; name: string; description: string | null; icon: string | null; unlockedAt: string; game: string | null; pinned: boolean }>;
  pinnedTrophies?: number;
  xpRules?: { perAchievement: number; dailyCap: number };
}

export type SteamAchStatus = "ok" | "sem_conquistas" | "privado" | "erro" | "pendente";
export interface SteamGame {
  appid: number;
  name: string;
  icon: string | null;
  header: string;
  totalMin: number;
  recentMin: number;
  lastPlayed: string | null;
  achTotal: number | null;
  achUnlocked: number | null;
  achStatus: SteamAchStatus;
  achError: string | null;
  storeUrl: string;
  launchUrl: string;
}
export interface SteamGameDetail {
  appid: number;
  name: string;
  header: string;
  totalMin: number;
  recentMin: number;
  lastPlayed: string | null;
  storeUrl: string;
  status: string;
  error: string | null;
  achievements: Array<{ apiName: string; name: string; description: string | null; icon: string | null; achieved: boolean; unlockedAt: string | null; globalPct: number | null; hidden: boolean; pinned: boolean }>;
}

export interface AdventureWorld {
  raid: { state: RaidState; hpPct: number; bossName: string; trophies: number } | null;
  companion: { name: string; color: PetColor; stage: number; mood: PetMood; appearance: Record<PetSlot, string | null> } | null;
  atlasPlaces: number;
  steamLastGame: string | null;
}

export const adventuresService = {
  world: () => api.get<AdventureWorld>("/adventures/world"),
  raid: () => api.get<RaidOverview>("/raid"),
  raidSettings: (s: RaidOverview["settings"]) => api.put<RaidOverview["settings"]>("/raid/settings", s),
  raidRestDay: (day: string, rest: boolean) => api.put<{ ok: true }>(`/raid/rest-days/${day}`, { rest }),

  companion: () => api.get<CompanionData>("/companion"),
  adopt: (b: { name: string; color: string }) => api.post<CompanionData>("/companion/adopt", b),
  care: (a: CareAction) => api.post<CompanionData>(`/companion/care/${a}`),
  updateCompanion: (p: { name?: string; color?: string; showInWorld?: boolean; equipped?: Partial<Record<PetSlot, string | null>> }) => api.patch<CompanionData>("/companion", p),

  atlas: (region?: string | null) => api.get<AtlasOverview>(`/atlas${region ? `?region=${encodeURIComponent(region)}` : ""}`),
  searchPlaces: (q: string, near?: { lat: number; lng: number }) =>
    api.get<{ results: PlaceSearchResult[] }>(`/atlas/search?q=${encodeURIComponent(q)}${near ? `&lat=${near.lat}&lng=${near.lng}` : ""}`),
  reverse: (lat: number, lng: number) => api.get<{ place: Omit<PlaceSearchResult, "displayName" | "lat" | "lng"> | null }>(`/atlas/reverse?lat=${lat}&lng=${lng}`),
  checkin: (b: Record<string, unknown>) => api.post<{ checkinId: string; placeId: string; isNewPlace: boolean; revealedCells: number; xp: number }>("/atlas/checkins", b),
  updatePlace: (id: string, p: { name?: string; category?: string; favorite?: boolean }) => api.patch<{ ok: true }>(`/atlas/places/${id}`, p),
  deletePlace: (id: string) => api.delete<{ ok: true }>(`/atlas/places/${id}`),
  saveRoute: (b: { name: string; points: Array<[number, number]>; startedAt: string }) => api.post<{ id: string }>("/atlas/routes", b),
  deleteRoute: (id: string) => api.delete<{ ok: true }>(`/atlas/routes/${id}`),
  atlasSettings: (p: Partial<AtlasOverview["settings"]>) => api.put<AtlasOverview["settings"]>("/atlas/settings", p),
  exportAtlas: () => api.get<unknown>("/atlas/export"),
  deleteAtlasHistory: () => api.delete<{ ok: true }>("/atlas/history", { confirm: "APAGAR" }),

  steam: (range: 7 | 14 | 30) => api.get<SteamOverview>(`/integrations/steam?range=${range}`),
  steamConnect: () => api.get<{ url: string }>("/integrations/steam/connect"),
  steamLink: (profile: string) => api.post<{ ok: true }>("/integrations/steam/link", { profile }),
  steamSync: () => api.post<{ skipped: boolean; games: number; newAchievements: number; pendingAchievements?: number }>("/integrations/steam/sync"),
  steamAchSync: (force = false) => api.post<{ checked: number; newAchievements: number; pending: number }>("/integrations/steam/achievements/sync", { force }),
  steamGame: (appid: number) => api.get<SteamGameDetail>(`/integrations/steam/games/${appid}`),
  steamSettings: (p: Partial<NonNullable<SteamOverview["account"]>["settings"]>) => api.put<{ ok: true }>("/integrations/steam/settings", p),
  steamPin: (appid: number, apiName: string, pin: boolean) => api.post<{ ok: true }>("/integrations/steam/trophies", { appid, apiName, pin }),
  steamDisconnect: (deleteData: boolean) => api.post<{ ok: true }>("/integrations/steam/disconnect", { deleteData }),
};
