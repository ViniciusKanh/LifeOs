import type { Client } from "@libsql/client";
import { dayKeyIn } from "./gamificationService.js";
import { normalizeStoredUtc } from "./healthService.js";

/**
 * Agregação diária das fontes originais (tarefas, treinos, leitura, hábitos,
 * XP, diário, água, foco) no fuso do usuário. Fonte única usada pelo placar
 * de recordes e pelo Quadro de Quests — nada é copiado para outra tabela.
 */

export type DailyMetric =
  | "missions"
  | "projectMissions"
  | "highPriorityMissions"
  | "workouts"
  | "workoutMinutes"
  | "pages"
  | "habits"
  | "xp"
  /** XP sem o que veio das próprias quests (evita quest de XP se alimentar de si mesma). */
  | "xpOrganic"
  | "journal"
  | "waterMl"
  | "focusMinutes";

export const ALL_DAILY_METRICS: readonly DailyMetric[] = [
  "missions",
  "projectMissions",
  "highPriorityMissions",
  "workouts",
  "workoutMinutes",
  "pages",
  "habits",
  "xp",
  "xpOrganic",
  "journal",
  "waterMl",
  "focusMinutes",
];

export type DailySeries = Record<DailyMetric, Map<string, number>>;

export function addDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function emptySeries(): DailySeries {
  return Object.fromEntries(ALL_DAILY_METRICS.map((m) => [m, new Map<string, number>()])) as DailySeries;
}

/** Soma de uma métrica entre dois dias (inclusive). */
export function sumRange(series: Map<string, number>, from: string, to: string): number {
  let total = 0;
  for (const [d, v] of series) if (d >= from && d <= to) total += v;
  return total;
}

/**
 * Lê as métricas pedidas entre `from` e `to` (dias locais, inclusive).
 * Timestamps guardados em UTC são convertidos para o dia local aqui; o
 * filtro SQL usa 1 dia de margem para não perder registros na virada.
 */
export async function collectDailyMetrics(
  db: Client,
  ownerId: string,
  opts: { from: string; to: string; tz: string; metrics: readonly DailyMetric[] },
): Promise<DailySeries> {
  const { from, to, tz } = opts;
  const want = new Set(opts.metrics);
  const has = (...m: DailyMetric[]) => m.some((x) => want.has(x));
  const fromUtc = addDays(from, -1);
  const none = Promise.resolve(null);

  const [tasks, workouts, reading, habits, xp, journal, water, focus] = await Promise.all([
    has("missions", "projectMissions", "highPriorityMissions")
      ? db.execute({
          sql: "SELECT completed_at AS t, project_id, priority FROM tasks WHERE owner_id = ? AND status = 'Concluído' AND completed_at >= ?",
          args: [ownerId, fromUtc],
        })
      : none,
    has("workouts", "workoutMinutes")
      ? db.execute({ sql: "SELECT performed_at AS t, COALESCE(duration_minutes, 0) AS v FROM workouts WHERE owner_id = ? AND performed_at >= ?", args: [ownerId, fromUtc] })
      : none,
    has("pages")
      ? db.execute({ sql: "SELECT started_at AS t, COALESCE(pages_read, 0) AS v FROM reading_sessions WHERE owner_id = ? AND started_at >= ?", args: [ownerId, fromUtc] })
      : none,
    has("habits")
      ? db.execute({
          sql: `SELECT e.entry_date AS d, COUNT(*) AS v FROM habit_entries e JOIN habits h ON h.id = e.habit_id AND h.owner_id = e.owner_id
                WHERE e.owner_id = ? AND e.entry_date >= ? AND e.count >= h.target_count GROUP BY e.entry_date`,
          args: [ownerId, from],
        })
      : none,
    has("xp", "xpOrganic")
      ? db.execute({
          sql: `SELECT day_key AS d, SUM(xp) AS v, SUM(CASE WHEN source_type = 'quest' THEN 0 ELSE xp END) AS o
                FROM xp_events WHERE owner_id = ? AND day_key >= ? GROUP BY day_key`,
          args: [ownerId, from],
        })
      : none,
    has("journal")
      ? db.execute({ sql: "SELECT entry_date AS d FROM journal_entries WHERE owner_id = ? AND entry_date >= ? AND (thoughts IS NOT NULL AND thoughts != '')", args: [ownerId, from] })
      : none,
    has("waterMl")
      ? db.execute({ sql: "SELECT recorded_at AS t, COALESCE(amount_ml, 0) AS v FROM water_entries WHERE owner_id = ? AND recorded_at >= ?", args: [ownerId, fromUtc] })
      : none,
    has("focusMinutes")
      ? db.execute({
          sql: "SELECT ended_at AS t, COALESCE(duration_minutes, 0) AS v FROM time_entries WHERE owner_id = ? AND ended_at IS NOT NULL AND ended_at >= ?",
          args: [ownerId, fromUtc],
        })
      : none,
  ]);

  const out = emptySeries();
  const add = (metric: DailyMetric, day: string, v: number) => {
    if (!want.has(metric) || day < from || day > to || !v) return;
    out[metric].set(day, (out[metric].get(day) ?? 0) + v);
  };
  const localDay = (stored: unknown) => dayKeyIn(new Date(normalizeStoredUtc(String(stored))), tz);

  for (const r of tasks?.rows ?? []) {
    if (!r.t) continue;
    const d = localDay(r.t);
    add("missions", d, 1);
    if (r.project_id) add("projectMissions", d, 1);
    if (r.priority === "Alta") add("highPriorityMissions", d, 1);
  }
  for (const r of workouts?.rows ?? []) {
    if (!r.t) continue;
    const d = localDay(r.t);
    add("workouts", d, 1);
    add("workoutMinutes", d, Number(r.v));
  }
  for (const r of reading?.rows ?? []) if (r.t) add("pages", localDay(r.t), Number(r.v));
  for (const r of habits?.rows ?? []) add("habits", String(r.d), Number(r.v));
  for (const r of xp?.rows ?? []) {
    add("xp", String(r.d), Number(r.v));
    add("xpOrganic", String(r.d), Number(r.o));
  }
  for (const r of journal?.rows ?? []) add("journal", String(r.d), 1);
  for (const r of water?.rows ?? []) if (r.t) add("waterMl", localDay(r.t), Number(r.v));
  for (const r of focus?.rows ?? []) if (r.t) add("focusMinutes", localDay(r.t), Number(r.v));
  return out;
}
