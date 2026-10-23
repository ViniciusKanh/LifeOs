import type { Client } from "@libsql/client";
import { dayKeyIn, todayKeyFor, userTimezone } from "./gamificationService.js";
import { tomorrowProphecies } from "./intelligenceService.js";
import { getFocusTasks } from "./priorityService.js";
import { ensureJournalEntryId } from "./journalService.js";

/**
 * Taverna — ritual de fim de dia. Só LÊ as fontes originais (XP, moedas,
 * tarefas, hábitos, Saúde, conquistas, Forja) para montar o balanço, a
 * profecia de amanhã e a sugestão da primeira missão. A única escrita é
 * fixar a missão principal de amanhã (journal_entries.focus_task_ids),
 * sempre por ação confirmada do usuário.
 */

export class TavernError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Timestamps do SQLite (UTC, "YYYY-MM-DD HH:MM:SS") → dia local do usuário. */
const localDay = (sqlTs: string, tz: string) => dayKeyIn(new Date(sqlTs.includes("T") ? sqlTs : `${sqlTs.replace(" ", "T")}Z`), tz);

function parseIds(value: unknown): string[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Média diária dos 7 dias anteriores a hoje (dias sem registro contam como 0); null se a janela inteira estiver vazia. */
function avg7(byDay: Map<string, number>, today: string): number | null {
  const keys = Array.from({ length: 7 }, (_, i) => addDays(today, -(i + 1)));
  if (!keys.some((k) => byDay.has(k))) return null;
  return Math.round((keys.reduce((s, k) => s + (byDay.get(k) ?? 0), 0) / 7) * 10) / 10;
}

const sumMap = (rows: Array<Record<string, unknown>>) => new Map(rows.map((r) => [String(r.d), Number(r.v)]));

async function dayBalance(db: Client, ownerId: string, today: string, tz: string) {
  const from = addDays(today, -7);
  // Janela UTC folgada (fusos de até ±14h) para converter depois para o dia local.
  const utcFrom = addDays(from, -1);
  const [xp, coins, tasks, habitsDone, habitsTotal, water, workouts, sleep, ach, custom, todayJournal] = await Promise.all([
    db.execute({ sql: "SELECT day_key AS d, SUM(xp) AS v FROM xp_events WHERE owner_id = ? AND day_key BETWEEN ? AND ? GROUP BY day_key", args: [ownerId, from, today] }),
    db.execute({ sql: "SELECT amount, created_at FROM coin_ledger WHERE owner_id = ? AND amount > 0 AND created_at >= ?", args: [ownerId, utcFrom] }),
    db.execute({
      sql: `SELECT id, title, priority, completed_at FROM tasks
            WHERE owner_id = ? AND status = 'Concluído' AND habit_id IS NULL AND parent_task_id IS NULL AND completed_at >= ?
            ORDER BY completed_at DESC`,
      args: [ownerId, utcFrom],
    }),
    db.execute({
      sql: `SELECT e.entry_date AS d, h.id, h.name, h.icon FROM habit_entries e JOIN habits h ON h.id = e.habit_id AND h.owner_id = e.owner_id
            WHERE e.owner_id = ? AND e.entry_date BETWEEN ? AND ? AND e.count >= h.target_count`,
      args: [ownerId, from, today],
    }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM habits WHERE owner_id = ? AND archived_at IS NULL", args: [ownerId] }),
    // Saúde segue a mesma convenção de data do Diário (data do registro).
    db.execute({ sql: "SELECT date(recorded_at) AS d, SUM(amount_ml) AS v FROM water_entries WHERE owner_id = ? AND recorded_at >= date(?) AND recorded_at < date(?, '+1 day') GROUP BY d", args: [ownerId, from, today] }),
    db.execute({ sql: "SELECT date(performed_at) AS d, SUM(duration_minutes) AS v, COUNT(*) AS n FROM workouts WHERE owner_id = ? AND performed_at >= date(?) AND performed_at < date(?, '+1 day') GROUP BY d", args: [ownerId, from, today] }),
    db.execute({
      sql: "SELECT duration_minutes, quality FROM sleep_entries WHERE owner_id = ? AND woke_up_at >= date(?2) AND woke_up_at < date(?2, '+1 day') ORDER BY woke_up_at DESC LIMIT 1",
      args: [ownerId, today],
    }),
    db.execute({
      sql: `SELECT a.id, a.title, a.icon, ua.unlocked_at FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id
            WHERE ua.owner_id = ? AND ua.unlocked_at >= ?`,
      args: [ownerId, addDays(today, -1)],
    }),
    db.execute({ sql: "SELECT id, title, icon, unlocked_at FROM custom_achievements WHERE owner_id = ? AND unlocked_at >= ?", args: [ownerId, addDays(today, -1)] }),
    db.execute({ sql: "SELECT focus_task_ids FROM journal_entries WHERE owner_id = ? AND entry_date = ?", args: [ownerId, today] }),
  ]);

  const xpByDay = sumMap(xp.rows as unknown as Array<Record<string, unknown>>);
  const coinsByDay = new Map<string, number>();
  for (const r of coins.rows) {
    const d = localDay(String(r.created_at), tz);
    coinsByDay.set(d, (coinsByDay.get(d) ?? 0) + Number(r.amount));
  }
  const tasksByDay = new Map<string, number>();
  const missionsToday: Array<{ id: string; title: string; priority: string }> = [];
  for (const r of tasks.rows) {
    const d = localDay(String(r.completed_at), tz);
    tasksByDay.set(d, (tasksByDay.get(d) ?? 0) + 1);
    if (d === today) missionsToday.push({ id: String(r.id), title: String(r.title), priority: String(r.priority) });
  }
  const habitsByDay = new Map<string, number>();
  const habitsToday: Array<{ id: string; name: string; icon: string | null }> = [];
  for (const r of habitsDone.rows) {
    const d = String(r.d);
    habitsByDay.set(d, (habitsByDay.get(d) ?? 0) + 1);
    if (d === today) habitsToday.push({ id: String(r.id), name: String(r.name), icon: r.icon ? String(r.icon) : null });
  }
  const waterByDay = sumMap(water.rows as unknown as Array<Record<string, unknown>>);
  const exerciseByDay = sumMap(workouts.rows as unknown as Array<Record<string, unknown>>);
  const workoutsToday = Number(workouts.rows.find((r) => String(r.d) === today)?.n ?? 0);
  const sleepRow = sleep.rows[0];

  const achievements = [
    ...ach.rows.map((r) => ({ id: String(r.id), title: String(r.title), icon: r.icon ? String(r.icon) : null, unlockedAt: String(r.unlocked_at), custom: false })),
    ...custom.rows.map((r) => ({ id: String(r.id), title: String(r.title), icon: r.icon ? String(r.icon) : null, unlockedAt: String(r.unlocked_at), custom: true })),
  ].filter((a) => localDay(a.unlockedAt, tz) === today);

  // Missão principal de hoje (fixada no diário de hoje), se houver.
  const mainIds = parseIds(todayJournal.rows[0]?.focus_task_ids);
  let mainMission: { id: string; title: string; done: boolean } | null = null;
  if (mainIds[0]) {
    const m = await db.execute({ sql: "SELECT id, title, status FROM tasks WHERE id = ? AND owner_id = ?", args: [mainIds[0], ownerId] });
    const row = m.rows[0];
    if (row) mainMission = { id: String(row.id), title: String(row.title), done: String(row.status) === "Concluído" };
  }

  return {
    xp: { today: xpByDay.get(today) ?? 0, avg7: avg7(xpByDay, today) },
    coins: { today: coinsByDay.get(today) ?? 0, avg7: avg7(coinsByDay, today) },
    missions: { count: missionsToday.length, avg7: avg7(tasksByDay, today), items: missionsToday.slice(0, 12) },
    habits: { done: habitsToday.length, total: Number(habitsTotal.rows[0]?.n ?? 0), avg7: avg7(habitsByDay, today), items: habitsToday },
    water: { todayMl: waterByDay.get(today) ?? 0, avg7: avg7(waterByDay, today) },
    exercise: { todayMinutes: exerciseByDay.get(today) ?? 0, sessions: workoutsToday, avg7: avg7(exerciseByDay, today) },
    sleep: sleepRow ? { durationMinutes: sleepRow.duration_minutes == null ? null : Number(sleepRow.duration_minutes), quality: sleepRow.quality == null ? null : Number(sleepRow.quality) } : null,
    achievements,
    mainMission,
  };
}

interface MissionCandidate {
  id: string;
  title: string;
  priority: string;
  dueDate: string | null;
  projectName: string | null;
  reasons: string[];
}

/**
 * Primeira missão de amanhã: a ordem oficial de urgência (priorityService —
 * atrasada > vence hoje > vence na semana > resto, prioridade desempata),
 * sem tarefas bloqueadas nem check-ins de hábito. As razões são reescritas
 * do ponto de vista de amanhã (o que vence hoje e não saiu vira atraso).
 */
async function tomorrowMission(db: Client, ownerId: string, tomorrow: string) {
  const [focus, pinnedRes, dueTomorrowRes] = await Promise.all([
    getFocusTasks(db, ownerId, 20),
    db.execute({ sql: "SELECT focus_task_ids FROM journal_entries WHERE owner_id = ? AND entry_date = ?", args: [ownerId, tomorrow] }),
    db.execute({
      sql: `SELECT id, title, priority FROM tasks WHERE owner_id = ? AND status != 'Concluído' AND habit_id IS NULL
            AND due_date >= date(?) AND due_date < date(?, '+1 day') ORDER BY CASE priority WHEN 'Alta' THEN 0 WHEN 'Média' THEN 1 ELSE 2 END LIMIT 10`,
      args: [ownerId, tomorrow, tomorrow],
    }),
  ]);
  const ids = focus.map((t) => t.id);
  const meta = ids.length
    ? await db.execute({
        sql: `SELECT t.id, t.habit_id, t.parent_task_id, p.name AS project_name FROM tasks t LEFT JOIN projects p ON p.id = t.project_id AND p.owner_id = t.owner_id
              WHERE t.owner_id = ? AND t.id IN (${ids.map(() => "?").join(", ")})`,
        args: [ownerId, ...ids],
      })
    : { rows: [] };
  const metaById = new Map(meta.rows.map((r) => [String(r.id), r]));

  const candidates: MissionCandidate[] = [];
  for (const t of focus) {
    const m = metaById.get(t.id);
    if (!m || m.habit_id || m.parent_task_id) continue;
    if (t.reasons.some((r) => r.startsWith("Bloqueada"))) continue;
    const due = t.dueDate ? t.dueDate.slice(0, 10) : null;
    const reasons: string[] = [];
    if (due) {
      const diff = Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${tomorrow}T00:00:00Z`)) / 86_400_000);
      if (diff === -1) reasons.push("Vence hoje — amanhã já estará atrasada");
      else if (diff < -1) reasons.push(`Atrasada — amanhã fará ${-diff} dias`);
      else if (diff === 0) reasons.push("Vence amanhã");
      else if (diff === 1) reasons.push("Vence depois de amanhã");
      else if (diff <= 7) reasons.push(`Vence em ${diff + 1} dias`);
    } else reasons.push("Sem prazo definido");
    reasons.push(`Prioridade ${t.priority}`);
    candidates.push({ id: t.id, title: t.title, priority: t.priority, dueDate: due, projectName: m.project_name ? String(m.project_name) : null, reasons });
    if (candidates.length >= 3) break;
  }

  const pinnedIds = parseIds(pinnedRes.rows[0]?.focus_task_ids);
  const pinned = pinnedIds.length
    ? (
        await db.execute({
          sql: `SELECT id, title, status FROM tasks WHERE owner_id = ? AND id IN (${pinnedIds.map(() => "?").join(", ")})`,
          args: [ownerId, ...pinnedIds],
        })
      ).rows
        .map((r) => ({ id: String(r.id), title: String(r.title), done: String(r.status) === "Concluído" }))
        .sort((a, b) => pinnedIds.indexOf(a.id) - pinnedIds.indexOf(b.id))
    : [];

  return {
    primary: candidates[0] ?? null,
    alternatives: candidates.slice(1, 3),
    dueTomorrow: dueTomorrowRes.rows.map((r) => ({ id: String(r.id), title: String(r.title), priority: String(r.priority) })),
    pinned,
  };
}

/** GET /api/tavern/summary — balanço do dia, profecia de amanhã e primeira missão numa chamada. */
export async function getTavernSummary(db: Client, ownerId: string) {
  const [tz, today] = await Promise.all([userTimezone(db, ownerId), todayKeyFor(db, ownerId)]);
  const tomorrow = addDays(today, 1);
  const [balance, prophecy, mission] = await Promise.all([
    dayBalance(db, ownerId, today, tz),
    tomorrowProphecies(db, ownerId),
    tomorrowMission(db, ownerId, tomorrow),
  ]);
  return { today, tomorrow, timezone: tz, balance, prophecy: { prophecies: prophecy.prophecies }, mission };
}

/**
 * Fixa a missão principal de amanhã: coloca a tarefa no topo de
 * focus_task_ids da entrada de diário de amanhã (criando-a se preciso).
 * Opcionalmente move o prazo para amanhã — só quando o usuário confirmou.
 */
export async function pinTomorrowMission(db: Client, ownerId: string, taskId: string, opts: { setDueTomorrow?: boolean } = {}) {
  const t = await db.execute({ sql: "SELECT id, title, status, habit_id FROM tasks WHERE id = ? AND owner_id = ?", args: [taskId, ownerId] });
  const task = t.rows[0];
  // Tarefa de outro usuário responde igual a inexistente (não vaza existência).
  if (!task) throw new TavernError(404, "Tarefa não encontrada.");
  if (String(task.status) === "Concluído") throw new TavernError(422, "Essa tarefa já foi concluída.");
  if (task.habit_id) throw new TavernError(422, "Check-ins de hábito não podem ser a missão principal.");

  const tomorrow = addDays(await todayKeyFor(db, ownerId), 1);
  const entryId = await ensureJournalEntryId(db, ownerId, tomorrow);
  const cur = await db.execute({ sql: "SELECT focus_task_ids FROM journal_entries WHERE id = ? AND owner_id = ?", args: [entryId, ownerId] });
  const next = [taskId, ...parseIds(cur.rows[0]?.focus_task_ids).filter((id) => id !== taskId)].slice(0, 10);
  const statements = [
    {
      sql: "UPDATE journal_entries SET focus_task_ids = ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?",
      args: [JSON.stringify(next), entryId, ownerId],
    },
  ];
  if (opts.setDueTomorrow) {
    statements.push({ sql: "UPDATE tasks SET due_date = ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [tomorrow, taskId, ownerId] });
  }
  await db.batch(statements, "write");
  return { date: tomorrow, focusTaskIds: next, task: { id: String(task.id), title: String(task.title) }, dueDateChanged: !!opts.setDueTomorrow };
}
