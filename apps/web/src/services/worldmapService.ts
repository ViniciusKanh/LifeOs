import { api } from "./api";

/** Espelho de /api/worldmap (Mapa do Mundo). Tudo derivado do XP real do usuário. */
export type RegionKey = "estudos" | "trabalho" | "saude" | "financas" | "mente" | "encruzilhada";

export interface RegionNextStep {
  kind: "goal" | "task" | "life_admin" | "journal" | "contract";
  label: string;
  detail: string;
  href: string;
}

export interface RegionActivity {
  activeDays30: number;
  windowDays: number;
  items: Array<{ label: string; count: number }>;
}

export interface WorldRegion {
  key: RegionKey;
  name: string;
  description: string;
  href: string;
  unlockHint: string;
  xp: number;
  level: number;
  levelStartXp: number;
  nextLevelXp: number;
  progressPct: number;
  last30: number;
  prev30: number;
  trendPct: number | null;
  events: number;
  topSources: Array<{ source: string; label: string; xp: number }>;
  lastFeat: { label: string | null; xp: number; dayKey: string } | null;
  activity: RegionActivity | null;
  nextStep: RegionNextStep | null;
  fogged: boolean;
}

export interface WorldMap {
  regions: WorldRegion[];
  totalXp: number;
  hasData: boolean;
  today: string;
  rules: { levelCurve: string; trendWindowDays: number };
}

export const worldmapService = {
  get: () => api.get<WorldMap>("/worldmap"),
};
