import { getDb } from "../db/client.js";
import { isDailyReadingGoal, pagesReadOn } from "./dailyReadingGoalService.js";

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

/**
 * Uma dimensão do Life Score pode não ter dado nenhum ainda (usuário
 * nunca criou uma tarefa, nunca vinculou um projeto profissional,
 * não tem nenhuma meta ativa...). `hasData: false` marca isso — é o
 * que diferencia "fez 0% do que existe" (conta contra a média) de
 * "não existe nada aqui pra medir ainda" (não deveria puxar a média
 * geral pra baixo só porque o módulo nunca foi usado). Ver
 * computeLifeScore, que usa esse flag pra montar o `overall`.
 */
interface DimensionScore {
  score: number;
  hasData: boolean;
}

/** Produtividade: % de tarefas concluídas sobre o total já criado. */
async function productivityScore(db: Db, ownerId: string): Promise<DimensionScore> {
  const total = await scalar(db, "SELECT COUNT(*) FROM tasks WHERE owner_id = ?", [ownerId]);
  if (total === 0) return { score: 0, hasData: false };
  const done = await scalar(db, "SELECT COUNT(*) FROM tasks WHERE owner_id = ? AND status = 'Concluído'", [ownerId]);
  return { score: clamp((done / total) * 100), hasData: true };
}

/**
 * Profissional: mesmo cálculo, restrito a tarefas vinculadas a um
 * projeto "professional"/"workspace" (ver seletor de projeto no
 * TaskModal — sem vincular, a tarefa não entra aqui mesmo sendo
 * trabalho de verdade).
 */
async function professionalScore(db: Db, ownerId: string): Promise<DimensionScore> {
  const total = await scalar(
    db,
    `SELECT COUNT(*) FROM tasks t JOIN projects p ON p.id = t.project_id
     WHERE t.owner_id = ? AND p.kind IN ('professional', 'workspace')`,
    [ownerId]
  );
  if (total === 0) return { score: 0, hasData: false };
  const done = await scalar(
    db,
    `SELECT COUNT(*) FROM tasks t JOIN projects p ON p.id = t.project_id
     WHERE t.owner_id = ? AND p.kind IN ('professional', 'workspace') AND t.status = 'Concluído'`,
    [ownerId]
  );
  return { score: clamp((done / total) * 100), hasData: true };
}

/** Saúde diária: quatro registros verificáveis, com os mesmos alvos exibidos na tela. */
async function healthScore(db: Db, ownerId: string, date: string): Promise<number> {
  const waterMl = await scalar(
    db,
    "SELECT COALESCE(SUM(amount_ml), 0) FROM water_entries WHERE owner_id = ? AND date(recorded_at) = date(?)",
    [ownerId, date]
  );
  const waterScore = clamp((waterMl / 2500) * 100);

  const sleepRow = await db.execute({
    sql: `SELECT quality, duration_minutes FROM sleep_entries
          WHERE owner_id = ? AND date(went_to_bed_at) BETWEEN date(?, '-1 day') AND date(?)
          ORDER BY went_to_bed_at DESC LIMIT 1`,
    args: [ownerId, date, date],
  });
  const sleep = sleepRow.rows[0] as { quality?: number; duration_minutes?: number } | undefined;
  const sleepScore = sleep ? Math.max(
    clamp((Number(sleep.duration_minutes ?? 0) / 480) * 100),
    clamp(Number(sleep.quality ?? 0) * 20)
  ) : 0;

  const workouts = await scalar(
    db,
    "SELECT COUNT(*) FROM workouts WHERE owner_id = ? AND date(performed_at) = date(?)",
    [ownerId, date]
  );
  const workoutScore = workouts > 0 ? 100 : 0;
  const moodCheckIns = await scalar(
    db,
    "SELECT COUNT(*) FROM mood_entries WHERE owner_id = ? AND date(recorded_at) = date(?)",
    [ownerId, date]
  );
  const moodScore = moodCheckIns > 0 ? 100 : 0;

  return clamp((waterScore + sleepScore + workoutScore + moodScore) / 4);
}

/** Educação: progresso médio das formações a partir das tarefas dos projetos acadêmicos. */
async function educationScore(db: Db, ownerId: string): Promise<DimensionScore> {
  const result = await db.execute({
    sql: `SELECT e.id,
                 COUNT(t.id) as total,
                 SUM(CASE WHEN t.status = 'Concluído' THEN 1 ELSE 0 END) as done
          FROM educations e
          LEFT JOIN academic_projects ap ON ap.education_id = e.id AND ap.owner_id = e.owner_id
          LEFT JOIN tasks t ON t.project_id = ap.project_id AND t.owner_id = e.owner_id
          WHERE e.owner_id = ?
          GROUP BY e.id`,
    args: [ownerId],
  });
  const rows = result.rows as unknown as Array<{ total: number; done: number | null }>;
  if (rows.length === 0) return { score: 0, hasData: false };
  const scores = rows.map((row) => {
    const total = Number(row.total ?? 0);
    const done = Number(row.done ?? 0);
    return total > 0 ? clamp((done / total) * 100) : 0;
  });
  return { score: clamp(scores.reduce((a, b) => a + b, 0) / scores.length), hasData: true };
}

function goalProgressScore(goal: { kind: string; status: string; target_value: number | null; current_value: number }) {
  if (goal.status === "done") return 100;
  if (goal.kind === "percentage" || goal.kind === "task_based") return clamp(goal.current_value);
  if (goal.kind === "numeric" && goal.target_value) return clamp((goal.current_value / goal.target_value) * 100);
  if (goal.kind === "binary") return 0;
  return 0;
}

/**
 * Leitura: se houver uma meta ativa de páginas/leitura (ex.: 20 páginas
 * por dia), a nota usa páginas lidas hoje contra essa meta. Sem essa
 * meta cadastrada, cai para o progresso real dos livros em leitura.
 */
async function readingScore(db: Db, ownerId: string, date: string): Promise<DimensionScore> {
  const readingGoals = await db.execute({
    sql: "SELECT title, kind, unit, status, target_value FROM goals WHERE owner_id = ? AND status = 'active' AND kind = 'numeric' AND target_value > 0",
    args: [ownerId],
  });
  const dailyTarget = Math.min(...(readingGoals.rows as unknown as Array<{ title: string; kind: string; unit: string | null; status: string; target_value: number }>)
    .filter(isDailyReadingGoal).map((goal) => Number(goal.target_value)));
  if (Number.isFinite(dailyTarget) && dailyTarget > 0) {
    const pagesToday = await pagesReadOn(db, ownerId, date);
    return { score: clamp((pagesToday / dailyTarget) * 100), hasData: true };
  }

  const result = await db.execute({
    sql: `SELECT current_page, total_pages FROM books
          WHERE owner_id = ? AND status = 'Lendo' AND total_pages IS NOT NULL AND total_pages > 0`,
    args: [ownerId],
  });
  const rows = result.rows as unknown as Array<{ current_page: number; total_pages: number }>;
  if (rows.length === 0) return { score: 0, hasData: false };
  const avg = rows.reduce((sum, b) => sum + b.current_page / b.total_pages, 0) / rows.length;
  return { score: clamp(avg * 100), hasData: true };
}

/**
 * Hábitos: % dos hábitos ativos com check-in registrado hoje. É uma
 * dimensão "do dia" (diferente de profissional/educação/leitura, que
 * são acumulados de vida inteira) — 0% aqui significa "não fez os
 * hábitos hoje", um sinal real, não "módulo nunca usado". Só marca
 * sem dado quando não existe NENHUM hábito cadastrado.
 */
async function habitsScore(db: Db, ownerId: string, date: string): Promise<DimensionScore> {
  const total = await scalar(db, "SELECT COUNT(*) FROM habits WHERE owner_id = ? AND archived_at IS NULL", [ownerId]);
  if (total === 0) return { score: 0, hasData: false };
  const checkedIn = await scalar(
    db,
    `SELECT COUNT(*) FROM habit_entries he JOIN habits h ON h.id = he.habit_id
     WHERE he.owner_id = ? AND he.entry_date = ? AND h.archived_at IS NULL AND he.count >= h.target_count`,
    [ownerId, date]
  );
  return { score: clamp((checkedIn / total) * 100), hasData: true };
}

/**
 * Metas: calcula cada meta com sua lógica real e depois equilibra por
 * período (semanal/mensal/semestral/anual). Assim uma meta semanal
 * concluída e uma anual concluída contam como períodos vencidos, sem
 * uma pilha de metas de um período diluir todos os outros.
 */
function goalPeriodStart(period: string | null, date: string) {
  const year = date.slice(0, 4);
  if (period === "anual") return `${year}-01-01`;
  if (period === "semestral") return `${year}-${date.slice(5, 7) <= "06" ? "01" : "07"}-01`;
  if (period === "mensal") return `${date.slice(0, 7)}-01`;
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - (period === "semanal" ? (day.getUTCDay() + 6) % 7 : 29));
  return day.toISOString().slice(0, 10);
}

async function goalsScore(db: Db, ownerId: string, date: string): Promise<DimensionScore> {
  const result = await db.execute({
    sql: "SELECT id, parent_goal_id, title, kind, unit, status, target_value, current_value, period, completed_at, due_date FROM goals WHERE owner_id = ? AND status != 'abandoned'",
    args: [ownerId],
  });
  const rows = (result.rows as unknown as Array<{
    id: string;
    parent_goal_id: string | null;
    title: string;
    kind: string;
    unit: string | null;
    status: string;
    target_value: number | null;
    current_value: number;
    period: string | null;
    completed_at: string | null;
    due_date: string | null;
  }>).filter((goal) => {
    if (goal.status === "done") {
      return !!(goal.completed_at && goal.completed_at.slice(0, 10) >= goalPeriodStart(goal.period, date) && goal.completed_at.slice(0, 10) <= date);
    }
    // Meta ativa com prazo vencido e nunca concluída/renovada: sem isso,
    // um valor antigo "congelado" arrastava a nota do período pra
    // sempre, mesmo com o usuário nunca mais tocando na meta.
    if (goal.due_date && goal.due_date.slice(0, 10) < date) return false;
    return true;
  });
  if (rows.length === 0) return { score: 0, hasData: false };
  const pagesToday = rows.some(isDailyReadingGoal) ? await pagesReadOn(db, ownerId, date) : 0;

  const childrenByParent = new Map<string, typeof rows>();
  for (const goal of rows) {
    if (!goal.parent_goal_id) continue;
    const children = childrenByParent.get(goal.parent_goal_id) ?? [];
    children.push(goal);
    childrenByParent.set(goal.parent_goal_id, children);
  }

  const scoreCache = new Map<string, number>();
  const scoreGoal = (goal: (typeof rows)[number]): number => {
    if (scoreCache.has(goal.id)) return scoreCache.get(goal.id)!;
    const children = childrenByParent.get(goal.id) ?? [];
    const score =
      goal.status === "done"
        ? 100
        : goal.kind === "task_based" && children.length > 0
          ? clamp(children.reduce((sum, child) => sum + scoreGoal(child), 0) / children.length)
          : goalProgressScore(isDailyReadingGoal(goal) ? { ...goal, current_value: pagesToday } : goal);
    scoreCache.set(goal.id, score);
    return score;
  };

  const periodBuckets = new Map<string, number[]>();
  for (const goal of rows) {
    // Submetas alimentam a meta pai e não devem contar duas vezes no
    // Life Score global, a menos que sejam metas soltas sem pai.
    if (goal.parent_goal_id) continue;
    const period = goal.period ?? "sem_periodo";
    const bucket = periodBuckets.get(period) ?? [];
    bucket.push(scoreGoal(goal));
    periodBuckets.set(period, bucket);
  }

  const periodScores = [...periodBuckets.values()].map((scores) => scores.reduce((sum, score) => sum + score, 0) / scores.length);
  return { score: clamp(periodScores.reduce((sum, score) => sum + score, 0) / periodScores.length), hasData: true };
}

/**
 * Saúde é sempre contabilizada (hasData: true) — assim como hábitos,
 * é uma dimensão "do dia": 0% significa "não bebeu água/dormiu
 * mal/não treinou hoje", sinal real que deve pesar na média, não
 * "módulo nunca usado".
 */
function toHealthDimension(score: number): DimensionScore {
  return { score, hasData: true };
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
    healthScore(db, ownerId, date).then(toHealthDimension),
    educationScore(db, ownerId),
    readingScore(db, ownerId, date),
    habitsScore(db, ownerId, date),
    professionalScore(db, ownerId),
    goalsScore(db, ownerId, date),
  ]);

  // "overall" é a média só das dimensões com dado real (hasData). Uma
  // dimensão sem nenhum dado (ex.: nunca vinculou tarefa a um projeto
  // profissional, nunca cadastrou uma formação, nenhuma meta ativa)
  // antes entrava como 0 na média e derrubava o Life Score mesmo sem
  // ter nada de fato "errado" — módulo nunca usado não é a mesma
  // coisa que "fez 0% do que deveria". Health e Hábitos são exceção:
  // são dimensões "do dia" e sempre contam (0% ali é sinal real).
  const dims = [productivity, health, education, reading, habits, professional, goals];
  const withData = dims.filter((d) => d.hasData);
  const overall = withData.length > 0 ? clamp(withData.reduce((a, b) => a + b.score, 0) / withData.length) : 0;

  return {
    date,
    overall,
    productivity: productivity.score,
    health: health.score,
    education: education.score,
    reading: reading.score,
    habits: habits.score,
    professional: professional.score,
    goals: goals.score,
  };
}

export interface RangeMetrics {
  from: string;
  to: string;
  tasksCompleted: number;
  tasksPlanned: number;
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

  const [tasksCompleted, tasksPlanned, pagesRead, workouts, readingMinutes, workoutMinutes, habitsTotal, habitsDone] = await Promise.all([
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
  bestWeekday: { label: string; avgCompleted: number } | null;
  weekdayBreakdown: Array<{ weekday: number; label: string; avgCompleted: number }>;
}

const WEEKDAY_LABEL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export async function computeInsights(ownerId: string, from: string, to: string): Promise<LifeInsights> {
  const db = getDb();

  // 1) Sono (minutos, por noite) vs. tarefas concluídas no dia seguinte.
  const [sleepByNight, tasksByDay] = await Promise.all([
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
  ]);

  type Row = Record<string, unknown>;
  const sleepMap = new Map((sleepByNight.rows as unknown as Row[]).map((r) => [String(r.d), Number(r.minutes)]));
  const tasksMap = new Map((tasksByDay.rows as unknown as Row[]).map((r) => [String(r.d), Number(r.total)]));

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

  return {
    from,
    to,
    sleepVsNextDayProductivity: { r: pearson(sleepPairsX, sleepPairsY), pairs: sleepPairsX.length },
    bestWeekday,
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
