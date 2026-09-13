import { getDb } from "../db/client.js";

/**
 * Cálculo do Life Score e das métricas agregadas (Analytics, Hoje,
 * Weekly Review). Regra de ouro deste arquivo: nunca inventar
 * número — toda dimensão vem de uma consulta real; quando não há
 * dado suficiente, o valor é 0 (nunca um placeholder "bonito").
 */

type Db = ReturnType<typeof getDb>;

function clamp(value: number, min = 0, max = 100) {
  if (Number.isNaN(value) || !Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

async function scalar(db: Db, sql: string, args: Array<string | number>): Promise<number> {
  const result = await db.execute({ sql, args });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return 0;
  const value = Object.values(row)[0];
  return Number(value ?? 0);
}

/** Produtividade: % de tarefas concluídas sobre o total já criado. */
async function productivityScore(db: Db, ownerId: string): Promise<number> {
  const total = await scalar(db, "SELECT COUNT(*) FROM tasks WHERE owner_id = ?", [ownerId]);
  if (total === 0) return 0;
  const done = await scalar(db, "SELECT COUNT(*) FROM tasks WHERE owner_id = ? AND status = 'Concluído'", [ownerId]);
  return clamp((done / total) * 100);
}

/** Profissional: mesmo cálculo, restrito a tarefas de projetos "professional"/"workspace". */
async function professionalScore(db: Db, ownerId: string): Promise<number> {
  const total = await scalar(
    db,
    `SELECT COUNT(*) FROM tasks t JOIN projects p ON p.id = t.project_id
     WHERE t.owner_id = ? AND p.kind IN ('professional', 'workspace')`,
    [ownerId]
  );
  if (total === 0) return 0;
  const done = await scalar(
    db,
    `SELECT COUNT(*) FROM tasks t JOIN projects p ON p.id = t.project_id
     WHERE t.owner_id = ? AND p.kind IN ('professional', 'workspace') AND t.status = 'Concluído'`,
    [ownerId]
  );
  return clamp((done / total) * 100);
}

/** Saúde: média de água hoje, qualidade do último sono e se houve exercício hoje. */
async function healthScore(db: Db, ownerId: string, date: string): Promise<number> {
  const waterMl = await scalar(
    db,
    "SELECT COALESCE(SUM(amount_ml), 0) FROM water_entries WHERE owner_id = ? AND date(recorded_at) = date(?)",
    [ownerId, date]
  );
  const waterScore = clamp((waterMl / 2000) * 100);

  const sleepRow = await db.execute({
    sql: "SELECT quality, duration_minutes FROM sleep_entries WHERE owner_id = ? ORDER BY went_to_bed_at DESC LIMIT 1",
    args: [ownerId],
  });
  const sleep = sleepRow.rows[0] as { quality?: number; duration_minutes?: number } | undefined;
  const sleepScore = sleep?.quality
    ? clamp(sleep.quality * 20)
    : sleep?.duration_minutes
      ? clamp((sleep.duration_minutes / 480) * 100)
      : 0;

  const workouts = await scalar(
    db,
    "SELECT COUNT(*) FROM workouts WHERE owner_id = ? AND date(performed_at) = date(?)",
    [ownerId, date]
  );
  const workoutScore = workouts > 0 ? 100 : 0;

  return clamp((waterScore + sleepScore + workoutScore) / 3);
}

/** Educação: progresso médio das formações ativas (educations.progress_pct). */
async function educationScore(db: Db, ownerId: string): Promise<number> {
  const result = await db.execute({
    sql: "SELECT AVG(progress_pct) AS avg_pct FROM educations WHERE owner_id = ?",
    args: [ownerId],
  });
  return clamp(Number(result.rows[0]?.avg_pct ?? 0));
}

/** Leitura: progresso médio (página atual / total) dos livros em leitura. */
async function readingScore(db: Db, ownerId: string): Promise<number> {
  const result = await db.execute({
    sql: `SELECT current_page, total_pages FROM books
          WHERE owner_id = ? AND status = 'Lendo' AND total_pages IS NOT NULL AND total_pages > 0`,
    args: [ownerId],
  });
  const rows = result.rows as unknown as Array<{ current_page: number; total_pages: number }>;
  if (rows.length === 0) return 0;
  const avg = rows.reduce((sum, b) => sum + b.current_page / b.total_pages, 0) / rows.length;
  return clamp(avg * 100);
}

/** Hábitos: % dos hábitos ativos com check-in registrado hoje. */
async function habitsScore(db: Db, ownerId: string, date: string): Promise<number> {
  const total = await scalar(db, "SELECT COUNT(*) FROM habits WHERE owner_id = ? AND archived_at IS NULL", [ownerId]);
  if (total === 0) return 0;
  const checkedIn = await scalar(
    db,
    `SELECT COUNT(*) FROM habit_entries he JOIN habits h ON h.id = he.habit_id
     WHERE he.owner_id = ? AND he.entry_date = ? AND h.archived_at IS NULL AND he.count >= h.target_count`,
    [ownerId, date]
  );
  return clamp((checkedIn / total) * 100);
}

/** Metas: progresso médio das metas ativas, conforme o tipo de cada uma. */
async function goalsScore(db: Db, ownerId: string): Promise<number> {
  const result = await db.execute({
    sql: "SELECT kind, status, target_value, current_value FROM goals WHERE owner_id = ? AND status != 'abandoned'",
    args: [ownerId],
  });
  const rows = result.rows as unknown as Array<{
    kind: string;
    status: string;
    target_value: number | null;
    current_value: number;
  }>;
  if (rows.length === 0) return 0;

  const scores = rows.map((g) => {
    if (g.status === "done") return 100;
    if (g.kind === "percentage") return clamp(g.current_value);
    if (g.kind === "numeric" && g.target_value) return clamp((g.current_value / g.target_value) * 100);
    if (g.kind === "binary") return 0;
    return 0; // task_based sem submetas resolvidas ainda entra como 0, nunca estimado
  });
  return clamp(scores.reduce((a, b) => a + b, 0) / scores.length);
}

export interface LifeScoreBreakdown {
  date: string;
  overall: number;
  productivity: number;
  health: number;
  education: number;
  reading: number;
  habits: number;
  professional: number;
  goals: number;
}

export async function computeLifeScore(ownerId: string, date = new Date().toISOString().slice(0, 10)): Promise<LifeScoreBreakdown> {
  const db = getDb();
  const [productivity, health, education, reading, habits, professional, goals] = await Promise.all([
    productivityScore(db, ownerId),
    healthScore(db, ownerId, date),
    educationScore(db, ownerId),
    readingScore(db, ownerId),
    habitsScore(db, ownerId, date),
    professionalScore(db, ownerId),
    goalsScore(db, ownerId),
  ]);

  const dims = [productivity, health, education, reading, habits, professional, goals];
  const overall = clamp(dims.reduce((a, b) => a + b, 0) / dims.length);

  return { date, overall, productivity, health, education, reading, habits, professional, goals };
}

export interface RangeMetrics {
  from: string;
  to: string;
  tasksCompleted: number;
  tasksPlanned: number;
  focusMinutes: number;
  studyMinutes: number;
  pagesRead: number;
  workouts: number;
  readingMinutes: number;
  workoutMinutes: number;
  habitsCompletionPct: number;
  habitsDoneCount: number;
  habitsPossibleCount: number;
}

/** Métricas somadas num intervalo [from, to) — usadas em Analytics e Weekly Review. */
export async function computeRangeMetrics(ownerId: string, from: string, to: string): Promise<RangeMetrics> {
  const db = getDb();

  const [tasksCompleted, tasksPlanned, focusMinutes, studyMinutes, pagesRead, workouts, readingMinutes, workoutMinutes, habitsTotal, habitsDone] = await Promise.all([
    scalar(
      db,
      "SELECT COUNT(*) FROM tasks WHERE owner_id = ? AND status = 'Concluído' AND date(updated_at) >= date(?) AND date(updated_at) < date(?)",
      [ownerId, from, to]
    ),
    // "Planejadas": todas as tarefas criadas no período, concluídas ou não —
    // o denominador real de "48 de 100 planejadas", nunca uma meta inventada.
    scalar(
      db,
      "SELECT COUNT(*) FROM tasks WHERE owner_id = ? AND date(created_at) >= date(?) AND date(created_at) < date(?)",
      [ownerId, from, to]
    ),
    scalar(
      db,
      "SELECT COALESCE(SUM(actual_minutes), 0) FROM focus_sessions WHERE owner_id = ? AND date(started_at) >= date(?) AND date(started_at) < date(?) AND ended_at IS NOT NULL",
      [ownerId, from, to]
    ),
    scalar(
      db,
      `SELECT COALESCE(SUM(fs.actual_minutes), 0) FROM focus_sessions fs
       JOIN tasks t ON t.id = fs.task_id JOIN projects p ON p.id = t.project_id
       WHERE fs.owner_id = ? AND p.kind = 'academic' AND date(fs.started_at) >= date(?) AND date(fs.started_at) < date(?) AND fs.ended_at IS NOT NULL`,
      [ownerId, from, to]
    ),
    scalar(
      db,
      "SELECT COALESCE(SUM(pages_read), 0) FROM reading_sessions WHERE owner_id = ? AND date(started_at) >= date(?) AND date(started_at) < date(?)",
      [ownerId, from, to]
    ),
    scalar(
      db,
      "SELECT COUNT(*) FROM workouts WHERE owner_id = ? AND date(performed_at) >= date(?) AND date(performed_at) < date(?)",
      [ownerId, from, to]
    ),
    scalar(
      db,
      "SELECT COALESCE(SUM(duration_minutes), 0) FROM reading_sessions WHERE owner_id = ? AND date(started_at) >= date(?) AND date(started_at) < date(?)",
      [ownerId, from, to]
    ),
    scalar(
      db,
      "SELECT COALESCE(SUM(duration_minutes), 0) FROM workouts WHERE owner_id = ? AND date(performed_at) >= date(?) AND date(performed_at) < date(?)",
      [ownerId, from, to]
    ),
    scalar(
      db,
      "SELECT COUNT(*) * CAST(julianday(?) - julianday(?) AS INTEGER) FROM habits WHERE owner_id = ? AND archived_at IS NULL",
      [to, from, ownerId]
    ),
    scalar(
      db,
      `SELECT COUNT(*) FROM habit_entries he JOIN habits h ON h.id = he.habit_id
       WHERE he.owner_id = ? AND h.archived_at IS NULL AND he.count >= h.target_count
       AND he.entry_date >= date(?) AND he.entry_date < date(?)`,
      [ownerId, from, to]
    ),
  ]);

  return {
    from,
    to,
    tasksCompleted,
    tasksPlanned,
    focusMinutes,
    studyMinutes,
    pagesRead,
    workouts,
    readingMinutes,
    workoutMinutes,
    habitsCompletionPct: habitsTotal > 0 ? clamp((habitsDone / habitsTotal) * 100) : 0,
    habitsDoneCount: habitsDone,
    habitsPossibleCount: habitsTotal,
  };
}

/** Variação percentual entre o valor atual e o do período anterior; null sem base de comparação (honesto — nunca 0% fabricado). */
export function changePct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/* ---------------------------- Insights (Analytics) ---------------------------- */
//
// Regra de ouro reforçada aqui: uma correlação só é retornada quando
// existe amostra mínima real (MIN_PAIRS pares de dados); do contrário
// o campo volta como null — nunca um número inventado para "parecer
// que tem insight". O front deve tratar null como "dados insuficientes".

const MIN_PAIRS = 5;

/** Correlação de Pearson (r) entre dois vetores numéricos do mesmo tamanho. */
function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < MIN_PAIRS) return null;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (denX === 0 || denY === 0) return null;
  const r = num / Math.sqrt(denX * denY);
  return Math.round(r * 100) / 100;
}

export interface LifeInsights {
  from: string;
  to: string;
  sleepVsNextDayProductivity: { r: number | null; pairs: number };
  moodVsFocusMinutes: { r: number | null; pairs: number };
  bestWeekday: { label: string; avgCompleted: number } | null;
  bestFocusHour: { hour: number; totalMinutes: number } | null;
  weekdayBreakdown: Array<{ weekday: number; label: string; avgCompleted: number }>;
}

const WEEKDAY_LABEL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export async function computeInsights(ownerId: string, from: string, to: string): Promise<LifeInsights> {
  const db = getDb();

  // 1) Sono (minutos, por noite) vs. tarefas concluídas no dia seguinte.
  const [sleepByNight, tasksByDay, moodByDay, focusByDay, focusByHour] = await Promise.all([
    db.execute({
      sql: `SELECT date(went_to_bed_at) AS d, AVG(duration_minutes) AS minutes FROM sleep_entries
            WHERE owner_id = ? AND duration_minutes IS NOT NULL AND date(went_to_bed_at) >= date(?) AND date(went_to_bed_at) <= date(?)
            GROUP BY d`,
      args: [ownerId, from, to],
    }),
    db.execute({
      sql: `SELECT date(updated_at) AS d, COUNT(*) AS total FROM tasks
            WHERE owner_id = ? AND status = 'Concluído' AND date(updated_at) >= date(?) AND date(updated_at) <= date(?)
            GROUP BY d`,
      args: [ownerId, from, to],
    }),
    db.execute({
      sql: `SELECT date(recorded_at) AS d, AVG(mood) AS mood FROM mood_entries
            WHERE owner_id = ? AND date(recorded_at) >= date(?) AND date(recorded_at) <= date(?)
            GROUP BY d`,
      args: [ownerId, from, to],
    }),
    db.execute({
      sql: `SELECT date(started_at) AS d, SUM(COALESCE(actual_minutes, 0)) AS minutes FROM focus_sessions
            WHERE owner_id = ? AND ended_at IS NOT NULL AND date(started_at) >= date(?) AND date(started_at) <= date(?)
            GROUP BY d`,
      args: [ownerId, from, to],
    }),
    db.execute({
      sql: `SELECT CAST(strftime('%H', started_at) AS INTEGER) AS hour, SUM(COALESCE(actual_minutes, 0)) AS minutes
            FROM focus_sessions WHERE owner_id = ? AND ended_at IS NOT NULL AND date(started_at) >= date(?) AND date(started_at) <= date(?)
            GROUP BY hour ORDER BY minutes DESC LIMIT 1`,
      args: [ownerId, from, to],
    }),
  ]);

  type Row = Record<string, unknown>;
  const sleepMap = new Map((sleepByNight.rows as unknown as Row[]).map((r) => [String(r.d), Number(r.minutes)]));
  const tasksMap = new Map((tasksByDay.rows as unknown as Row[]).map((r) => [String(r.d), Number(r.total)]));
  const moodMap = new Map((moodByDay.rows as unknown as Row[]).map((r) => [String(r.d), Number(r.mood)]));
  const focusMap = new Map((focusByDay.rows as unknown as Row[]).map((r) => [String(r.d), Number(r.minutes)]));

  // Sono da noite de D vs. tarefas concluídas em D+1.
  const sleepPairsX: number[] = [];
  const sleepPairsY: number[] = [];
  for (const [day, minutes] of sleepMap.entries()) {
    const nextDay = isoDate(addDays(day, 1));
    const completed = tasksMap.get(nextDay);
    if (completed !== undefined) {
      sleepPairsX.push(minutes);
      sleepPairsY.push(completed);
    }
  }

  // Humor médio do dia vs. minutos de foco no mesmo dia.
  const moodPairsX: number[] = [];
  const moodPairsY: number[] = [];
  for (const [day, mood] of moodMap.entries()) {
    const minutes = focusMap.get(day);
    if (minutes !== undefined) {
      moodPairsX.push(mood);
      moodPairsY.push(minutes);
    }
  }

  // Melhor dia da semana: média de tarefas concluídas por dia-da-semana,
  // só retornado se houver pelo menos MIN_PAIRS dias com dado.
  const weekdayTotals = new Map<number, { sum: number; count: number }>();
  for (const [day, total] of tasksMap.entries()) {
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    const entry = weekdayTotals.get(weekday) ?? { sum: 0, count: 0 };
    entry.sum += total;
    entry.count += 1;
    weekdayTotals.set(weekday, entry);
  }
  let bestWeekday: LifeInsights["bestWeekday"] = null;
  if (tasksMap.size >= MIN_PAIRS) {
    let best: { weekday: number; avg: number } | null = null;
    for (const [weekday, entry] of weekdayTotals.entries()) {
      const avg = entry.sum / entry.count;
      if (!best || avg > best.avg) best = { weekday, avg };
    }
    if (best) bestWeekday = { label: WEEKDAY_LABEL[best.weekday], avgCompleted: Math.round(best.avg * 10) / 10 };
  }

  // Média de tarefas concluídas por dia da semana (todos os dias com dado,
  // não só o melhor) — usado no gráfico "Conclusões por dia da semana".
  const weekdayBreakdown = [...weekdayTotals.entries()]
    .map(([weekday, entry]) => ({ weekday, label: WEEKDAY_LABEL[weekday], avgCompleted: Math.round((entry.sum / entry.count) * 10) / 10 }))
    .sort((a, b) => (a.weekday === 0 ? 7 : a.weekday) - (b.weekday === 0 ? 7 : b.weekday));

  const bestHourRow = (focusByHour.rows as unknown as Row[])[0];
  const bestFocusHour =
    bestHourRow && Number(bestHourRow.minutes) > 0
      ? { hour: Number(bestHourRow.hour), totalMinutes: Number(bestHourRow.minutes) }
      : null;

  return {
    from,
    to,
    sleepVsNextDayProductivity: { r: pearson(sleepPairsX, sleepPairsY), pairs: sleepPairsX.length },
    moodVsFocusMinutes: { r: pearson(moodPairsX, moodPairsY), pairs: moodPairsX.length },
    bestWeekday,
    bestFocusHour,
    weekdayBreakdown,
  };
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(dayStr: string, days: number) {
  const d = new Date(`${dayStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}
