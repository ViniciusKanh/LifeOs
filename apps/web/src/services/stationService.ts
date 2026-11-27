import { api } from "./api";
import type { KeyStatus } from "./publicApisService";

/** Espelho de /api/transit (Estação das Carruagens — apps/api/src/services/transitService.ts). */

export type PassSource = "programado" | "ao vivo";
export interface LineChip { line: string; headsign: string | null; color: string | null; textColor: string | null; routeType: number }
export interface Pass extends LineChip {
  stopId: number;
  tripId: string | null;
  atSec: number;
  at: string;
  inMinutes: number;
  headwayMin: number | null;
  source: PassSource;
  accessible: boolean;
}
export interface BoardPass extends Pass {
  stopName: string;
}
export interface SavedStop {
  id: string;
  code: number;
  name: string;
  address: string | null;
  walk: number;
  lat: number | null;
  lon: number | null;
  lines: string[];
  linesHere: LineChip[];
  passes: Pass[];
}
export interface JourneyPlan {
  pass: { line: string; headsign: string | null; at: string; inMinutes: number; source: PassSource; headwayMin: number | null; color: string | null; textColor: string | null };
  leaveInSeconds: number;
  leaveAt: string;
  arriveAt: string;
  fitsEvent: boolean | null;
  slackMinutes: number | null;
  next: { at: string; leaveAt: string; source: PassSource } | null;
}
export interface Journey {
  id: string;
  name: string;
  originLabel: string;
  originLat: number;
  originLon: number;
  destLabel: string;
  destLat: number;
  destLon: number;
  boardStopId: number;
  boardSeq: number;
  alightStopId: number;
  alightSeq: number;
  tripId: string;
  walkTo: number;
  walkFrom: number;
  walkEstimated: boolean;
  ride: number;
  primary: boolean;
  line: string;
  headsign: string | null;
  color: string | null;
  textColor: string | null;
  routeType: number;
  boardName: string;
  boardLat: number | null;
  boardLon: number | null;
  alightName: string;
  alightLat: number | null;
  alightLon: number | null;
  plan: JourneyPlan | null;
  path: Array<[number, number]>;
}
export interface FeedStatus {
  status: "vazio" | "importando" | "pronto" | "erro";
  version: string | null;
  importedAt: string | null;
  counts: Record<string, number>;
  error: string | null;
  nextStep: number;
  sourceUrl: string;
  ready: boolean;
}
export interface StationOverview {
  clock: { dayKey: string; time: string; nowSec: number; weekday: string; holiday: string | null };
  feed: FeedStatus;
  live: { key: KeyStatus; enabled: boolean; ok: boolean; error: string | null };
  event: { id: string; title: string; startsAt: string; minutesTo: number } | null;
  stops: SavedStop[];
  journeys: Journey[];
  board: BoardPass[];
  today: { leftAt: string; onTime: boolean; line: string | null; eventTitle: string | null } | null;
  stats: {
    onTimeTotal: number;
    week: Array<{ day: string; onTime: boolean | null }>;
    log: Array<{ day: string; line: string | null; leftAt: string; onTime: boolean; eventTitle: string | null; source: string | null }>;
  };
  places: Array<{ id: string; label: string; category: string; lat: number; lon: number }>;
  rules: { onTime: number; coins: number; bufferMinutes: number; graceMinutes: number };
}
export interface Place { label: string; lat: number; lon: number }
export interface StopResult { code: number; name: string; address: string | null; lat: number | null; lon: number | null; lines: LineChip[]; meters?: number; walkMinutes?: number }
export interface RouteOption extends LineChip {
  tripId: string;
  longName: string | null;
  board: { stopId: number; seq: number; name: string; lat: number; lon: number };
  alight: { stopId: number; seq: number; name: string; lat: number; lon: number };
  walkTo: number;
  walkFrom: number;
  wait: number;
  ride: number;
  total: number;
  busAt: string;
  arriveAt: string;
  headwayMin: number | null;
  walkEstimated: boolean;
  path: Array<[number, number]>;
}
export interface RoutePlan {
  from: Place;
  to: Place;
  options: RouteOption[];
  walkOnlyMinutes: number;
  closeEnough: boolean;
  clock: string;
}

const enc = encodeURIComponent;
export const stationService = {
  overview: () => api.get<StationOverview>("/transit"),
  search: (q: string) => api.get<StopResult[]>(`/transit/stops/search?q=${enc(q)}`),
  near: (lat: number, lon: number) => api.get<StopResult[]>(`/transit/stops/near?lat=${lat}&lon=${lon}`),
  geocode: (q: string) => api.get<Array<Place & { detail: string }>>(`/transit/geocode?q=${enc(q)}`),
  addStop: (p: { code: number; name?: string; address?: string | null; walkMinutes?: number; from?: { lat: number; lon: number } | null }) => api.post<{ id: string; walkMinutes: number }>("/transit/stops", p),
  updateStop: (id: string, p: { walkMinutes?: number; lines?: string[]; first?: boolean }) => api.patch<{ ok: true }>(`/transit/stops/${enc(id)}`, p),
  removeStop: (id: string) => api.delete<void>(`/transit/stops/${enc(id)}`),
  plan: (from: Place, to: Place) => api.post<RoutePlan>("/transit/plan", { from, to }),
  createJourney: (p: { name: string; origin: Place; dest: Place; tripId: string; boardSeq: number; alightSeq: number }) => api.post<{ id: string }>("/transit/journeys", p),
  primaryJourney: (id: string) => api.post<{ ok: true }>(`/transit/journeys/${enc(id)}/primary`, {}),
  removeJourney: (id: string) => api.delete<void>(`/transit/journeys/${enc(id)}`),
  depart: (p: { journeyId?: string; stopId?: string }) => api.post<{ onTime: boolean; xp: number; line: string | null; busInMinutes: number | null; source: PassSource | null }>("/transit/depart", p),
  importStep: (step: number) => api.post<{ nextStep: number | null; message: string }>("/transit/gtfs/import", { step }),
};
