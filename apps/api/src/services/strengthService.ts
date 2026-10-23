import type { Client } from "@libsql/client";
import { inferWorkoutCategory, localDateKeyOf, localDayBoundsUtc, normalizeStoredUtc, todayInTz } from "./healthService.js";

/* ============================================================
 * Atributo Força — evolução de musculação e volume de luta.
 *
 * Tudo é derivado das fontes originais (`workouts` + `workout_sets`) a cada
 * requisição: nenhuma cópia de PR ou de nível é gravada. As funções puras
 * (Epley, agrupamento, PRs, nível) ficam exportadas para teste unitário.
 * ============================================================ */

const DAY_MS = 86_400_000;

/** Janela fixa do nível de Força (dias locais, incluindo hoje). */
export const STRENGTH_LEVEL_WINDOW_DAYS = 28;
/** Pontos por sessão de musculação/luta na janela do nível. */
export const POINTS_PER_SESSION = 10;
/** Pontos por PR (carga ou 1RM) batido na janela do nível. */
export const POINTS_PER_PR = 5;
/** Pontos necessários para subir cada nível. */
export const POINTS_PER_LEVEL = 40;
/** Semanas exibidas no resumo de luta. */
export const FIGHT_WEEKS = 8;

export const STRENGTH_LEVEL_FORMULA =
  `Pontos = ${POINTS_PER_SESSION} × sessões de musculação/luta nos últimos ${STRENGTH_LEVEL_WINDOW_DAYS} dias ` +
  `+ ${POINTS_PER_PR} × PRs (carga ou 1RM) batidos nesses ${STRENGTH_LEVEL_WINDOW_DAYS} dias. ` +
  `Nível = 1 + ⌊pontos ÷ ${POINTS_PER_LEVEL}⌋.`;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** 1RM estimado (Epley): carga × (1 + reps/30). */
export function epley1rm(loadKg: number, reps: number) {
  return loadKg * (1 + reps / 30);
}

/** Chave de agrupamento do exercício: trim, minúsculas, sem acento e espaços colapsados. */
export function exerciseKey(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export interface StrengthSetRow {
  workoutId: string;
  performedAt: string;
  exercise: string;
  sets: number | null;
  reps: number | null;
  loadKg: number | null;
}

export interface StrengthSession {
  date: string;
  maxLoadKg: number;
  repsAtMaxLoad: number;
  volumeKg: number;
  est1rmKg: number;
}

export interface StrengthPr {
  value: number;
  date: string;
}

export interface StrengthExercise {
  key: string;
  name: string;
  sessions: StrengthSession[];
  prLoad: StrengthPr;
  pr1rm: StrengthPr;
  prVolume: StrengthPr;
  lastSession: StrengthSession & { newPrLoad: boolean; newPr1rm: boolean; newPrVolume: boolean };
  /** Datas (dia local) em que a carga ou o 1RM superaram tudo o que veio antes (a 1ª sessão não conta). */
  prDates: string[];
}

/**
 * Agrupa as linhas de séries por exercício e por dia local.
 * Regras: só entram linhas com carga > 0 e reps > 0 (sem isso não há carga
 * nem 1RM a comparar); `sets` vazio conta como 1 série no volume. Duas
 * sessões no mesmo dia viram um único ponto (máximos e volume somado).
 */
export function buildStrengthExercises(rows: StrengthSetRow[], tzOffsetMinutes: number): StrengthExercise[] {
  type Acc = { name: string; nameAt: string; days: Map<string, StrengthSession> };
  const groups = new Map<string, Acc>();

  for (const row of rows) {
    const name = row.exercise.trim();
    const load = row.loadKg ?? 0;
    const reps = row.reps ?? 0;
    if (!name || load <= 0 || reps <= 0) continue;
    const key = exerciseKey(name);
    const date = localDateKeyOf(row.performedAt, tzOffsetMinutes);
    const group = groups.get(key) ?? { name, nameAt: row.performedAt, days: new Map<string, StrengthSession>() };
    // Exibe o nome usado no registro mais recente.
    if (Date.parse(normalizeStoredUtc(row.performedAt)) >= Date.parse(normalizeStoredUtc(group.nameAt))) {
      group.name = name;
      group.nameAt = row.performedAt;
    }
    const session = group.days.get(date) ?? { date, maxLoadKg: 0, repsAtMaxLoad: 0, volumeKg: 0, est1rmKg: 0 };
    if (load > session.maxLoadKg) {
      session.maxLoadKg = load;
      session.repsAtMaxLoad = reps;
    } else if (load === session.maxLoadKg && reps > session.repsAtMaxLoad) {
      session.repsAtMaxLoad = reps;
    }
    session.volumeKg += (row.sets ?? 1) * reps * load;
    session.est1rmKg = Math.max(session.est1rmKg, epley1rm(load, reps));
    group.days.set(date, session);
    groups.set(key, group);
  }

  const exercises: StrengthExercise[] = [];
  for (const [key, group] of groups) {
    const sessions = [...group.days.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((s) => ({ ...s, volumeKg: round1(s.volumeKg), est1rmKg: round1(s.est1rmKg) }));
    if (sessions.length === 0) continue;

    // PR = primeiro dia em que o valor máximo foi atingido (comparação estrita).
    const prOf = (pick: (s: StrengthSession) => number): StrengthPr =>
      sessions.reduce<StrengthPr>((best, s) => (pick(s) > best.value ? { value: pick(s), date: s.date } : best), { value: 0, date: sessions[0].date });

    const prDates: string[] = [];
    let bestLoad = sessions[0].maxLoadKg;
    let best1rm = sessions[0].est1rmKg;
    for (const s of sessions.slice(1)) {
      if (s.maxLoadKg > bestLoad || s.est1rmKg > best1rm) prDates.push(s.date);
      bestLoad = Math.max(bestLoad, s.maxLoadKg);
      best1rm = Math.max(best1rm, s.est1rmKg);
    }

    // "Novo PR" só quando a última sessão supera TODAS as anteriores — sem
    // sessão anterior não há recorde a bater.
    const last = sessions[sessions.length - 1];
    const previous = sessions.slice(0, -1);
    const beat = (pick: (s: StrengthSession) => number) => previous.length > 0 && pick(last) > Math.max(...previous.map(pick));

    exercises.push({
      key,
      name: group.name,
      sessions,
      prLoad: prOf((s) => s.maxLoadKg),
      pr1rm: prOf((s) => s.est1rmKg),
      prVolume: prOf((s) => s.volumeKg),
      lastSession: {
        ...last,
        newPrLoad: beat((s) => s.maxLoadKg),
        newPr1rm: beat((s) => s.est1rmKg),
        newPrVolume: beat((s) => s.volumeKg),
      },
      prDates,
    });
  }
  // Mais recentes primeiro; empate → nome.
  return exercises.sort((a, b) => b.lastSession.date.localeCompare(a.lastSession.date) || a.name.localeCompare(b.name, "pt-BR"));
}

export interface FightWorkoutRow {
  performedAt: string;
  durationMinutes: number;
  rounds: number | null;
  roundMinutes: number | null;
  modality: string | null;
}

export interface FightWeek {
  weekStart: string;
  sessions: number;
  rounds: number;
  minutes: number;
}

export interface FightSummary {
  weeks: FightWeek[];
  totalSessions: number;
  totalRounds: number;
  totalMinutes: number;
  biggestSession: { date: string; rounds: number | null; minutes: number; modality: string | null } | null;
}

/** Segunda-feira (YYYY-MM-DD) da semana do dia local informado. */
export function weekStartOf(dateKey: string) {
  const ms = Date.parse(`${dateKey}T00:00:00Z`);
  const weekday = new Date(ms).getUTCDay(); // 0 = domingo
  const back = (weekday + 6) % 7;
  return new Date(ms - back * DAY_MS).toISOString().slice(0, 10);
}

function addDays(dateKey: string, days: number) {
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Luta nas últimas `FIGHT_WEEKS` semanas (segunda a domingo, dia local).
 * Minutos = duração registrada do treino. Maior sessão = mais rounds
 * (empate ou sem rounds → maior duração).
 */
export function buildFightSummary(rows: FightWorkoutRow[], tzOffsetMinutes: number, today: string): FightSummary {
  const currentWeek = weekStartOf(today);
  const weeks: FightWeek[] = Array.from({ length: FIGHT_WEEKS }, (_, i) => ({
    weekStart: addDays(currentWeek, -7 * (FIGHT_WEEKS - 1 - i)),
    sessions: 0,
    rounds: 0,
    minutes: 0,
  }));
  const byWeek = new Map(weeks.map((w) => [w.weekStart, w]));
  let biggest: FightSummary["biggestSession"] = null;

  for (const row of rows) {
    const date = localDateKeyOf(row.performedAt, tzOffsetMinutes);
    const week = byWeek.get(weekStartOf(date));
    if (!week) continue;
    week.sessions += 1;
    week.rounds += row.rounds ?? 0;
    week.minutes += row.durationMinutes;
    const candidate = { date, rounds: row.rounds, minutes: row.durationMinutes, modality: row.modality };
    if (
      !biggest ||
      (candidate.rounds ?? 0) > (biggest.rounds ?? 0) ||
      ((candidate.rounds ?? 0) === (biggest.rounds ?? 0) && candidate.minutes > biggest.minutes)
    ) {
      biggest = candidate;
    }
  }

  return {
    weeks,
    totalSessions: weeks.reduce((s, w) => s + w.sessions, 0),
    totalRounds: weeks.reduce((s, w) => s + w.rounds, 0),
    totalMinutes: weeks.reduce((s, w) => s + w.minutes, 0),
    biggestSession: biggest,
  };
}

export interface StrengthLevel {
  level: number;
  points: number;
  pointsIntoLevel: number;
  pointsPerLevel: number;
  windowDays: number;
  strengthSessions: number;
  fightSessions: number;
  prs: number;
  formula: string;
}

/** Nível de Força — fórmula em STRENGTH_LEVEL_FORMULA (mostrada também na UI). */
export function computeStrengthLevel(strengthSessions: number, fightSessions: number, prs: number): StrengthLevel {
  const points = POINTS_PER_SESSION * (strengthSessions + fightSessions) + POINTS_PER_PR * prs;
  return {
    level: 1 + Math.floor(points / POINTS_PER_LEVEL),
    points,
    pointsIntoLevel: points % POINTS_PER_LEVEL,
    pointsPerLevel: POINTS_PER_LEVEL,
    windowDays: STRENGTH_LEVEL_WINDOW_DAYS,
    strengthSessions,
    fightSessions,
    prs,
    formula: STRENGTH_LEVEL_FORMULA,
  };
}

export interface StrengthReport {
  days: number;
  today: string;
  level: StrengthLevel;
  exercises: StrengthExercise[];
  fight: FightSummary;
}

/**
 * Monta o relatório completo do usuário. Todas as consultas filtram por
 * owner_id (inclusive no JOIN com `workouts`).
 */
export async function getStrengthReport(db: Client, ownerId: string, days: number, tzOffsetMinutes: number): Promise<StrengthReport> {
  const today = todayInTz(tzOffsetMinutes);
  const fightStart = addDays(weekStartOf(today), -7 * (FIGHT_WEEKS - 1));
  const periodStart = addDays(today, -(days - 1));
  const levelStart = addDays(today, -(STRENGTH_LEVEL_WINDOW_DAYS - 1));
  // Uma única leitura de `workouts` cobre a maior das janelas.
  const earliest = [periodStart, fightStart, levelStart].sort()[0];
  const sinceUtc = localDayBoundsUtc(earliest, tzOffsetMinutes).start;
  const periodUtc = localDayBoundsUtc(periodStart, tzOffsetMinutes).start;

  const [setsResult, workoutsResult] = await Promise.all([
    db.execute({
      sql: `SELECT s.workout_id, w.performed_at, s.exercise, s.sets, s.reps, s.load_kg
              FROM workout_sets s
              JOIN workouts w ON w.id = s.workout_id AND w.owner_id = s.owner_id
             WHERE s.owner_id = ? AND w.owner_id = ?
               AND (w.category = 'musculacao' OR w.category IS NULL)
               AND w.performed_at >= ? AND datetime(w.performed_at) >= datetime(?)
             ORDER BY w.performed_at, s.position`,
      // Pré-filtro de texto só com a data (vale para os dois formatos salvos) + comparação exata.
      args: [ownerId, ownerId, periodUtc.slice(0, 10), periodUtc],
    }),
    db.execute({
      sql: `SELECT kind, category, performed_at, duration_minutes, rounds, round_minutes, modality
              FROM workouts
             WHERE owner_id = ? AND performed_at >= ? AND datetime(performed_at) >= datetime(?)`,
      args: [ownerId, sinceUtc.slice(0, 10), sinceUtc],
    }),
  ]);

  const setRows: StrengthSetRow[] = setsResult.rows.map((r) => ({
    workoutId: String(r.workout_id),
    performedAt: String(r.performed_at),
    exercise: String(r.exercise ?? ""),
    sets: r.sets === null ? null : Number(r.sets),
    reps: r.reps === null ? null : Number(r.reps),
    loadKg: r.load_kg === null ? null : Number(r.load_kg),
  }));
  const exercises = buildStrengthExercises(setRows, tzOffsetMinutes);

  // Registros antigos sem `category` têm o tipo inferido do rótulo livre.
  const workouts = workoutsResult.rows.map((r) => ({
    category: typeof r.category === "string" && r.category ? r.category : inferWorkoutCategory(String(r.kind ?? "")),
    date: localDateKeyOf(String(r.performed_at), tzOffsetMinutes),
    row: {
      performedAt: String(r.performed_at),
      durationMinutes: Number(r.duration_minutes ?? 0),
      rounds: r.rounds === null ? null : Number(r.rounds),
      roundMinutes: r.round_minutes === null ? null : Number(r.round_minutes),
      modality: r.modality === null ? null : String(r.modality),
    } satisfies FightWorkoutRow,
  }));

  const inLevelWindow = (date: string) => date >= levelStart && date <= today;
  const strengthSessions = workouts.filter((w) => w.category === "musculacao" && inLevelWindow(w.date)).length;
  const fightSessions = workouts.filter((w) => w.category === "luta" && inLevelWindow(w.date)).length;
  const prs = exercises.reduce((sum, e) => sum + e.prDates.filter(inLevelWindow).length, 0);

  const fight = buildFightSummary(
    workouts.filter((w) => w.category === "luta").map((w) => w.row),
    tzOffsetMinutes,
    today
  );

  return { days, today, level: computeStrengthLevel(strengthSessions, fightSessions, prs), exercises, fight };
}
