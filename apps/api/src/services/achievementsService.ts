import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";

type Db = ReturnType<typeof getDb>;
type MetricMap = Record<string, number>;

const METRIC_KEYS = [
  "tasks_completed_total",
  "books_completed_total",
  "focus_minutes_total",
  "weekly_reviews_total",
  "goals_completed_total",
  "habit_best_streak",
  "tasks_completed_in_day",
  "focus_minutes_in_day",
  "habit_checks_in_day",
  "water_ml_in_day",
  "workouts_in_day",
] as const;

async function scalar(db: Db, sql: string, args: Array<string | number>): Promise<number> {
  const result = await db.execute({ sql, args });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return 0;
  return Number(Object.values(row)[0] ?? 0);
}

/**
 * Calcula, a partir de dados reais (nunca inventados), o valor atual
 * de cada métrica usada pelo catálogo de conquistas. Uma métrica nova
 * só precisa ser adicionada aqui — o catálogo (`achievements`) e a
 * checagem de desbloqueio (`evaluateAchievements`) são genéricos.
 */
async function computeMetrics(db: Db, ownerId: string, metricFilter?: Iterable<string>): Promise<MetricMap> {
  const requested = new Set(metricFilter ?? METRIC_KEYS);
  const metrics: MetricMap = {};
  const jobs: Promise<void>[] = [];

  const addScalar = (key: string, sql: string) => {
    if (!requested.has(key)) return;
    jobs.push(
      scalar(db, sql, [ownerId]).then((value) => {
        metrics[key] = value;
      })
    );
  };

  addScalar("tasks_completed_total", "SELECT COUNT(*) FROM tasks WHERE owner_id = ? AND status = 'Concluído'");
  addScalar("books_completed_total", "SELECT COUNT(*) FROM books WHERE owner_id = ? AND status = 'Concluído'");
  addScalar("focus_minutes_total", "SELECT COALESCE(SUM(actual_minutes), 0) FROM focus_sessions WHERE owner_id = ? AND actual_minutes IS NOT NULL");
  addScalar("weekly_reviews_total", "SELECT COUNT(*) FROM weekly_reviews WHERE owner_id = ?");
  addScalar("goals_completed_total", "SELECT COUNT(*) FROM goals WHERE owner_id = ? AND status = 'done'");

  // Métricas "por dia" usadas por troféus customizados. O valor é o
  // melhor dia real do histórico do usuário, calculado só quando algum
  // troféu realmente precisa daquela métrica.
  addScalar(
    "tasks_completed_in_day",
    "SELECT COALESCE(MAX(n), 0) FROM (SELECT COUNT(*) AS n FROM tasks WHERE owner_id = ? AND status = 'Concluído' AND completed_at IS NOT NULL GROUP BY date(completed_at))"
  );
  addScalar(
    "focus_minutes_in_day",
    "SELECT COALESCE(MAX(n), 0) FROM (SELECT SUM(actual_minutes) AS n FROM focus_sessions WHERE owner_id = ? AND actual_minutes IS NOT NULL GROUP BY date(started_at))"
  );
  addScalar(
    "habit_checks_in_day",
    "SELECT COALESCE(MAX(n), 0) FROM (SELECT COUNT(DISTINCT habit_id) AS n FROM habit_entries WHERE owner_id = ? GROUP BY entry_date)"
  );
  addScalar(
    "water_ml_in_day",
    "SELECT COALESCE(MAX(n), 0) FROM (SELECT SUM(amount_ml) AS n FROM water_entries WHERE owner_id = ? GROUP BY date(recorded_at))"
  );
  addScalar(
    "workouts_in_day",
    "SELECT COALESCE(MAX(n), 0) FROM (SELECT COUNT(*) AS n FROM workouts WHERE owner_id = ? GROUP BY date(performed_at))"
  );

  if (requested.has("habit_best_streak")) {
    jobs.push(
      db
        .execute({
          sql: "SELECT habit_id, entry_date FROM habit_entries WHERE owner_id = ? ORDER BY habit_id, entry_date",
          args: [ownerId],
        })
        .then((habitEntries) => {
          let bestStreak = 0;
          const byHabit = new Map<string, string[]>();
          for (const row of habitEntries.rows as unknown as Array<{ habit_id: string; entry_date: string }>) {
            if (!byHabit.has(row.habit_id)) byHabit.set(row.habit_id, []);
            byHabit.get(row.habit_id)!.push(row.entry_date);
          }
          for (const dates of byHabit.values()) {
            let current = 1;
            let best = dates.length > 0 ? 1 : 0;
            for (let i = 1; i < dates.length; i++) {
              const prev = new Date(`${dates[i - 1]}T00:00:00Z`);
              const curr = new Date(`${dates[i]}T00:00:00Z`);
              const diffDays = Math.round((curr.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000));
              current = diffDays === 1 ? current + 1 : 1;
              best = Math.max(best, current);
            }
            bestStreak = Math.max(bestStreak, best);
          }
          metrics.habit_best_streak = bestStreak;
        })
    );
  }

  await Promise.all(jobs);
  return metrics;
}

/** Catálogo fixo de métricas disponíveis para troféus customizados — nunca texto livre de fórmula. */
export const CUSTOM_ACHIEVEMENT_METRICS = [
  { value: "tasks_completed_in_day", label: "Tarefas concluídas em um dia" },
  { value: "focus_minutes_in_day", label: "Minutos de foco em um dia" },
  { value: "habit_checks_in_day", label: "Hábitos marcados em um dia" },
  { value: "water_ml_in_day", label: "Água (ml) em um dia" },
  { value: "workouts_in_day", label: "Treinos em um dia" },
  { value: "tasks_completed_total", label: "Tarefas concluídas (total)" },
  { value: "books_completed_total", label: "Livros concluídos (total)" },
  { value: "focus_minutes_total", label: "Minutos de foco (total)" },
  { value: "weekly_reviews_total", label: "Weekly Reviews preenchidas (total)" },
  { value: "goals_completed_total", label: "Metas concluídas (total)" },
  { value: "habit_best_streak", label: "Sequência de dias de hábito (streak)" },
] as const;

export type CustomAchievementMetric = (typeof CUSTOM_ACHIEVEMENT_METRICS)[number]["value"];

export interface CustomAchievementView {
  id: string;
  title: string;
  description: string | null;
  icon: string;
  metric: string;
  threshold: number;
  progress: number;
  unlockedAt: string | null;
  createdAt: string;
}

function toCustomView(row: {
  id: string;
  title: string;
  description: string | null;
  icon: string;
  metric: string;
  threshold: number;
  unlocked_at: string | null;
  created_at: string;
}, metrics: Record<string, number>): CustomAchievementView {
  const currentValue = metrics[row.metric] ?? 0;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    icon: row.icon,
    metric: row.metric,
    threshold: row.threshold,
    progress: Math.min(100, Math.round((currentValue / row.threshold) * 100)),
    unlockedAt: row.unlocked_at,
    createdAt: row.created_at,
  };
}

/** Lista os troféus customizados do usuário, com progresso real recalculado. */
export async function listCustomAchievements(ownerId: string): Promise<CustomAchievementView[]> {
  const db = getDb();
  const rows = await db.execute({ sql: "SELECT * FROM custom_achievements WHERE owner_id = ? ORDER BY created_at DESC", args: [ownerId] });
  const trophies = rows.rows as unknown as Parameters<typeof toCustomView>[0][];
  if (trophies.length === 0) return [];
  const metrics = await computeMetrics(db, ownerId, trophies.map((t) => t.metric));
  return trophies.map((r) => toCustomView(r, metrics));
}

export async function createCustomAchievement(
  ownerId: string,
  input: { title: string; description?: string | null; icon?: string; metric: CustomAchievementMetric; threshold: number }
): Promise<CustomAchievementView> {
  const db = getDb();
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO custom_achievements (id, owner_id, title, description, icon, metric, threshold)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, ownerId, input.title, input.description ?? null, input.icon ?? "🏆", input.metric, input.threshold],
  });
  const metrics = await computeMetrics(db, ownerId, [input.metric]);
  const unlockedAt = (metrics[input.metric] ?? 0) >= input.threshold ? new Date().toISOString() : null;
  if (unlockedAt) {
    await db.execute({
      sql: "UPDATE custom_achievements SET unlocked_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND owner_id = ?",
      args: [id, ownerId],
    });
  }
  const created = await db.execute({ sql: "SELECT * FROM custom_achievements WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  const row = created.rows[0] as unknown as Parameters<typeof toCustomView>[0];
  return toCustomView({ ...row, unlocked_at: row.unlocked_at ?? unlockedAt }, metrics);
}

export async function removeCustomAchievement(ownerId: string, id: string): Promise<boolean> {
  const db = getDb();
  const result = await db.execute({ sql: "DELETE FROM custom_achievements WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  return result.rowsAffected > 0;
}

/**
 * Recalcula as métricas reais e desbloqueia (grava `unlocked_at`)
 * qualquer troféu customizado cujo limite já tenha sido atingido —
 * mesma lógica de `evaluateAchievements`, mas para a tabela do
 * próprio usuário (não precisa de tabela de junção).
 */
export async function evaluateCustomAchievements(ownerId: string): Promise<CustomAchievementView[]> {
  const db = getDb();
  const metrics = await computeMetrics(db, ownerId);
  const rows = await db.execute({
    sql: "SELECT * FROM custom_achievements WHERE owner_id = ? AND unlocked_at IS NULL",
    args: [ownerId],
  });
  const trophies = rows.rows as unknown as Parameters<typeof toCustomView>[0][];
  if (trophies.length === 0) return [];

  const metrics = await computeMetrics(db, ownerId, trophies.map((t) => t.metric));
  const newlyUnlocked: CustomAchievementView[] = [];
  for (const row of trophies) {
    const value = metrics[row.metric] ?? 0;
    if (value >= row.threshold) {
      await db.execute({
        sql: "UPDATE custom_achievements SET unlocked_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND owner_id = ?",
        args: [row.id, ownerId],
      });
      newlyUnlocked.push(toCustomView({ ...row, unlocked_at: new Date().toISOString() }, metrics));
    }
  }
  return newlyUnlocked;
}

export interface AchievementView {
  id: string;
  code: string;
  title: string;
  description: string | null;
  icon: string | null;
  metric: string | null;
  threshold: number | null;
  progress: number;
  unlockedAt: string | null;
}

/** Catálogo completo com o progresso real do usuário em cada conquista (destravada ou não). */
export async function listAchievements(ownerId: string): Promise<AchievementView[]> {
  const db = getDb();
  const [catalog, unlocked] = await Promise.all([
    db.execute("SELECT * FROM achievements ORDER BY threshold ASC"),
    db.execute({ sql: "SELECT achievement_id, unlocked_at FROM user_achievements WHERE owner_id = ?", args: [ownerId] }),
  ]);
  const catalogRows = catalog.rows as unknown as Array<{
    id: string;
    code: string;
    title: string;
    description: string | null;
    icon: string | null;
    metric: string | null;
    threshold: number | null;
  }>;
  const metrics = await computeMetrics(db, ownerId, catalogRows.map((row) => row.metric).filter((metric): metric is string => !!metric));

  const unlockedMap = new Map(
    (unlocked.rows as unknown as Array<{ achievement_id: string; unlocked_at: string }>).map((r) => [r.achievement_id, r.unlocked_at])
  );

  return catalogRows.map((row) => {
    const currentValue = row.metric ? (metrics[row.metric] ?? 0) : 0;
    const progress = row.threshold ? Math.min(100, Math.round((currentValue / row.threshold) * 100)) : 0;
    return {
      id: row.id,
      code: row.code,
      title: row.title,
      description: row.description,
      icon: row.icon,
      metric: row.metric,
      threshold: row.threshold,
      progress,
      unlockedAt: unlockedMap.get(row.id) ?? null,
    };
  });
}

/**
 * Recalcula as métricas reais do usuário e desbloqueia (grava em
 * `user_achievements`) qualquer conquista do catálogo cujo limite já
 * tenha sido atingido e ainda não estava marcada — idempotente,
 * seguro de chamar toda vez que o usuário completa algo relevante.
 */
export async function evaluateAchievements(ownerId: string): Promise<AchievementView[]> {
  const db = getDb();

  const catalog = await db.execute("SELECT id, metric, threshold FROM achievements");
  const already = await db.execute({ sql: "SELECT achievement_id FROM user_achievements WHERE owner_id = ?", args: [ownerId] });
  const alreadySet = new Set((already.rows as unknown as Array<{ achievement_id: string }>).map((r) => r.achievement_id));
  const pendingRows = (catalog.rows as unknown as Array<{ id: string; metric: string | null; threshold: number | null }>).filter(
    (row) => !alreadySet.has(row.id) && row.metric && row.threshold !== null
  );
  if (pendingRows.length === 0) return [];
  const metrics = await computeMetrics(db, ownerId, pendingRows.map((row) => row.metric).filter((metric): metric is string => !!metric));

  const newlyUnlocked: string[] = [];
  for (const row of pendingRows) {
    const value = metrics[row.metric] ?? 0;
    if (value >= row.threshold) {
      await db.execute({
        sql: "INSERT OR IGNORE INTO user_achievements (id, owner_id, achievement_id) VALUES (?, ?, ?)",
        args: [nanoid(), ownerId, row.id],
      });
      newlyUnlocked.push(row.id);
    }
  }

  if (newlyUnlocked.length === 0) return [];
  const placeholders = newlyUnlocked.map(() => "?").join(", ");
  const details = await db.execute({
    sql: `SELECT * FROM achievements WHERE id IN (${placeholders})`,
    args: newlyUnlocked,
  });
  return (details.rows as unknown as Array<{
    id: string;
    code: string;
    title: string;
    description: string | null;
    icon: string | null;
    metric: string | null;
    threshold: number | null;
  }>).map((row) => ({
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    icon: row.icon,
    metric: row.metric,
    threshold: row.threshold,
    progress: 100,
    unlockedAt: new Date().toISOString(),
  }));
}
