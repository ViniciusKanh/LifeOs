import type { Client } from "@libsql/client";
import { userTimezone } from "./gamificationService.js";
import { normalizeStoredUtc } from "./healthService.js";

/**
 * Ritmo do herói: em que hora × dia da semana (no fuso do usuário) o
 * progresso real acontece. Fontes: conclusão de tarefas (tasks.completed_at)
 * e o ledger de XP (xp_events.created_at) — sem a parte de tarefas no
 * ledger, para não contar a mesma conclusão duas vezes, e sem concessões
 * derivadas (bônus do dia, marcos, conquistas), que não são "atividade".
 */

export const RHYTHM_DEFAULT_DAYS = 90;
/** Abaixo disso o mapa seria ruído: a UI mostra estado vazio honesto. */
export const RHYTHM_MIN_EVENTS = 10;

const WEEKDAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
export const WEEKDAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const;

/** Fontes do ledger que NÃO representam um momento de atividade do usuário. */
const DERIVED_XP_SOURCES = ["task", "day", "habit_streak", "achievement", "project", "campaign"];

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
  /** grid[weekday][hour] = nº de eventos. */
  grid: number[][];
  hourTotals: number[];
  weekdayTotals: number[];
  bestSlots: RhythmSlot[];
  bestHours: Array<{ hour: number; count: number }>;
  sources: { tasks: number; xp: number };
}

/** Dia da semana (0 = segunda) e hora (0–23) de um instante UTC no fuso informado. */
export function localWeekdayHour(stored: string, timeZone: string): { weekday: number; hour: number } | null {
  const date = new Date(normalizeStoredUtc(stored));
  if (Number.isNaN(date.getTime())) return null;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(date);
  } catch {
    parts = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(date);
  }
  const weekday = WEEKDAY_INDEX[parts.find((p) => p.type === "weekday")?.value ?? ""];
  const hour = Number(parts.find((p) => p.type === "hour")?.value) % 24;
  if (weekday === undefined || Number.isNaN(hour)) return null;
  return { weekday, hour };
}

/** Monta o mapa de calor a partir de timestamps UTC (puro, testável). */
export function buildRhythm(timestamps: string[], timeZone: string, days = RHYTHM_DEFAULT_DAYS, sources = { tasks: 0, xp: 0 }): RhythmResult {
  const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  let total = 0;
  for (const ts of timestamps) {
    const at = localWeekdayHour(ts, timeZone);
    if (!at) continue;
    grid[at.weekday][at.hour] += 1;
    total += 1;
  }
  const hourTotals = Array.from({ length: 24 }, (_, h) => grid.reduce((s, row) => s + row[h], 0));
  const weekdayTotals = grid.map((row) => row.reduce((s, v) => s + v, 0));
  const enough = total >= RHYTHM_MIN_EVENTS;

  const cells: RhythmSlot[] = [];
  grid.forEach((row, weekday) =>
    row.forEach((count, hour) => {
      if (count > 0) cells.push({ weekday, weekdayLabel: WEEKDAY_LABELS[weekday], hour, count });
    }),
  );
  cells.sort((a, b) => b.count - a.count || a.weekday - b.weekday || a.hour - b.hour);
  const bestHours = hourTotals
    .map((count, hour) => ({ hour, count }))
    .filter((h) => h.count > 0)
    .sort((a, b) => b.count - a.count || a.hour - b.hour)
    .slice(0, 3);

  return {
    days,
    timezone: timeZone,
    totalEvents: total,
    enough,
    grid,
    hourTotals,
    weekdayTotals,
    bestSlots: enough ? cells.slice(0, 3) : [],
    bestHours: enough ? bestHours : [],
    sources,
  };
}

export async function getRhythm(db: Client, ownerId: string, days = RHYTHM_DEFAULT_DAYS): Promise<RhythmResult> {
  const span = Math.min(90, Math.max(60, Math.round(days)));
  const since = new Date(Date.now() - span * 86_400_000).toISOString().slice(0, 10);
  const placeholders = DERIVED_XP_SOURCES.map(() => "?").join(", ");
  const [tasks, xp, tz] = await Promise.all([
    db.execute({
      sql: "SELECT completed_at AS t FROM tasks WHERE owner_id = ? AND status = 'Concluído' AND completed_at IS NOT NULL AND completed_at >= ?",
      args: [ownerId, since],
    }),
    db.execute({
      sql: `SELECT created_at AS t FROM xp_events WHERE owner_id = ? AND created_at >= ? AND source_type NOT IN (${placeholders})`,
      args: [ownerId, since, ...DERIVED_XP_SOURCES],
    }),
    userTimezone(db, ownerId),
  ]);
  const taskTs = tasks.rows.map((r) => String(r.t));
  const xpTs = xp.rows.map((r) => String(r.t));
  return buildRhythm([...taskTs, ...xpTs], tz, span, { tasks: taskTs.length, xp: xpTs.length });
}
