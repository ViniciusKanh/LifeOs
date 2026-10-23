import { api } from "./api";

export type RecordMetric = "missions" | "workouts" | "workoutMinutes" | "pages" | "habits" | "xp" | "journal";

export interface RecordRow {
  key: RecordMetric;
  label: string;
  unit: string | null;
  thisWeek: number;
  lastWeek: number;
  deltaPct: number | null;
  best: number;
  bestWeekStart: string | null;
  newRecord: boolean;
}

export interface WeeklyRecords {
  weekStart: string;
  weekEnd: string;
  today: string;
  daysElapsed: number;
  records: RecordRow[];
  newRecords: number;
}

/** Recordes pessoais — você contra você (GET /api/records/weekly). */
export const recordsService = {
  weekly: () => api.get<WeeklyRecords>("/records/weekly"),
};
