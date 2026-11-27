import { randomUUID } from "node:crypto";
import { getDb } from "../db/client.js";
import {
  CODE_ACTIVE_DAYS_TARGET,
  CODE_WEEK_TARGET_COMMITS,
  KNOWLEDGE_WEEK_TARGET_MIN,
  LIFE_DIMS,
  LIFE_WINDOW_DAYS,
  PAPER_MINUTES,
  READING_MIN_PER_PAGE,
  type LifeDim,
} from "../config/lifeScore.js";
import { dayKeyIn, userTimezone } from "./gamificationService.js";
import { utcRangeFilter } from "./healthService.js";
import { localDayOfStored, localDayRangeUtc } from "./localDayService.js";

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

/**
 * Filtro "coluna (timestamp UTC) dentro dos dias locais [fromDay, toDayExclusive)"
 * no fuso do usuário — `date(coluna)` compararia o dia UTC e erraria à noite.
 */
function localDaysFilter(column: string, fromDay: string, toDayExclusive: string, tz: string) {
  return utcRangeFilter(column, localDayRangeUtc(fromDay, tz).start, localDayRangeUtc(toDayExclusive, tz).start);
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
export interface DimensionScore {
  score: number;
  hasData: boolean;
}

/**
 * Produtividade = Missões. Janela dos últimos 7 dias locais (hoje incluso).
 *
 * Toda missão principal (sem pai, não arquivada) cujo prazo — due_date,
 * ou planned_date quando não há prazo — cai na janela entra na conta:
 * - concluída até o dia do prazo: 1 ponto;
 * - concluída depois do prazo: 0,5 ponto;
 * - aberta com prazo já vencido: 0 ponto;
 * - aberta com prazo hoje: fica fora (o dia ainda não acabou).
 * Missão sem prazo (ou com prazo futuro) concluída dentro da janela
 * também conta como 1 de 1 — entregou trabalho real.
 * Sem nenhuma missão para medir na janela, a dimensão fica sem dado
 * (não derruba a média por uma semana sem planejamento).
 */
export async function productivityScore(db: Db, ownerId: string, date: string, tz: string): Promise<DimensionScore & { points: number; total: number }> {
  const from = isoDate(addDays(date, -(LIFE_WINDOW_DAYS - 1)));
  const next = isoDate(addDays(date, 1));
  const doneF = localDaysFilter("completed_at", from, next, tz);
  const result = await db.execute({
    sql: `SELECT status, completed_at, substr(COALESCE(due_date, planned_date), 1, 10) AS target
          FROM tasks
          WHERE owner_id = ? AND parent_task_id IS NULL AND archived_at IS NULL
            AND ((substr(COALESCE(due_date, planned_date), 1, 10) BETWEEN ? AND ?)
                 OR (status = 'Concluído' AND completed_at IS NOT NULL AND ${doneF.sql}))`,
    args: [ownerId, from, date, ...doneF.args],
  });
  let points = 0;
  let total = 0;
  for (const row of result.rows as unknown as Array<{ status: string; completed_at: string | null; target: string | null }>) {
    const done = row.status === "Concluído" && !!row.completed_at;
    const doneDay = done ? localDayOfStored(String(row.completed_at), tz) : null;
    const inWindow = !!row.target && row.target >= from && row.target <= date;
    if (inWindow) {
      if (done) {
        total += 1;
        points += doneDay! <= row.target! ? 1 : 0.5;
      } else if (row.target! < date) {
        total += 1;
      }
    } else if (done && doneDay! >= from && doneDay! <= date) {
      total += 1;
      points += 1;
    }
  }
  if (total === 0) return { score: 0, hasData: false, points: 0, total: 0 };
  return { score: clamp((points / total) * 100), hasData: true, points, total };
}

/** Saúde diária: quatro registros verificáveis, com os mesmos alvos exibidos na tela. */
async function healthScore(db: Db, ownerId: string, date: string, tz: string): Promise<number> {
  const next = isoDate(addDays(date, 1));
  const waterF = localDaysFilter("recorded_at", date, next, tz);
  const waterMl = await scalar(db, `SELECT COALESCE(SUM(amount_ml), 0) FROM water_entries WHERE owner_id = ? AND ${waterF.sql}`, [ownerId, ...waterF.args]);
  const waterScore = clamp((waterMl / 2500) * 100);

  // Noite que termina no dia: deitou entre o início do dia anterior e o fim do dia.
  const sleepF = localDaysFilter("went_to_bed_at", isoDate(addDays(date, -1)), next, tz);
  const sleepRow = await db.execute({
    sql: `SELECT quality, duration_minutes FROM sleep_entries
          WHERE owner_id = ? AND ${sleepF.sql}
          ORDER BY datetime(went_to_bed_at) DESC LIMIT 1`,
    args: [ownerId, ...sleepF.args],
  });
  const sleep = sleepRow.rows[0] as { quality?: number; duration_minutes?: number } | undefined;
  const sleepScore = sleep ? Math.max(
    clamp((Number(sleep.duration_minutes ?? 0) / 480) * 100),
    clamp(Number(sleep.quality ?? 0) * 20)
  ) : 0;

  const workoutF = localDaysFilter("performed_at", date, next, tz);
  const workouts = await scalar(db, `SELECT COUNT(*) FROM workouts WHERE owner_id = ? AND ${workoutF.sql}`, [ownerId, ...workoutF.args]);
  const workoutScore = workouts > 0 ? 100 : 0;
  const moodF = localDaysFilter("recorded_at", date, next, tz);
  const moodCheckIns = await scalar(db, `SELECT COUNT(*) FROM mood_entries WHERE owner_id = ? AND ${moodF.sql}`, [ownerId, ...moodF.args]);
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

/**
 * Conhecimento: minutos de aprendizado nos últimos 7 dias, somando
 * livros (sessões de leitura), podcasts ouvidos, aulas em vídeo
 * concluídas e papers lidos/fichados. Meta: KNOWLEDGE_WEEK_TARGET_MIN.
 * Só fica sem dado quando o usuário nunca usou nenhuma dessas fontes.
 */
export async function knowledgeScore(db: Db, ownerId: string, date: string, tz: string): Promise<DimensionScore & { minutes: number }> {
  const from = isoDate(addDays(date, -(LIFE_WINDOW_DAYS - 1)));
  const next = isoDate(addDays(date, 1));
  const readF = localDaysFilter("started_at", from, next, tz);
  const paperF = localDaysFilter("read_at", from, next, tz);
  const [reading, podcast, lessons, papers, sources] = await Promise.all([
    scalar(db, `SELECT COALESCE(SUM(COALESCE(duration_minutes, pages_read * ${READING_MIN_PER_PAGE})), 0) FROM reading_sessions WHERE owner_id = ? AND ${readF.sql}`, [ownerId, ...readF.args]),
    scalar(db, "SELECT COALESCE(SUM(duration_seconds), 0) / 60.0 FROM podcast_listens WHERE owner_id = ? AND day_key BETWEEN ? AND ?", [ownerId, from, date]),
    scalar(db, "SELECT COALESCE(SUM(duration_seconds), 0) / 60.0 FROM video_lessons WHERE owner_id = ? AND done_day BETWEEN ? AND ?", [ownerId, from, date]),
    scalar(db, `SELECT COUNT(*) FROM user_papers WHERE owner_id = ? AND read_at IS NOT NULL AND ${paperF.sql}`, [ownerId, ...paperF.args]),
    scalar(
      db,
      `SELECT (SELECT COUNT(*) FROM books WHERE owner_id = ?1) + (SELECT COUNT(*) FROM podcast_follows WHERE owner_id = ?1)
            + (SELECT COUNT(*) FROM podcast_listens WHERE owner_id = ?1) + (SELECT COUNT(*) FROM video_courses WHERE owner_id = ?1)
            + (SELECT COUNT(*) FROM user_papers WHERE owner_id = ?1)`,
      [ownerId]
    ),
  ]);
  const minutes = Math.round(reading + podcast + lessons + papers * PAPER_MINUTES);
  if (sources === 0 && minutes === 0) return { score: 0, hasData: false, minutes: 0 };
  return { score: clamp((minutes / KNOWLEDGE_WEEK_TARGET_MIN) * 100), hasData: true, minutes };
}

/**
 * Código: últimos 7 dias, por VOLUME de commits (meta CODE_WEEK_TARGET_COMMITS,
 * 80% da nota) mais constância (dias com commit ou estrela do Advent of Code,
 * meta CODE_ACTIVE_DAYS_TARGET, 20%). Por dia vale o maior entre os commits
 * coletados dos repositórios e a contagem de contribuições do GitHub — assim
 * os dois modos da Forja (público e token) contam sem somar o mesmo commit duas vezes.
 * O tempo de editor do WakaTime não entra mais (a pedido do usuário: contava muito pouco).
 * Sem GitHub nem Advent of Code conectados, a dimensão fica sem dado.
 */
export async function codeScore(db: Db, ownerId: string, date: string, tz: string): Promise<DimensionScore & { commits: number; activeDays: number }> {
  const from = isoDate(addDays(date, -(LIFE_WINDOW_DAYS - 1)));
  const [conn, events, contrib, stars] = await Promise.all([
    db.execute({
      sql: `SELECT (SELECT COUNT(*) FROM code_integrations WHERE owner_id = ?1) AS gh,
                   (SELECT COUNT(*) FROM aoc_accounts WHERE owner_id = ?1) AS aoc`,
      args: [ownerId],
    }),
    db.execute({ sql: "SELECT day_key, COUNT(*) AS n FROM code_events WHERE owner_id = ? AND kind = 'commit' AND day_key BETWEEN ? AND ? GROUP BY day_key", args: [ownerId, from, date] }),
    db.execute({ sql: "SELECT day_key, count FROM code_contrib_days WHERE owner_id = ? AND count > 0 AND day_key BETWEEN ? AND ?", args: [ownerId, from, date] }),
    db.execute({ sql: "SELECT earned_at FROM aoc_stars WHERE owner_id = ? AND earned_at >= ?", args: [ownerId, isoDate(addDays(from, -1))] }),
  ]);
  const c = conn.rows[0] as unknown as { gh: number; aoc: number } | undefined;
  if (Number(c?.gh ?? 0) === 0 && Number(c?.aoc ?? 0) === 0) return { score: 0, hasData: false, commits: 0, activeDays: 0 };
  const perDay = new Map<string, number>();
  for (const r of events.rows) perDay.set(String(r.day_key), Math.max(perDay.get(String(r.day_key)) ?? 0, Number(r.n)));
  for (const r of contrib.rows) perDay.set(String(r.day_key), Math.max(perDay.get(String(r.day_key)) ?? 0, Number(r.count)));
  const commits = [...perDay.values()].reduce((a, b) => a + b, 0);
  const days = new Set([...perDay.entries()].filter(([, n]) => n > 0).map(([d]) => d));
  for (const r of stars.rows) {
    const d = localDayOfStored(String(r.earned_at), tz);
    if (d >= from && d <= date) days.add(d);
  }
  const score = clamp(0.8 * clamp((commits / CODE_WEEK_TARGET_COMMITS) * 100) + 0.2 * clamp((days.size / CODE_ACTIVE_DAYS_TARGET) * 100));
  return { score, hasData: true, commits, activeDays: days.size };
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
  habits: number;
  education: number;
  knowledge: number;
  code: number;
  /** Dimensões sem nenhum dado (fora da média do overall). */
  missing: LifeDim[];
  /** Números reais por trás das dimensões semanais (para explicar a nota na tela). */
  details: {
    missionsPoints: number;
    missionsTotal: number;
    knowledgeMinutes: number;
    codeCommits: number;
    codeActiveDays: number;
  };
}

export async function computeLifeScore(ownerId: string, dateArg?: string): Promise<LifeScoreBreakdown> {
  const db = getDb();
  const tz = await userTimezone(db, ownerId);
  // Sem data explícita, "hoje" é o dia no fuso do usuário (nunca o dia UTC).
  const date = dateArg ?? dayKeyIn(new Date(), tz);
  const [productivity, health, habits, education, knowledge, code] = await Promise.all([
    productivityScore(db, ownerId, date, tz),
    healthScore(db, ownerId, date, tz).then(toHealthDimension),
    habitsScore(db, ownerId, date),
    educationScore(db, ownerId),
    knowledgeScore(db, ownerId, date, tz),
    codeScore(db, ownerId, date, tz),
  ]);

  // "overall" é a média só das dimensões com dado real (hasData): módulo
  // nunca usado (nenhuma integração de código, nenhuma formação...) não é
  // o mesmo que "fez 0%" e não derruba o Life Score. Saúde e Hábitos são
  // dimensões "do dia" e sempre contam quando existem.
  const dims: Record<LifeDim, DimensionScore> = { productivity, health, habits, education, knowledge, code };
  const withData = LIFE_DIMS.filter((d) => dims[d].hasData);
  const overall = withData.length > 0 ? clamp(withData.reduce((a, d) => a + dims[d].score, 0) / withData.length) : 0;

  return {
    date,
    overall,
    productivity: productivity.score,
    health: health.score,
    habits: habits.score,
    education: education.score,
    knowledge: knowledge.score,
    code: code.score,
    missing: LIFE_DIMS.filter((d) => !dims[d].hasData),
    details: {
      missionsPoints: productivity.points,
      missionsTotal: productivity.total,
      knowledgeMinutes: knowledge.minutes,
      codeCommits: code.commits,
      codeActiveDays: code.activeDays,
    },
  };
}

/**
 * Grava (ou atualiza) o snapshot do Life Score do dia em life_scores — fonte do histórico real.
 * As colunas antigas (reading, professional, goals) ficam nulas a partir daqui; dimensão
 * sem dado também é gravada como NULL, para o histórico não confundir "sem dado" com 0.
 */
export async function saveLifeScoreSnapshot(ownerId: string, score: LifeScoreBreakdown): Promise<void> {
  const db = getDb();
  const v = (d: LifeDim) => (score.missing.includes(d) ? null : Math.round(score[d]));
  await db.execute({
    sql: `INSERT INTO life_scores (id, owner_id, score_date, overall_score, productivity, health, habits, education, knowledge, code, reading, professional, goals)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
          ON CONFLICT (owner_id, score_date) DO UPDATE SET
            overall_score = excluded.overall_score, productivity = excluded.productivity, health = excluded.health,
            habits = excluded.habits, education = excluded.education, knowledge = excluded.knowledge, code = excluded.code,
            reading = NULL, professional = NULL, goals = NULL`,
    args: [
      // id aleatório: o único conflito possível é (owner_id, score_date), alvo do UPSERT.
      randomUUID(),
      ownerId,
      score.date,
      Math.round(score.overall),
      v("productivity"),
      v("health"),
      v("habits"),
      v("education"),
      v("knowledge"),
      v("code"),
    ],
  });
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
  const tz = await userTimezone(db, ownerId);
  const f = (column: string) => localDaysFilter(column, from, to, tz);
  const done = f("updated_at");
  const created = f("created_at");
  const reading = f("started_at");
  const workout = f("performed_at");

  const [tasksCompleted, tasksPlanned, pagesRead, workouts, readingMinutes, workoutMinutes, habitsTotal, habitsDone] = await Promise.all([
    scalar(db, `SELECT COUNT(*) FROM tasks WHERE owner_id = ? AND status = 'Concluído' AND ${done.sql}`, [ownerId, ...done.args]),
    // "Planejadas": todas as tarefas criadas no período, concluídas ou não —
    // o denominador real de "48 de 100 planejadas", nunca uma meta inventada.
    scalar(db, `SELECT COUNT(*) FROM tasks WHERE owner_id = ? AND ${created.sql}`, [ownerId, ...created.args]),
    scalar(db, `SELECT COALESCE(SUM(pages_read), 0) FROM reading_sessions WHERE owner_id = ? AND ${reading.sql}`, [ownerId, ...reading.args]),
    scalar(db, `SELECT COUNT(*) FROM workouts WHERE owner_id = ? AND ${workout.sql}`, [ownerId, ...workout.args]),
    scalar(db, `SELECT COALESCE(SUM(duration_minutes), 0) FROM reading_sessions WHERE owner_id = ? AND ${reading.sql}`, [ownerId, ...reading.args]),
    scalar(db, `SELECT COALESCE(SUM(duration_minutes), 0) FROM workouts WHERE owner_id = ? AND ${workout.sql}`, [ownerId, ...workout.args]),
    scalar(
      db,
      "SELECT COUNT(*) * CAST(julianday(?) - julianday(?) AS INTEGER) FROM habits WHERE owner_id = ? AND archived_at IS NULL",
      [to, from, ownerId]
    ),
    // entry_date já é o dia local do check-in.
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
  // Agrupamento por dia local feito aqui (o `date()` do SQLite daria o dia UTC).
  const tz = await userTimezone(db, ownerId);
  const toExcl = isoDate(addDays(to, 1));
  const sleepF = localDaysFilter("went_to_bed_at", from, toExcl, tz);
  const tasksF = localDaysFilter("updated_at", from, toExcl, tz);
  const [sleepRows, taskRows] = await Promise.all([
    db.execute({
      sql: `SELECT went_to_bed_at AS at, duration_minutes AS minutes FROM sleep_entries
            WHERE owner_id = ? AND duration_minutes IS NOT NULL AND ${sleepF.sql}`,
      args: [ownerId, ...sleepF.args],
    }),
    db.execute({
      sql: `SELECT updated_at AS at FROM tasks WHERE owner_id = ? AND status = 'Concluído' AND ${tasksF.sql}`,
      args: [ownerId, ...tasksF.args],
    }),
  ]);

  type Row = Record<string, unknown>;
  const sleepAcc = new Map<string, { sum: number; n: number }>();
  for (const r of sleepRows.rows as unknown as Row[]) {
    const day = localDayOfStored(String(r.at), tz);
    const acc = sleepAcc.get(day) ?? { sum: 0, n: 0 };
    acc.sum += Number(r.minutes);
    acc.n += 1;
    sleepAcc.set(day, acc);
  }
  const sleepMap = new Map([...sleepAcc].map(([d, a]) => [d, a.sum / a.n]));
  const tasksMap = new Map<string, number>();
  for (const r of taskRows.rows as unknown as Row[]) {
    const day = localDayOfStored(String(r.at), tz);
    tasksMap.set(day, (tasksMap.get(day) ?? 0) + 1);
  }

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
