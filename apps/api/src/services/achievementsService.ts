import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";

type Db = ReturnType<typeof getDb>;

/**
 * Calcula, a partir de dados reais (nunca inventados), o valor atual
 * de cada métrica usada pelo catálogo de conquistas. Uma métrica nova
 * só precisa ser adicionada aqui — o catálogo (`achievements`) e a
 * checagem de desbloqueio (`evaluateAchievements`) são genéricos.
 */
async function computeMetrics(db: Db, ownerId: string): Promise<Record<string, number>> {
  const [
    tasksCompleted,
    booksCompleted,
    focusMinutes,
    weeklyReviews,
    goalsCompleted,
    habitEntries,
    tasksPerDay,
    focusMinutesPerDay,
    habitChecksPerDay,
    waterMlPerDay,
    workoutsPerDay,
  ] = await Promise.all([
    db.execute({ sql: "SELECT COUNT(*) AS n FROM tasks WHERE owner_id = ? AND status = 'Concluído'", args: [ownerId] }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM books WHERE owner_id = ? AND status = 'Concluído'", args: [ownerId] }),
    db.execute({
      sql: "SELECT COALESCE(SUM(actual_minutes), 0) AS n FROM focus_sessions WHERE owner_id = ? AND actual_minutes IS NOT NULL",
      args: [ownerId],
    }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM weekly_reviews WHERE owner_id = ?", args: [ownerId] }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM goals WHERE owner_id = ? AND status = 'done'", args: [ownerId] }),
    db.execute({
      sql: "SELECT habit_id, entry_date FROM habit_entries WHERE owner_id = ? ORDER BY habit_id, entry_date",
      args: [ownerId],
    }),
    // Métricas "por dia" — usadas por troféus customizados do tipo
    // "faça X em um único dia" (ex.: concluir 5 tarefas no dia).
    // Guardamos o MAIOR valor já alcançado em qualquer dia da
    // história do usuário, nunca um número inventado.
    db.execute({
      sql: "SELECT COALESCE(MAX(n), 0) AS n FROM (SELECT COUNT(*) AS n FROM tasks WHERE owner_id = ? AND status = 'Concluído' GROUP BY date(completed_at))",
      args: [ownerId],
    }),
    db.execute({
      sql: "SELECT COALESCE(MAX(n), 0) AS n FROM (SELECT SUM(actual_minutes) AS n FROM focus_sessions WHERE owner_id = ? AND actual_minutes IS NOT NULL GROUP BY date(started_at))",
      args: [ownerId],
    }),
    db.execute({
      sql: "SELECT COALESCE(MAX(n), 0) AS n FROM (SELECT COUNT(DISTINCT habit_id) AS n FROM habit_entries WHERE owner_id = ? GROUP BY entry_date)",
      args: [ownerId],
    }),
    db.execute({
      sql: "SELECT COALESCE(MAX(n), 0) AS n FROM (SELECT SUM(amount_ml) AS n FROM water_entries WHERE owner_id = ? GROUP BY date(recorded_at))",
      args: [ownerId],
    }),
    db.execute({
      sql: "SELECT COALESCE(MAX(n), 0) AS n FROM (SELECT COUNT(*) AS n FROM workouts WHERE owner_id = ? GROUP BY date(performed_at))",
      args: [ownerId],
    }),
  ]);

  // Melhor sequência de dias seguidos entre todos os hábitos — cada
  // hábito tem sua própria lista de datas com registro, procuramos a
  // maior corrida de dias consecutivos em qualquer um deles.
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

  return {
    tasks_completed_total: Number((tasksCompleted.rows[0] as unknown as { n: number }).n),
    books_completed_total: Number((booksCompleted.rows[0] as unknown as { n: number }).n),
    focus_minutes_total: Number((focusMinutes.rows[0] as unknown as { n: number }).n),
    weekly_reviews_total: Number((weeklyReviews.rows[0] as unknown as { n: number }).n),
    goals_completed_total: Number((goalsCompleted.rows[0] as unknown as { n: number }).n),
    habit_best_streak: bestStreak,
    tasks_completed_in_day: Number((tasksPerDay.rows[0] as unknown as { n: number }).n),
    focus_minutes_in_day: Number((focusMinutesPerDay.rows[0] as unknown as { n: number }).n),
    habit_checks_in_day: Number((habitChecksPerDay.rows[0] as unknown as { n: number }).n),
    water_ml_in_day: Number((waterMlPerDay.rows[0] as unknown as { n: number }).n),
    workouts_in_day: Number((workoutsPerDay.rows[0] as unknown as { n: number }).n),
  };
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
  const [rows, metrics] = await Promise.all([
    db.execute({ sql: "SELECT * FROM custom_achievements WHERE owner_id = ? ORDER BY created_at DESC", args: [ownerId] }),
    computeMetrics(db, ownerId),
  ]);
  return (rows.rows as unknown as Parameters<typeof toCustomView>[0][]).map((r) => toCustomView(r, metrics));
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
  const metrics = await computeMetrics(db, ownerId);
  const created = await db.execute({ sql: "SELECT * FROM custom_achievements WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  return toCustomView(created.rows[0] as unknown as Parameters<typeof toCustomView>[0], metrics);
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

  const newlyUnlocked: CustomAchievementView[] = [];
  for (const row of rows.rows as unknown as Parameters<typeof toCustomView>[0][]) {
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
  const [catalog, unlocked, metrics] = await Promise.all([
    db.execute("SELECT * FROM achievements ORDER BY threshold ASC"),
    db.execute({ sql: "SELECT achievement_id, unlocked_at FROM user_achievements WHERE owner_id = ?", args: [ownerId] }),
    computeMetrics(db, ownerId),
  ]);

  const unlockedMap = new Map(
    (unlocked.rows as unknown as Array<{ achievement_id: string; unlocked_at: string }>).map((r) => [r.achievement_id, r.unlocked_at])
  );

  return (catalog.rows as unknown as Array<{
    id: string;
    code: string;
    title: string;
    description: string | null;
    icon: string | null;
    metric: string | null;
    threshold: number | null;
  }>).map((row) => {
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
  const metrics = await computeMetrics(db, ownerId);

  const catalog = await db.execute("SELECT id, metric, threshold FROM achievements");
  const already = await db.execute({ sql: "SELECT achievement_id FROM user_achievements WHERE owner_id = ?", args: [ownerId] });
  const alreadySet = new Set((already.rows as unknown as Array<{ achievement_id: string }>).map((r) => r.achievement_id));

  const newlyUnlocked: string[] = [];
  for (const row of catalog.rows as unknown as Array<{ id: string; metric: string | null; threshold: number | null }>) {
    if (alreadySet.has(row.id)) continue;
    if (!row.metric || row.threshold === null) continue;
    const value = metrics[row.metric] ?? 0;
    if (value >= row.threshold) {
      await db.execute({
        sql: "INSERT OR IGNORE INTO user_achievements (id, owner_id, achievement_id) VALUES (?, ?, ?)",
        args: [nanoid(), ownerId, row.id],
      });
      newlyUnlocked.push(row.id);
    }
  }

  const all = await listAchievements(ownerId);
  if (newlyUnlocked.length === 0) return [];
  return all.filter((a) => newlyUnlocked.includes(a.id));
}
