import type { getDb } from "../db/client.js";
import { DONE_STATUS, getProjectWorkload, shiftDays, type WorkloadSummary } from "./workloadService.js";

type Db = ReturnType<typeof getDb>;

/**
 * Visão Profissional — cruza o trabalho (tarefas de projetos kind='professional',
 * cronômetro/foco) com os outros módulos do LifeOS: Saúde (sono, humor/energia,
 * exercícios), Hábitos, Reuniões/anotações, Diário e Metas de carreira.
 *
 * Regras de honestidade:
 *  - todo número vem de uma consulta real;
 *  - comparações ("dias com X vs sem X") só aparecem com amostra mínima
 *    (MIN_DAYS em cada grupo) — caso contrário voltam com `reason`;
 *  - comparação não é causalidade: a UI apresenta como associação observada.
 */

const WINDOW_DAYS = 60;
const MIN_DAYS = 3;

export interface DailyPoint {
  day: string;
  done: number;
  loggedMinutes: number;
  meetings: number;
  sleepHours: number | null;
  energy: number | null;
}

export interface Comparison {
  key: "sleep" | "energy" | "workout" | "habits" | "meetings";
  label: string;
  withLabel: string;
  withoutLabel: string;
  withDays: number;
  withoutDays: number;
  withAvgDone: number | null;
  withoutAvgDone: number | null;
  withAvgMinutes: number | null;
  withoutAvgMinutes: number | null;
  /** Variação % de tarefas concluídas (grupo "com" vs "sem"); null sem amostra. */
  deltaPct: number | null;
  reason: string | null;
}

export interface ProfessionalOverview {
  today: string;
  windowDays: number;
  kpis: {
    open: number;
    overdue: number;
    dueThisWeek: number;
    done7: number;
    donePrev7: number;
    logged7: number;
    loggedPrev7: number;
    meetings30: number;
    remainingMinutes: number;
    unestimatedOpen: number;
  };
  daily: DailyPoint[];
  weekday: Array<{ weekday: number; label: string; done: number }>;
  bestWeekday: { label: string; done: number } | null;
  comparisons: Comparison[];
  workload: WorkloadSummary;
  upcoming: Array<{ id: string; title: string; projectName: string; projectColor: string | null; dueDate: string; priorityScore: number | null; status: string }>;
  careerGoals: Array<{ id: string; title: string; pct: number; dueDate: string | null }>;
  journal: { linkedEntries30: number; recent: Array<{ date: string; projectName: string; preview: string | null }> };
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const num = (v: unknown) => Number(v ?? 0);
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

function toMap(rows: unknown[]) {
  return new Map((rows as Array<{ day: string; v: number }>).map((r) => [String(r.day), num(r.v)]));
}

function compare(
  base: Omit<Comparison, "withDays" | "withoutDays" | "withAvgDone" | "withoutAvgDone" | "withAvgMinutes" | "withoutAvgMinutes" | "deltaPct" | "reason">,
  withGroup: DailyPoint[],
  withoutGroup: DailyPoint[]
): Comparison {
  const enough = withGroup.length >= MIN_DAYS && withoutGroup.length >= MIN_DAYS;
  const wDone = avg(withGroup.map((d) => d.done));
  const woDone = avg(withoutGroup.map((d) => d.done));
  return {
    ...base,
    withDays: withGroup.length,
    withoutDays: withoutGroup.length,
    withAvgDone: enough ? wDone : null,
    withoutAvgDone: enough ? woDone : null,
    withAvgMinutes: enough ? avg(withGroup.map((d) => d.loggedMinutes)) : null,
    withoutAvgMinutes: enough ? avg(withoutGroup.map((d) => d.loggedMinutes)) : null,
    deltaPct: enough && wDone !== null && woDone !== null && woDone > 0 ? Math.round(((wDone - woDone) / woDone) * 100) : null,
    reason: enough ? null : `Precisa de pelo menos ${MIN_DAYS} dias em cada grupo (hoje: ${withGroup.length} e ${withoutGroup.length}).`,
  };
}

export async function getProfessionalOverview(db: Db, ownerId: string, today: string): Promise<ProfessionalOverview> {
  const from = shiftDays(today, -WINDOW_DAYS);
  const proTask = `t.project_id IN (SELECT id FROM projects WHERE owner_id = ? AND kind = 'professional')`;

  const [doneRes, timeRes, focusRes, sleepRes, moodRes, workoutRes, habitsRes, notesRes, firstRes, upcomingRes, goalsRes, journalCountRes, journalRecentRes, workload] =
    await Promise.all([
      db.execute({
        sql: `SELECT date(COALESCE(t.completed_at, t.updated_at)) AS day, COUNT(*) AS v FROM tasks t
              WHERE t.owner_id = ? AND t.status = ? AND ${proTask} AND date(COALESCE(t.completed_at, t.updated_at)) > date(?)
              GROUP BY day`,
        args: [ownerId, DONE_STATUS, ownerId, from],
      }),
      db.execute({
        sql: `SELECT date(e.started_at) AS day, SUM(COALESCE(e.duration_minutes, 0)) AS v FROM time_entries e
              JOIN tasks t ON t.id = e.task_id AND t.owner_id = e.owner_id
              WHERE e.owner_id = ? AND e.ended_at IS NOT NULL AND ${proTask} AND date(e.started_at) > date(?)
              GROUP BY day`,
        args: [ownerId, ownerId, from],
      }),
      db.execute({
        sql: `SELECT date(f.started_at) AS day, SUM(COALESCE(f.actual_minutes, 0)) AS v FROM focus_sessions f
              LEFT JOIN tasks t ON t.id = f.task_id AND t.owner_id = f.owner_id
              WHERE f.owner_id = ? AND date(f.started_at) > date(?)
                AND COALESCE(f.project_id, t.project_id) IN (SELECT id FROM projects WHERE owner_id = ? AND kind = 'professional')
              GROUP BY day`,
        args: [ownerId, from, ownerId],
      }),
      // Sono atribuído ao dia em que a pessoa acordou (a noite "antes" do dia de trabalho).
      db.execute({
        sql: `SELECT date(woke_up_at) AS day, SUM(duration_minutes) / 60.0 AS v FROM sleep_entries
              WHERE owner_id = ? AND duration_minutes IS NOT NULL AND date(woke_up_at) > date(?) GROUP BY day`,
        args: [ownerId, from],
      }),
      db.execute({
        sql: `SELECT date(recorded_at) AS day, AVG(energy) AS v FROM mood_entries WHERE owner_id = ? AND date(recorded_at) > date(?) GROUP BY day`,
        args: [ownerId, from],
      }),
      db.execute({
        sql: `SELECT date(performed_at) AS day, COUNT(*) AS v FROM workouts WHERE owner_id = ? AND date(performed_at) > date(?) GROUP BY day`,
        args: [ownerId, from],
      }),
      db.execute({
        sql: `SELECT he.entry_date AS day, COUNT(*) AS v FROM habit_entries he JOIN habits h ON h.id = he.habit_id
              WHERE he.owner_id = ? AND h.owner_id = he.owner_id AND he.count >= h.target_count AND he.entry_date > ? GROUP BY day`,
        args: [ownerId, from],
      }),
      db.execute({
        sql: `SELECT occurred_at AS day, COUNT(*) AS v FROM work_notes WHERE owner_id = ? AND occurred_at > ? GROUP BY day`,
        args: [ownerId, from],
      }),
      // Primeiro dia com trabalho profissional cadastrado: dias anteriores não entram nas comparações.
      db.execute({
        sql: `SELECT MIN(date(t.created_at)) AS first FROM tasks t WHERE t.owner_id = ? AND ${proTask}`,
        args: [ownerId, ownerId],
      }),
      db.execute({
        sql: `SELECT t.id, t.title, t.status, t.due_date, t.priority_score, p.name AS project_name, p.color AS project_color
              FROM tasks t JOIN projects p ON p.id = t.project_id AND p.owner_id = t.owner_id
              WHERE t.owner_id = ? AND p.kind = 'professional' AND t.status != ? AND t.due_date IS NOT NULL AND date(t.due_date) <= date(?)
              ORDER BY date(t.due_date) ASC, t.priority_score DESC LIMIT 8`,
        args: [ownerId, DONE_STATUS, shiftDays(today, 14)],
      }),
      db.execute({
        sql: `SELECT id, title, kind, target_value, current_value, due_date FROM goals
              WHERE owner_id = ? AND status = 'active' AND category = 'Carreira' ORDER BY due_date IS NULL, due_date ASC LIMIT 6`,
        args: [ownerId],
      }),
      db.execute({
        sql: `SELECT COUNT(DISTINCT l.entry_id) AS n FROM journal_entry_links l
              JOIN journal_entries e ON e.id = l.entry_id AND e.owner_id = l.owner_id
              JOIN projects p ON p.id = l.target_id AND p.owner_id = l.owner_id
              WHERE l.owner_id = ? AND l.target_type = 'project' AND p.kind = 'professional' AND e.entry_date > ?`,
        args: [ownerId, shiftDays(today, -30)],
      }),
      db.execute({
        sql: `SELECT e.entry_date, e.thoughts, e.intention, p.name AS project_name FROM journal_entry_links l
              JOIN journal_entries e ON e.id = l.entry_id AND e.owner_id = l.owner_id
              JOIN projects p ON p.id = l.target_id AND p.owner_id = l.owner_id
              WHERE l.owner_id = ? AND l.target_type = 'project' AND p.kind = 'professional'
              ORDER BY e.entry_date DESC LIMIT 3`,
        args: [ownerId],
      }),
      getProjectWorkload(db, ownerId, { today, days: 30, kind: "professional" }),
    ]);

  const doneMap = toMap(doneRes.rows as unknown[]);
  const loggedMap = toMap(timeRes.rows as unknown[]);
  for (const [day, v] of toMap(focusRes.rows as unknown[])) loggedMap.set(day, (loggedMap.get(day) ?? 0) + v);
  const sleepMap = toMap(sleepRes.rows as unknown[]);
  const energyMap = toMap(moodRes.rows as unknown[]);
  const workoutMap = toMap(workoutRes.rows as unknown[]);
  const habitsMap = toMap(habitsRes.rows as unknown[]);
  const notesMap = toMap(notesRes.rows as unknown[]);

  const days: DailyPoint[] = [];
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    const day = shiftDays(today, -i);
    days.push({
      day,
      done: doneMap.get(day) ?? 0,
      loggedMinutes: Math.round(loggedMap.get(day) ?? 0),
      meetings: notesMap.get(day) ?? 0,
      sleepHours: sleepMap.has(day) ? Math.round((sleepMap.get(day) as number) * 10) / 10 : null,
      energy: energyMap.has(day) ? Math.round((energyMap.get(day) as number) * 10) / 10 : null,
    });
  }

  const sumRange = (start: number, end: number, f: (d: DailyPoint) => number) => days.slice(start, end).reduce((s, d) => s + f(d), 0);
  const n = days.length;

  // Janela das comparações: a partir do primeiro trabalho profissional (e só até ontem — o dia de hoje está incompleto).
  const first = String((firstRes.rows[0] as unknown as { first: string | null })?.first ?? today);
  const sample = days.filter((d) => d.day >= first && d.day < today);
  const habitCounts = sample.map((d) => habitsMap.get(d.day) ?? 0).sort((a, b) => a - b);
  const habitMedian = habitCounts.length ? habitCounts[Math.floor(habitCounts.length / 2)] : 0;

  const comparisons: Comparison[] = [
    compare(
      { key: "sleep", label: "Sono da noite anterior", withLabel: "7 h ou mais", withoutLabel: "menos de 7 h" },
      sample.filter((d) => d.sleepHours !== null && d.sleepHours >= 7),
      sample.filter((d) => d.sleepHours !== null && d.sleepHours < 7)
    ),
    compare(
      { key: "energy", label: "Energia registrada", withLabel: "energia 4–5", withoutLabel: "energia 1–3" },
      sample.filter((d) => d.energy !== null && d.energy >= 4),
      sample.filter((d) => d.energy !== null && d.energy < 4)
    ),
    compare(
      { key: "workout", label: "Exercício no dia", withLabel: "com exercício", withoutLabel: "sem exercício" },
      sample.filter((d) => (workoutMap.get(d.day) ?? 0) > 0),
      sample.filter((d) => (workoutMap.get(d.day) ?? 0) === 0)
    ),
    compare(
      { key: "habits", label: "Hábitos cumpridos", withLabel: `${Math.max(1, habitMedian)}+ hábitos`, withoutLabel: "menos hábitos" },
      sample.filter((d) => (habitsMap.get(d.day) ?? 0) >= Math.max(1, habitMedian)),
      sample.filter((d) => (habitsMap.get(d.day) ?? 0) < Math.max(1, habitMedian))
    ),
    compare(
      { key: "meetings", label: "Reuniões/1:1 no dia", withLabel: "com reunião", withoutLabel: "sem reunião" },
      sample.filter((d) => d.meetings > 0),
      sample.filter((d) => d.meetings === 0)
    ),
  ];

  const weekdayTotals = WEEKDAYS.map((label, weekday) => ({ weekday, label, done: 0 }));
  for (const d of days) weekdayTotals[new Date(`${d.day}T12:00:00Z`).getUTCDay()].done += d.done;
  const bestWd = [...weekdayTotals].sort((a, b) => b.done - a.done)[0];
  const totalDone = weekdayTotals.reduce((s, w) => s + w.done, 0);

  const goals = (goalsRes.rows as unknown as Array<{ id: string; title: string; kind: string; target_value: number | null; current_value: number; due_date: string | null }>).map((g) => ({
    id: g.id,
    title: g.title,
    dueDate: g.due_date,
    pct: g.target_value ? Math.min(100, Math.round((num(g.current_value) / num(g.target_value)) * 100)) : num(g.current_value) > 0 ? 100 : 0,
  }));

  return {
    today,
    windowDays: WINDOW_DAYS,
    kpis: {
      open: workload.totals.open,
      overdue: workload.totals.overdue,
      dueThisWeek: workload.totals.dueThisWeek,
      done7: sumRange(n - 7, n, (d) => d.done),
      donePrev7: sumRange(n - 14, n - 7, (d) => d.done),
      logged7: sumRange(n - 7, n, (d) => d.loggedMinutes),
      loggedPrev7: sumRange(n - 14, n - 7, (d) => d.loggedMinutes),
      meetings30: sumRange(n - 30, n, (d) => d.meetings),
      remainingMinutes: workload.totals.remainingMinutes,
      unestimatedOpen: workload.totals.unestimatedOpen,
    },
    daily: days.slice(-14),
    weekday: weekdayTotals,
    bestWeekday: totalDone >= 5 && bestWd.done > 0 ? { label: bestWd.label, done: bestWd.done } : null,
    comparisons,
    workload,
    upcoming: (upcomingRes.rows as unknown as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      title: String(r.title),
      status: String(r.status),
      projectName: String(r.project_name),
      projectColor: (r.project_color as string | null) ?? null,
      dueDate: String(r.due_date).slice(0, 10),
      priorityScore: r.priority_score == null ? null : Number(r.priority_score),
    })),
    careerGoals: goals,
    journal: {
      linkedEntries30: num((journalCountRes.rows[0] as unknown as { n: number })?.n),
      recent: (journalRecentRes.rows as unknown as Array<Record<string, unknown>>).map((r) => ({
        date: String(r.entry_date),
        projectName: String(r.project_name),
        preview: ((r.thoughts as string | null) ?? (r.intention as string | null) ?? null)?.replace(/<[^>]+>/g, "").slice(0, 160) ?? null,
      })),
    },
  };
}
