import { nanoid } from "nanoid";
import type { getDb } from "../db/client.js";
import { DONE_STATUS } from "./workloadService.js";
import { loadDirectionGoals, type DirectionGoal } from "./directionService.js";
import { reviewRewardStatus, todayKeyFor } from "./gamificationService.js";

/**
 * Revisões mensal, trimestral e anual (a semanal continua em weekly_reviews).
 * O "retrato" do período é sempre calculado das fontes originais; ao salvar,
 * uma cópia vai para metrics_json para a revisão continuar contando a mesma
 * história depois, mesmo que dados antigos sejam editados.
 */

type Db = ReturnType<typeof getDb>;
export type PeriodicKind = "monthly" | "quarterly" | "annual";

export function periodRange(kind: PeriodicKind, key: string): { from: string; to: string; label: string } {
  const year = Number(key.slice(0, 4));
  const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
  if (kind === "annual") return { from: `${year}-01-01`, to: `${year}-12-31`, label: String(year) };
  if (kind === "quarterly") {
    const q = Number(key.slice(-1));
    return { from: iso(year, (q - 1) * 3, 1), to: iso(year, q * 3, 0), label: `${q}º trimestre de ${year}` };
  }
  const month = Number(key.slice(5, 7));
  const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  return { from: iso(year, month - 1, 1), to: iso(year, month, 0), label };
}

/** Anda N períodos na chave (2026-10 / 2026-Q4 / 2026) — espelho do helper do front. */
export function shiftPeriodKey(kind: PeriodicKind, key: string, delta: number): string {
  const y = Number(key.slice(0, 4));
  if (kind === "annual") return String(y + delta);
  if (kind === "quarterly") {
    const idx = y * 4 + (Number(key.slice(-1)) - 1) + delta;
    return `${Math.floor(idx / 4)}-Q${(idx % 4) + 1}`;
  }
  const idx = y * 12 + (Number(key.slice(5, 7)) - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

/** Chave do período corrente a partir de um dia YYYY-MM-DD. */
export function periodKeyForDay(kind: PeriodicKind, day: string): string {
  if (kind === "annual") return day.slice(0, 4);
  if (kind === "quarterly") return `${day.slice(0, 4)}-Q${Math.ceil(Number(day.slice(5, 7)) / 3)}`;
  return day.slice(0, 7);
}

/** XP só para o período atual ou o imediatamente anterior (fechamento recém-terminado). */
export async function isReviewRewardEligible(db: Db, ownerId: string, kind: PeriodicKind, key: string): Promise<boolean> {
  const current = periodKeyForDay(kind, await todayKeyFor(db, ownerId));
  return key === current || key === shiftPeriodKey(kind, current, -1);
}

/** Ciclos de meta que "pertencem" ao período (o trimestre inclui seus meses; o ano inclui tudo). */
function cyclesInPeriod(kind: PeriodicKind, key: string): (c: string) => boolean {
  const year = key.slice(0, 4);
  if (kind === "annual") return (c) => c.startsWith(year);
  if (kind === "quarterly") {
    const q = Number(key.slice(-1));
    const months = [1, 2, 3].map((i) => `${year}-${String((q - 1) * 3 + i).padStart(2, "0")}`);
    return (c) => c === key || months.includes(c);
  }
  const quarter = `${year}-Q${Math.ceil(Number(key.slice(5, 7)) / 3)}`;
  return (c) => c === key || c === quarter;
}

export interface PeriodMetrics {
  from: string;
  to: string;
  label: string;
  tasksCompleted: number;
  goalsCompleted: number;
  habitCheckins: number;
  journalEntries: number;
  pagesRead: number;
  workouts: number;
  workoutMinutes: number;
  avgMood: number | null;
  avgSleepMinutes: number | null;
  lifeAdminDone: number;
  wheelAverage: number | null;
  goals: Array<Pick<DirectionGoal, "id" | "title" | "status" | "cycle" | "lifeArea" | "progressPct">>;
}

const n = (rows: unknown[], key = "n") => Number((rows[0] as Record<string, unknown> | undefined)?.[key] ?? 0);
const nn = (rows: unknown[], key: string) => {
  const v = (rows[0] as Record<string, unknown> | undefined)?.[key];
  return v == null ? null : Math.round(Number(v) * 10) / 10;
};

export async function computePeriodMetrics(db: Db, ownerId: string, kind: PeriodicKind, key: string): Promise<PeriodMetrics> {
  const { from, to, label } = periodRange(kind, key);
  const a = [ownerId, from, to];
  const [tasks, goalsDone, habits, journal, pages, workouts, mood, sleep, admin, wheel, goals] = await Promise.all([
    db.execute({ sql: `SELECT COUNT(*) AS n FROM tasks WHERE owner_id = ? AND status = '${DONE_STATUS}' AND date(COALESCE(completed_at, updated_at)) BETWEEN ? AND ?`, args: a }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM goals WHERE owner_id = ? AND status = 'done' AND completed_at >= date(?) AND completed_at < date(?, '+1 day')", args: a }),
    db.execute({
      sql: `SELECT COUNT(*) AS n FROM habit_entries he JOIN habits h ON h.id = he.habit_id
            WHERE he.owner_id = ? AND he.entry_date BETWEEN ? AND ? AND he.count >= h.target_count`,
      args: a,
    }),
    db.execute({
      sql: "SELECT COUNT(*) AS n FROM journal_entries WHERE owner_id = ? AND entry_date BETWEEN ? AND ? AND COALESCE(thoughts, '') != ''",
      args: a,
    }),
    db.execute({ sql: "SELECT COALESCE(SUM(pages_read), 0) AS n FROM reading_sessions WHERE owner_id = ? AND started_at >= date(?) AND started_at < date(?, '+1 day')", args: a }),
    db.execute({ sql: "SELECT COUNT(*) AS n, COALESCE(SUM(duration_minutes), 0) AS m FROM workouts WHERE owner_id = ? AND performed_at >= date(?) AND performed_at < date(?, '+1 day')", args: a }),
    db.execute({ sql: "SELECT AVG(mood) AS v FROM mood_entries WHERE owner_id = ? AND recorded_at >= date(?) AND recorded_at < date(?, '+1 day')", args: a }),
    db.execute({ sql: "SELECT AVG(duration_minutes) AS v FROM sleep_entries WHERE owner_id = ? AND went_to_bed_at >= date(?) AND went_to_bed_at < date(?, '+1 day')", args: a }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM life_admin_history WHERE owner_id = ? AND done_at BETWEEN ? AND ?", args: a }),
    db.execute({
      // Média da avaliação mais recente da roda dentro do período.
      sql: `SELECT AVG(score) AS v FROM life_wheel_scores WHERE owner_id = ? AND assessed_on = (
              SELECT MAX(assessed_on) FROM life_wheel_scores WHERE owner_id = ? AND assessed_on BETWEEN ? AND ?)`,
      args: [ownerId, ownerId, from, to],
    }),
    loadDirectionGoals(db, ownerId),
  ]);
  const inPeriod = cyclesInPeriod(kind, key);
  return {
    from,
    to,
    label,
    tasksCompleted: n(tasks.rows),
    goalsCompleted: n(goalsDone.rows),
    habitCheckins: n(habits.rows),
    journalEntries: n(journal.rows),
    pagesRead: n(pages.rows),
    workouts: n(workouts.rows),
    workoutMinutes: n(workouts.rows, "m"),
    avgMood: nn(mood.rows, "v"),
    avgSleepMinutes: nn(sleep.rows, "v") == null ? null : Math.round(nn(sleep.rows, "v")!),
    lifeAdminDone: n(admin.rows),
    wheelAverage: nn(wheel.rows, "v"),
    goals: goals
      .filter((g) => g.cycle && inPeriod(g.cycle))
      .map(({ id, title, status, cycle, lifeArea, progressPct }) => ({ id, title, status, cycle, lifeArea, progressPct })),
  };
}

export interface PeriodicReview {
  id: string | null;
  kind: PeriodicKind;
  periodKey: string;
  wins: string | null;
  lessons: string | null;
  focusNext: string | null;
  energyScore: number | null;
  savedAt: string | null;
  metrics: PeriodMetrics;
  /** Mesmo retrato do período anterior — base real para as variações (null só se der erro). */
  previousMetrics: PeriodMetrics | null;
  /** Recompensa real do fechamento: regra configurada e se já foi concedida. */
  reward: { xp: number; coins: number; awarded: boolean; awardedAt: string | null; eligible: boolean };
}

export async function getPeriodicReview(db: Db, ownerId: string, kind: PeriodicKind, key: string): Promise<PeriodicReview> {
  const [row, metrics, previousMetrics, reward, eligible] = await Promise.all([
    db.execute({ sql: "SELECT * FROM periodic_reviews WHERE owner_id = ? AND kind = ? AND period_key = ?", args: [ownerId, kind, key] }),
    computePeriodMetrics(db, ownerId, kind, key),
    computePeriodMetrics(db, ownerId, kind, shiftPeriodKey(kind, key, -1)),
    reviewRewardStatus(db, ownerId, kind, key),
    isReviewRewardEligible(db, ownerId, kind, key),
  ]);
  const r = row.rows[0] as unknown as Record<string, unknown> | undefined;
  return {
    id: r ? String(r.id) : null,
    kind,
    periodKey: key,
    wins: (r?.wins as string | null) ?? null,
    lessons: (r?.lessons as string | null) ?? null,
    focusNext: (r?.focus_next as string | null) ?? null,
    energyScore: r?.energy_score == null ? null : Number(r.energy_score),
    savedAt: (r?.updated_at as string | null) ?? null,
    metrics,
    previousMetrics,
    reward: { ...reward, eligible },
  };
}

export async function savePeriodicReview(
  db: Db,
  ownerId: string,
  kind: PeriodicKind,
  key: string,
  input: { wins?: string | null; lessons?: string | null; focusNext?: string | null; energyScore?: number | null }
) {
  const metrics = await computePeriodMetrics(db, ownerId, kind, key);
  await db.execute({
    sql: `INSERT INTO periodic_reviews (id, owner_id, kind, period_key, wins, lessons, focus_next, energy_score, metrics_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (owner_id, kind, period_key) DO UPDATE SET wins = excluded.wins, lessons = excluded.lessons,
            focus_next = excluded.focus_next, energy_score = excluded.energy_score, metrics_json = excluded.metrics_json, updated_at = datetime('now')`,
    args: [nanoid(), ownerId, kind, key, input.wins ?? null, input.lessons ?? null, input.focusNext ?? null, input.energyScore ?? null, JSON.stringify(metrics)],
  });
  return getPeriodicReview(db, ownerId, kind, key);
}

export async function listPeriodicReviews(db: Db, ownerId: string, kind?: PeriodicKind) {
  const r = await db.execute({
    sql: `SELECT kind, period_key, updated_at, energy_score, focus_next FROM periodic_reviews WHERE owner_id = ? ${kind ? "AND kind = ?" : ""}
          ORDER BY period_key DESC LIMIT 60`,
    args: kind ? [ownerId, kind] : [ownerId],
  });
  return (r.rows as unknown as Array<Record<string, unknown>>).map((x) => ({
    kind: x.kind as PeriodicKind,
    periodKey: String(x.period_key),
    savedAt: String(x.updated_at),
    energyScore: x.energy_score == null ? null : Number(x.energy_score),
    focusNext: (x.focus_next as string | null) ?? null,
  }));
}
