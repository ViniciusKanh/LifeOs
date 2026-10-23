import type { Client } from "@libsql/client";
import { dayKeyIn, todayKeyFor, userTimezone } from "./gamificationService.js";
import { normalizeStoredUtc } from "./healthService.js";

/**
 * Placar pessoal: esta semana contra a anterior e contra o recorde de todas
 * as semanas passadas — sem outros usuários. Semana = segunda a domingo no
 * fuso do usuário. Tudo é derivado das fontes originais (nada é copiado).
 */

export type RecordMetric = "missions" | "workouts" | "workoutMinutes" | "pages" | "habits" | "xp" | "journal";

export const RECORD_METRICS: Array<{ key: RecordMetric; label: string; unit: string | null }> = [
  { key: "missions", label: "Missões concluídas", unit: null },
  { key: "workouts", label: "Treinos", unit: null },
  { key: "workoutMinutes", label: "Minutos de treino", unit: "min" },
  { key: "pages", label: "Páginas lidas", unit: "pág." },
  { key: "habits", label: "Hábitos cumpridos", unit: null },
  { key: "xp", label: "XP ganho", unit: "XP" },
  { key: "journal", label: "Dias com diário", unit: "dias" },
];

/** Quantas semanas para trás entram na busca do recorde. */
const HISTORY_WEEKS = 104;

/** Segunda-feira (YYYY-MM-DD) da semana de um dia. */
export function weekStartOf(dayKey: string): string {
  const d = new Date(`${dayKey}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // segunda = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

function addDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface RecordRow {
  key: RecordMetric;
  label: string;
  unit: string | null;
  thisWeek: number;
  lastWeek: number;
  /** Variação % contra a semana passada (null sem base). */
  deltaPct: number | null;
  /** Melhor semana ANTES desta (0 quando não há histórico). */
  best: number;
  bestWeekStart: string | null;
  /** Esta semana superou todas as anteriores (e é maior que zero). */
  newRecord: boolean;
}

/** Regra pura do placar: compara a semana atual com a anterior e com o recorde histórico. */
export function buildRecords(byWeek: Record<RecordMetric, Map<string, number>>, currentWeek: string): RecordRow[] {
  const previousWeek = addDays(currentWeek, -7);
  return RECORD_METRICS.map((m) => {
    const weeks = byWeek[m.key];
    const thisWeek = weeks.get(currentWeek) ?? 0;
    const lastWeek = weeks.get(previousWeek) ?? 0;
    let best = 0;
    let bestWeekStart: string | null = null;
    for (const [w, v] of weeks) {
      if (w >= currentWeek) continue;
      if (v > best) {
        best = v;
        bestWeekStart = w;
      }
    }
    return {
      key: m.key,
      label: m.label,
      unit: m.unit,
      thisWeek,
      lastWeek,
      deltaPct: lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null,
      best,
      bestWeekStart,
      // Precisa existir histórico: a primeira semana de uso não vira "recorde".
      newRecord: bestWeekStart !== null && thisWeek > best,
    };
  });
}

export async function getWeeklyRecords(db: Client, ownerId: string) {
  const [today, tz] = await Promise.all([todayKeyFor(db, ownerId), userTimezone(db, ownerId)]);
  const currentWeek = weekStartOf(today);
  const from = addDays(currentWeek, -7 * HISTORY_WEEKS);
  // Margem de 1 dia no filtro UTC: a conversão para o dia local é feita aqui.
  const fromUtc = addDays(from, -1);
  const [tasks, workouts, reading, habits, xp, journal] = await Promise.all([
    db.execute({ sql: "SELECT completed_at AS t FROM tasks WHERE owner_id = ? AND status = 'Concluído' AND completed_at >= ?", args: [ownerId, fromUtc] }),
    db.execute({ sql: "SELECT performed_at AS t, COALESCE(duration_minutes, 0) AS v FROM workouts WHERE owner_id = ? AND performed_at >= ?", args: [ownerId, fromUtc] }),
    db.execute({ sql: "SELECT started_at AS t, COALESCE(pages_read, 0) AS v FROM reading_sessions WHERE owner_id = ? AND started_at >= ?", args: [ownerId, fromUtc] }),
    db.execute({
      sql: `SELECT e.entry_date AS d, COUNT(*) AS v FROM habit_entries e JOIN habits h ON h.id = e.habit_id AND h.owner_id = e.owner_id
            WHERE e.owner_id = ? AND e.entry_date >= ? AND e.count >= h.target_count GROUP BY e.entry_date`,
      args: [ownerId, from],
    }),
    db.execute({ sql: "SELECT day_key AS d, SUM(xp) AS v FROM xp_events WHERE owner_id = ? AND day_key >= ? GROUP BY day_key", args: [ownerId, from] }),
    db.execute({ sql: "SELECT entry_date AS d FROM journal_entries WHERE owner_id = ? AND entry_date >= ? AND (thoughts IS NOT NULL AND thoughts != '')", args: [ownerId, from] }),
  ]);

  const empty = () => new Map<string, number>();
  const byWeek = Object.fromEntries(RECORD_METRICS.map((m) => [m.key, empty()])) as Record<RecordMetric, Map<string, number>>;
  const add = (metric: RecordMetric, day: string, v: number) => {
    if (day < from || day > today) return;
    const w = weekStartOf(day);
    byWeek[metric].set(w, (byWeek[metric].get(w) ?? 0) + v);
  };
  const localDay = (stored: unknown) => dayKeyIn(new Date(normalizeStoredUtc(String(stored))), tz);

  for (const r of tasks.rows) if (r.t) add("missions", localDay(r.t), 1);
  for (const r of workouts.rows) {
    if (!r.t) continue;
    const d = localDay(r.t);
    add("workouts", d, 1);
    add("workoutMinutes", d, Number(r.v));
  }
  for (const r of reading.rows) if (r.t) add("pages", localDay(r.t), Number(r.v));
  for (const r of habits.rows) add("habits", String(r.d), Number(r.v));
  for (const r of xp.rows) add("xp", String(r.d), Number(r.v));
  for (const r of journal.rows) add("journal", String(r.d), 1);

  const rows = buildRecords(byWeek, currentWeek);
  return {
    weekStart: currentWeek,
    weekEnd: addDays(currentWeek, 6),
    today,
    /** Dias já passados nesta semana (1 = segunda): a semana atual ainda está em andamento. */
    daysElapsed: Math.round((new Date(`${today}T12:00:00Z`).getTime() - new Date(`${currentWeek}T12:00:00Z`).getTime()) / 86_400_000) + 1,
    records: rows,
    newRecords: rows.filter((r) => r.newRecord).length,
  };
}
