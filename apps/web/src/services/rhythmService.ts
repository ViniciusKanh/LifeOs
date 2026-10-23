import { api } from "./api";

export interface RhythmSlot {
  weekday: number; // 0 = segunda
  weekdayLabel: string;
  hour: number;
  count: number;
}

export interface RhythmResult {
  days: number;
  timezone: string;
  totalEvents: number;
  enough: boolean;
  /** grid[diaDaSemana][hora] = nº de registros. */
  grid: number[][];
  hourTotals: number[];
  weekdayTotals: number[];
  bestSlots: RhythmSlot[];
  bestHours: Array<{ hour: number; count: number }>;
  sources: { tasks: number; xp: number };
}

/** Ritmo do herói (GET /api/rhythm) — hora × dia da semana no fuso do usuário. */
export const rhythmService = {
  get: (days = 90) => api.get<RhythmResult>(`/rhythm?days=${days}`),
};
