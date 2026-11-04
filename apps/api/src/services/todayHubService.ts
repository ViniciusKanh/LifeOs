import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { GAMIFICATION_RULES } from "../config/gamification.js";
import { awardFocusSession, getDifficultyRewards, getPlayerProfile, getPriorityRewards, isDifficulty } from "./gamificationService.js";
import { localDayRangeUtc, shiftDayKey, userDayContext } from "./localDayService.js";
import { getFocusTasks } from "./priorityService.js";
import { getCalendarItems } from "./calendarAggregationService.js";
import { getHabitsHub } from "./habitsHubService.js";
import { getQuestBoard } from "./questsService.js";
import { computeLifeScore } from "./metricsService.js";
import { findConflicts, nextFreeSlot, type TimedBlock } from "./planningHubService.js";
import { notifyFromAutomation } from "./automationService.js";
import { utcRangeFilter } from "./healthService.js";

/**
 * Hoje 3.0 — Central da Jornada Diária (camada de execução).
 *
 * Fontes oficiais: tasks/subtasks (missões), habit_entries (hábitos),
 * events + agregador de calendário (agenda), time_entries (foco), módulos de
 * saúde/biblioteca (sinais) e xp_events/coin_ledger (economia). As únicas
 * tabelas próprias são o ritual configurável e o estado do cronômetro.
 * A missão principal é o foco do dia do Diário (focus_task_ids) — a mesma
 * regra que já paga o bônus de missão principal.
 */

type Row = Record<string, unknown>;
type Outcome = { status: "ok" | "skipped" | "error"; summary: string };

export class TodayError extends Error {
  constructor(
    message: string,
    public status: 400 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

/* ─────────────────────────────── Ritual ─────────────────────────────── */

export type RitualKind = "manual" | "planning" | "task" | "habit" | "focus" | "health" | "study" | "journal";
export interface RitualStep {
  id: string;
  label: string;
  kind: RitualKind;
  refId: string | null;
  position: number;
}

/** Ritual padrão (não é gravado até o usuário personalizar). */
export const DEFAULT_RITUAL: RitualStep[] = [
  { id: "d-planning", label: "Planejar o dia", kind: "planning", refId: null, position: 0 },
  { id: "d-task", label: "Executar a missão principal", kind: "task", refId: null, position: 1 },
  { id: "d-health", label: "Cuidar da saúde (água, treino ou humor)", kind: "health", refId: null, position: 2 },
  { id: "d-study", label: "Sessão de foco ou estudo", kind: "focus", refId: null, position: 3 },
  { id: "d-journal", label: "Registrar aprendizados no Diário", kind: "journal", refId: null, position: 4 },
  { id: "d-close", label: "Encerrar a jornada", kind: "manual", refId: null, position: 5 },
];
export const RITUAL_KINDS: RitualKind[] = ["manual", "planning", "task", "habit", "focus", "health", "study", "journal"];

export async function listRitualSteps(db: Client, ownerId: string): Promise<{ steps: RitualStep[]; custom: boolean }> {
  const r = await db.execute({ sql: "SELECT id, label, kind, ref_id, position FROM daily_ritual_steps WHERE owner_id = ? AND active = 1 ORDER BY position", args: [ownerId] });
  if (!r.rows.length) return { steps: DEFAULT_RITUAL, custom: false };
  return { steps: r.rows.map((x) => ({ id: String(x.id), label: String(x.label), kind: String(x.kind) as RitualKind, refId: x.ref_id == null ? null : String(x.ref_id), position: Number(x.position) })), custom: true };
}

/** Substitui o ritual do usuário (desativa os antigos — o histórico das marcações é preservado). */
export async function saveRitual(db: Client, ownerId: string, steps: Array<{ id?: string; label: string; kind: RitualKind; refId?: string | null }>) {
  if (steps.length > 12) throw new TodayError("Até 12 etapas no ritual.");
  const existing = await db.execute({ sql: "SELECT id FROM daily_ritual_steps WHERE owner_id = ?", args: [ownerId] });
  const own = new Set(existing.rows.map((r) => String(r.id)));
  const stmts: Array<{ sql: string; args: Array<string | number | null> }> = [{ sql: "UPDATE daily_ritual_steps SET active = 0 WHERE owner_id = ?", args: [ownerId] }];
  steps.forEach((s, i) => {
    if (s.id && own.has(s.id)) stmts.push({ sql: "UPDATE daily_ritual_steps SET label = ?, kind = ?, ref_id = ?, position = ?, active = 1 WHERE id = ? AND owner_id = ?", args: [s.label.slice(0, 80), s.kind, s.refId ?? null, i, s.id, ownerId] });
    else stmts.push({ sql: "INSERT INTO daily_ritual_steps (id, owner_id, label, kind, ref_id, position) VALUES (?, ?, ?, ?, ?, ?)", args: [nanoid(), ownerId, s.label.slice(0, 80), s.kind, s.refId ?? null, i] });
  });
  await db.batch(stmts, "write");
}

/** Marca/desmarca etapa manual. Passos padrão ainda não gravados são materializados primeiro. */
export async function toggleRitualStep(db: Client, ownerId: string, stepId: string, done: boolean) {
  let id = stepId;
  if (stepId.startsWith("d-")) {
    const { custom } = await listRitualSteps(db, ownerId);
    if (!custom) await saveRitual(db, ownerId, DEFAULT_RITUAL.map((s) => ({ label: s.label, kind: s.kind, refId: s.refId })));
    const pos = DEFAULT_RITUAL.findIndex((s) => s.id === stepId);
    const r = await db.execute({ sql: "SELECT id FROM daily_ritual_steps WHERE owner_id = ? AND active = 1 AND position = ?", args: [ownerId, pos] });
    if (!r.rows[0]) throw new TodayError("Etapa não encontrada.", 404);
    id = String(r.rows[0].id);
  } else {
    const r = await db.execute({ sql: "SELECT 1 FROM daily_ritual_steps WHERE id = ? AND owner_id = ?", args: [stepId, ownerId] });
    if (!r.rows.length) throw new TodayError("Etapa não encontrada.", 404);
  }
  const { today } = await userDayContext(db, ownerId);
  if (done) await db.execute({ sql: "INSERT OR IGNORE INTO daily_ritual_checks (owner_id, step_id, day_key, source) VALUES (?, ?, ?, 'manual')", args: [ownerId, id, today] });
  else await db.execute({ sql: "DELETE FROM daily_ritual_checks WHERE owner_id = ? AND step_id = ? AND day_key = ? AND source = 'manual'", args: [ownerId, id, today] });
}

/* ─────────────────────────────── Cronômetro ─────────────────────────────── */

export type TimerMode = "pomodoro" | "free" | "block";
export type TimerLink = "task" | "subject" | "deck" | "project" | null;

export interface TimerState {
  entryId: string;
  mode: TimerMode;
  plannedMinutes: number | null;
  startedAt: string; // ISO UTC
  pausedAt: string | null;
  pausedMs: number;
  linkType: TimerLink;
  linkId: string | null;
  linkLabel: string | null;
}

const toIso = (sqlite: string) => (sqlite.includes("T") ? sqlite : `${sqlite.replace(" ", "T")}Z`);

/** Tempo efetivo (ms) — calculado por timestamps persistidos, então sobrevive a aba minimizada/recarga. */
export function elapsedMs(s: Pick<TimerState, "startedAt" | "pausedAt" | "pausedMs">, now = Date.now()): number {
  const end = s.pausedAt ? Date.parse(s.pausedAt) : now;
  return Math.max(0, end - Date.parse(s.startedAt) - s.pausedMs);
}

export async function getTimer(db: Client, ownerId: string): Promise<TimerState | null> {
  const r = await db.execute({
    sql: `SELECT s.*, e.ended_at FROM focus_timer_state s LEFT JOIN time_entries e ON e.id = s.entry_id AND e.owner_id = s.owner_id WHERE s.owner_id = ?`,
    args: [ownerId],
  });
  const row = r.rows[0];
  if (!row) return null;
  // O apontamento pode ter sido fechado pelo cronômetro de uma tarefa em outra tela.
  if (row.ended_at != null) {
    await db.execute({ sql: "DELETE FROM focus_timer_state WHERE owner_id = ?", args: [ownerId] });
    return null;
  }
  return {
    entryId: String(row.entry_id),
    mode: String(row.mode) as TimerMode,
    plannedMinutes: row.planned_minutes == null ? null : Number(row.planned_minutes),
    startedAt: toIso(String(row.started_at)),
    pausedAt: row.paused_at == null ? null : toIso(String(row.paused_at)),
    pausedMs: Number(row.paused_ms ?? 0),
    linkType: row.link_type == null ? null : (String(row.link_type) as TimerLink),
    linkId: row.link_id == null ? null : String(row.link_id),
    linkLabel: row.link_label == null ? null : String(row.link_label),
  };
}

async function resolveLink(db: Client, ownerId: string, type: TimerLink, id: string | null) {
  if (!type || !id) return { label: null as string | null, projectId: null as string | null, taskId: null as string | null };
  const table = { task: "tasks", subject: "subjects", deck: "flashcard_decks", project: "projects" }[type];
  const col = type === "task" ? "title" : "name";
  const r = await db.execute({ sql: `SELECT ${col} AS label${type === "task" ? ", project_id" : ""} FROM ${table} WHERE id = ? AND owner_id = ?`, args: [id, ownerId] });
  const row = r.rows[0];
  if (!row) throw new TodayError("Atividade vinculada não encontrada.", 404);
  return { label: String(row.label), projectId: type === "task" ? (row.project_id == null ? null : String(row.project_id)) : type === "project" ? id : null, taskId: type === "task" ? id : null };
}

export async function startTimer(db: Client, ownerId: string, input: { mode: TimerMode; plannedMinutes?: number | null; linkType?: TimerLink; linkId?: string | null }) {
  if (await getTimer(db, ownerId)) throw new TodayError("Já existe um cronômetro em andamento.", 409);
  const link = await resolveLink(db, ownerId, input.linkType ?? null, input.linkId ?? null);
  const planned = input.mode === "pomodoro" ? (input.plannedMinutes ?? 25) : input.mode === "block" ? (input.plannedMinutes ?? 50) : null;
  if (planned != null && (planned < 5 || planned > 480)) throw new TodayError("Duração entre 5 e 480 minutos.");
  const id = nanoid();
  const note = input.linkType === "subject" ? `[Estudo] ${link.label}` : input.linkType === "deck" ? `[Grimório] ${link.label}` : null;
  // Mesmo comportamento do cronômetro de tarefas: só um apontamento aberto por vez.
  await db.batch(
    [
      { sql: "UPDATE time_entries SET ended_at = datetime('now') WHERE owner_id = ? AND ended_at IS NULL", args: [ownerId] },
      { sql: "INSERT INTO time_entries (id, owner_id, task_id, project_id, started_at, kind, notes) VALUES (?, ?, ?, ?, datetime('now'), ?, ?)", args: [id, ownerId, link.taskId, link.projectId, input.mode === "pomodoro" ? "pomodoro" : "focus", note] },
      {
        sql: "INSERT INTO focus_timer_state (owner_id, entry_id, mode, planned_minutes, started_at, link_type, link_id, link_label) VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?, ?, ?)",
        args: [ownerId, id, input.mode, planned, input.linkType ?? null, input.linkId ?? null, link.label],
      },
    ],
    "write",
  );
  return getTimer(db, ownerId);
}

export async function pauseTimer(db: Client, ownerId: string, pause: boolean) {
  const t = await getTimer(db, ownerId);
  if (!t) throw new TodayError("Nenhum cronômetro em andamento.", 404);
  if (pause && !t.pausedAt) await db.execute({ sql: "UPDATE focus_timer_state SET paused_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE owner_id = ?", args: [ownerId] });
  if (!pause && t.pausedAt) await db.execute({ sql: "UPDATE focus_timer_state SET paused_ms = ?, paused_at = NULL WHERE owner_id = ?", args: [t.pausedMs + (Date.now() - Date.parse(t.pausedAt)), ownerId] });
  return getTimer(db, ownerId);
}

/**
 * Encerra: grava a duração REAL (sem pausas) no apontamento, soma na tarefa
 * vinculada e paga o foco pela regra oficial (idempotente pelo id do apontamento).
 */
export async function stopTimer(db: Client, ownerId: string) {
  const t = await getTimer(db, ownerId);
  if (!t) throw new TodayError("Nenhum cronômetro em andamento.", 404);
  const minutes = Math.floor(elapsedMs(t) / 60_000);
  const stmts: Array<{ sql: string; args: Array<string | number | null> }> = [
    { sql: "UPDATE time_entries SET ended_at = datetime('now'), duration_minutes = ? WHERE id = ? AND owner_id = ?", args: [minutes, t.entryId, ownerId] },
    { sql: "DELETE FROM focus_timer_state WHERE owner_id = ?", args: [ownerId] },
  ];
  if (t.linkType === "task" && t.linkId) stmts.push({ sql: "UPDATE tasks SET time_spent_minutes = time_spent_minutes + ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [minutes, t.linkId, ownerId] });
  await db.batch(stmts, "write");
  const e = await db.execute({ sql: "SELECT project_id FROM time_entries WHERE id = ?", args: [t.entryId] });
  await awardFocusSession(db, ownerId, t.entryId, minutes, e.rows[0]?.project_id == null ? null : String(e.rows[0].project_id));
  return { minutes, entryId: t.entryId };
}

/** Missão principal = foco do dia do Diário (mesma fonte do bônus oficial de missão principal). */
export async function setMainMission(db: Client, ownerId: string, taskId: string | null) {
  if (taskId) {
    const r = await db.execute({ sql: "SELECT 1 FROM tasks WHERE id = ? AND owner_id = ?", args: [taskId, ownerId] });
    if (!r.rows.length) throw new TodayError("Missão não encontrada.", 404);
  }
  const { today } = await userDayContext(db, ownerId);
  await db.execute({
    sql: `INSERT INTO journal_entries (id, owner_id, entry_date, focus_task_ids) VALUES (?, ?, ?, ?)
          ON CONFLICT (owner_id, entry_date) DO UPDATE SET focus_task_ids = excluded.focus_task_ids, updated_at = datetime('now')`,
    args: [nanoid(), ownerId, today, JSON.stringify(taskId ? [taskId] : [])],
  });
}

/* ─────────────────────────────── Hub ─────────────────────────────── */

const minutesOf = (iso: string) => (iso.length > 10 ? Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16)) : null);

export async function getTodayHub(db: Client, ownerId: string) {
  const { tz, today } = await userDayContext(db, ownerId);
  const { start, end } = localDayRangeUtc(today, tz);
  const f = (col: string) => utcRangeFilter(col, start, end);
  const [profile, life, lifeWeek, tasks, journal, calendar, habits, focus, done, water, workouts, mood, sleep, pages, timer, ritual, quests, achToday, prio, diff] = await Promise.all([
    getPlayerProfile(db, ownerId),
    computeLifeScore(ownerId, today),
    db.execute({ sql: "SELECT overall_score FROM life_scores WHERE owner_id = ? AND score_date = ?", args: [ownerId, shiftDayKey(today, -7)] }),
    db.execute({
      sql: `SELECT t.id, t.title, t.priority, t.difficulty, t.status, t.due_date, t.planned_date, t.estimate_minutes, t.time_spent_minutes, t.project_id, p.name AS project_name,
                   (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.owner_id = t.owner_id) AS sub_total,
                   (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.owner_id = t.owner_id AND s.done = 1) AS sub_done
            FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
            WHERE t.owner_id = ? AND t.status != 'Concluído' AND t.parent_task_id IS NULL
              AND ((t.due_date IS NOT NULL AND date(t.due_date) <= ?) OR t.planned_date = ?)
            ORDER BY CASE WHEN date(t.due_date) < ? THEN 0 ELSE 1 END, t.priority = 'Alta' DESC, t.due_date LIMIT 30`,
      args: [ownerId, today, today, today],
    }),
    db.execute({ sql: "SELECT focus_task_ids, intention, thoughts FROM journal_entries WHERE owner_id = ? AND entry_date = ?", args: [ownerId, today] }),
    getCalendarItems(db, ownerId, today, today),
    getHabitsHub(db, ownerId),
    db.execute({ sql: `SELECT COALESCE(SUM(duration_minutes), 0) AS m, COUNT(*) AS n FROM time_entries WHERE owner_id = ? AND ended_at IS NOT NULL AND ${f("ended_at").sql}`, args: [ownerId, ...f("ended_at").args] }),
    db.execute({ sql: `SELECT id, title FROM tasks WHERE owner_id = ? AND status = 'Concluído' AND completed_at IS NOT NULL AND ${f("completed_at").sql}`, args: [ownerId, ...f("completed_at").args] }),
    db.execute({ sql: `SELECT COALESCE(SUM(amount_ml), 0) AS v FROM water_entries WHERE owner_id = ? AND ${f("recorded_at").sql}`, args: [ownerId, ...f("recorded_at").args] }),
    db.execute({ sql: `SELECT COALESCE(SUM(duration_minutes), 0) AS v, COUNT(*) AS n FROM workouts WHERE owner_id = ? AND ${f("performed_at").sql}`, args: [ownerId, ...f("performed_at").args] }),
    db.execute({ sql: `SELECT mood, energy, recorded_at FROM mood_entries WHERE owner_id = ? AND ${f("recorded_at").sql} ORDER BY recorded_at DESC LIMIT 1`, args: [ownerId, ...f("recorded_at").args] }),
    // Sono: a noite que TERMINOU hoje (despertar no dia local), em minutos de uma única noite.
    db.execute({ sql: `SELECT duration_minutes, quality FROM sleep_entries WHERE owner_id = ? AND ${f("woke_up_at").sql} ORDER BY woke_up_at DESC LIMIT 1`, args: [ownerId, ...f("woke_up_at").args] }),
    db.execute({ sql: `SELECT COALESCE(SUM(pages_read), 0) AS v, COALESCE(SUM(duration_minutes), 0) AS m FROM reading_sessions WHERE owner_id = ? AND ${f("started_at").sql}`, args: [ownerId, ...f("started_at").args] }),
    getTimer(db, ownerId),
    listRitualSteps(db, ownerId),
    getQuestBoard(db, ownerId).catch(() => null),
    db.execute({ sql: `SELECT a.title, a.tier FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id WHERE ua.owner_id = ? AND ${f("ua.unlocked_at").sql}`, args: [ownerId, ...f("ua.unlocked_at").args] }),
    getPriorityRewards(db, ownerId),
    getDifficultyRewards(db, ownerId),
  ]);

  let focusIds: string[] = [];
  try {
    focusIds = JSON.parse(String(journal.rows[0]?.focus_task_ids ?? "[]")) as string[];
  } catch {
    focusIds = [];
  }
  const ranked = await getFocusTasks(db, ownerId, 5);
  const R = GAMIFICATION_RULES.task;
  const missions = tasks.rows.map((t) => {
    const diffKey = t.difficulty == null ? null : String(t.difficulty);
    const base = diffKey && isDifficulty(diffKey) ? { xp: diff[diffKey].taskXp, coins: diff[diffKey].taskCoins } : (prio[String(t.priority) as "Baixa" | "Média" | "Alta"] ?? { xp: R.xpByPriority["Média"]!, coins: R.coinsByPriority["Média"]! });
    const due = t.due_date == null ? null : String(t.due_date).slice(0, 10);
    const isMain = focusIds.includes(String(t.id));
    return {
      id: String(t.id),
      title: String(t.title),
      priority: String(t.priority),
      status: String(t.status),
      dueDate: due,
      overdue: !!due && due < today,
      projectName: t.project_name == null ? null : String(t.project_name),
      estimateMinutes: t.estimate_minutes == null ? null : Number(t.estimate_minutes),
      spentMinutes: Number(t.time_spent_minutes ?? 0),
      subtasks: { done: Number(t.sub_done ?? 0), total: Number(t.sub_total ?? 0) },
      isMain,
      // Estimativa pelas regras vigentes (prioridade/dificuldade + bônus); o valor real é pago na conclusão.
      reward: { xp: base.xp + (due === today ? R.dailyMissionXp : 0) + (isMain ? R.mainMissionXp : 0), coins: base.coins + (isMain ? R.mainMissionCoins : 0) },
    };
  });
  // Missão principal é OPCIONAL: só existe quando o usuário fixa uma (bônus oficial).
  // Sem ela, o dia é guiado por "Foco agora" — as 3 missões mais bem ranqueadas.
  const mainId = focusIds[0] ?? null;
  const rankedIds = ranked.map((r) => String(r.id));
  const focusNow = [...missions]
    .sort((a, b) => {
      const ia = rankedIds.indexOf(a.id);
      const ib = rankedIds.indexOf(b.id);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    })
    .filter((m) => !m.isMain)
    .slice(0, 3);
  let main = missions.find((m) => m.id === mainId) ?? null;
  if (!main && mainId) {
    const r = await db.execute({ sql: "SELECT id, title, priority, status, due_date FROM tasks WHERE id = ? AND owner_id = ?", args: [mainId, ownerId] });
    const t = r.rows[0];
    if (t) main = { id: String(t.id), title: String(t.title), priority: String(t.priority), status: String(t.status), dueDate: t.due_date == null ? null : String(t.due_date).slice(0, 10), overdue: false, projectName: null, estimateMinutes: null, spentMinutes: 0, subtasks: { done: 0, total: 0 }, isMain: focusIds.includes(String(t.id)), reward: { xp: 0, coins: 0 } };
  }
  const mainSubtasks = main
    ? (await db.execute({ sql: "SELECT id, title, done FROM subtasks WHERE task_id = ? AND owner_id = ? ORDER BY position, created_at", args: [main.id, ownerId] })).rows.map((s) => ({ id: String(s.id), title: String(s.title), done: Number(s.done) === 1 }))
    : [];

  // Agenda: itens do dia + conflitos e janelas livres (só sugestão).
  const timed: TimedBlock[] = calendar
    .filter((c) => !c.allDay && c.startsAt.length > 10)
    .map((c) => ({ id: c.id, title: c.title, day: today, start: minutesOf(c.startsAt)!, end: c.endsAt && c.endsAt.length > 10 ? minutesOf(c.endsAt)! : minutesOf(c.startsAt)! + 60 }));
  const conflicts = findConflicts(timed).map((c) => ({ a: c.a.title, b: c.b.title, minutes: c.overlapMinutes }));

  // Ritual: etapas automáticas são detectadas por eventos reais e registradas (idempotente) no histórico.
  const focusMin = Number(focus.rows[0]?.m ?? 0);
  const journalText = String(journal.rows[0]?.thoughts ?? "").trim();
  const detect = (s: RitualStep): boolean | null => {
    switch (s.kind) {
      case "planning":
        return focusIds.length > 0 || !!String(journal.rows[0]?.intention ?? "").trim() || null;
      case "task":
        return s.refId ? done.rows.some((d) => String(d.id) === s.refId) : mainId ? done.rows.some((d) => String(d.id) === mainId) : done.rows.length > 0;
      case "habit":
        return s.refId ? habits.habits.some((h) => h.id === s.refId && h.doneToday) : habits.ritual.total > 0 && habits.ritual.done >= habits.ritual.total;
      case "focus":
      case "study":
        return focusMin >= 15 || Number(pages.rows[0]?.m ?? 0) >= 15;
      case "health":
        return Number(water.rows[0]?.v ?? 0) > 0 || Number(workouts.rows[0]?.n ?? 0) > 0 || !!mood.rows[0];
      case "journal":
        return journalText.length > 0;
      default:
        return null;
    }
  };
  const checks = await db.execute({ sql: "SELECT step_id, source FROM daily_ritual_checks WHERE owner_id = ? AND day_key = ?", args: [ownerId, today] });
  const manual = new Set(checks.rows.map((c) => String(c.step_id)));
  // Passos padrão (ainda não personalizados) usam a posição como chave estável.
  const stepRows = ritual.custom ? [] : (await db.execute({ sql: "SELECT id, position FROM daily_ritual_steps WHERE owner_id = ? AND active = 1", args: [ownerId] })).rows;
  const keyOf = (s: RitualStep) => (ritual.custom ? s.id : String(stepRows.find((r) => Number(r.position) === s.position)?.id ?? s.id));
  const steps = ritual.steps.map((s) => {
    const auto = detect(s);
    return { ...s, auto: auto !== null, done: auto === true || manual.has(keyOf(s)) };
  });
  if (ritual.custom) {
    const autoDone = steps.filter((s) => s.auto && s.done && !manual.has(s.id));
    if (autoDone.length) await db.batch(autoDone.map((s) => ({ sql: "INSERT OR IGNORE INTO daily_ritual_checks (owner_id, step_id, day_key, source) VALUES (?, ?, ?, 'auto')", args: [ownerId, s.id, today] })), "write");
  }
  const history = await db.execute({ sql: "SELECT day_key, COUNT(*) AS n FROM daily_ritual_checks WHERE owner_id = ? AND day_key >= ? GROUP BY day_key", args: [ownerId, shiftDayKey(today, -6)] });

  const prevLife = lifeWeek.rows[0]?.overall_score;
  const dims = { productivity: life.productivity, health: life.health, habits: life.habits, goals: life.goals, reading: life.reading, education: life.education, professional: life.professional };
  const nextHabitReward = habits.ritual.nextReward;
  const xpWeekAvg = await db.execute({ sql: "SELECT COALESCE(SUM(xp), 0) AS v FROM xp_events WHERE owner_id = ? AND day_key >= ? AND day_key < ?", args: [ownerId, shiftDayKey(today, -7), today] });
  const coinsToday = await db.execute({ sql: `SELECT COALESCE(SUM(amount), 0) AS v FROM coin_ledger WHERE owner_id = ? AND amount > 0 AND ${f("created_at").sql}`, args: [ownerId, ...f("created_at").args] });

  return {
    today,
    timezone: tz,
    profile: { level: profile.level, totalXp: profile.totalXp, progressPct: profile.progressPct, xpToday: profile.xpToday, coins: profile.coins, coinsToday: Number(coinsToday.rows[0]?.v ?? 0), streakDays: profile.streakDays, xpAvg7: Math.round(Number(xpWeekAvg.rows[0]?.v ?? 0) / 7) },
    lifeScore: { overall: Math.round(life.overall), delta: prevLife == null ? null : Math.round(life.overall) - Number(prevLife), dims },
    indicators: {
      prioritiesDone: done.rows.length,
      prioritiesTotal: done.rows.length + missions.length,
      focusMinutes: focusMin,
      focusSessions: Number(focus.rows[0]?.n ?? 0),
      missionsDone: done.rows.length,
    },
    main: main ? { ...main, subtaskList: mainSubtasks, manual: focusIds.length > 0 } : null,
    focusNow,
    doneToday: done.rows.slice(0, 20).map((d) => ({ id: String(d.id), title: String(d.title) })),
    missions,
    habits: { items: habits.ritual.items.map((i) => ({ ...i, streak: habits.habits.find((h) => h.id === i.id)?.streak ?? 0, frequency: habits.habits.find((h) => h.id === i.id)?.frequency ?? "daily" })), done: habits.ritual.done, total: habits.ritual.total },
    agenda: calendar.map((c) => ({ id: c.id, title: c.title, startsAt: c.startsAt, endsAt: c.endsAt, allDay: c.allDay, sourceType: c.sourceType, sourceId: c.sourceId, link: c.link, category: c.category ?? null, blockTaskId: c.blockTaskId ?? null })),
    conflicts,
    signals: {
      sleep: sleep.rows[0] ? { minutes: Number(sleep.rows[0].duration_minutes ?? 0), quality: sleep.rows[0].quality == null ? null : Number(sleep.rows[0].quality) } : null,
      mood: mood.rows[0] ? { mood: mood.rows[0].mood == null ? null : Number(mood.rows[0].mood), energy: mood.rows[0].energy == null ? null : Number(mood.rows[0].energy) } : null,
      workoutMinutes: Number(workouts.rows[0]?.v ?? 0),
      workouts: Number(workouts.rows[0]?.n ?? 0),
      waterMl: Number(water.rows[0]?.v ?? 0),
      readingPages: Number(pages.rows[0]?.v ?? 0),
    },
    timer,
    ritual: { steps, custom: ritual.custom, done: steps.filter((s) => s.done).length, total: steps.length, history: history.rows.map((h) => ({ day: String(h.day_key), checks: Number(h.n) })) },
    rewards: {
      nextHabit: nextHabitReward,
      quests: quests ? { done: quests.daily.quests.filter((q) => q.completed).length, total: quests.daily.quests.length, bonusXp: quests.daily.bonus.xp, bonusClaimed: quests.daily.bonus.claimed, claimable: [...quests.daily.quests, ...quests.weekly.quests].filter((q) => q.completed && !q.claimed).length } : null,
      achievementsToday: achToday.rows.map((a) => ({ title: String(a.title), tier: String(a.tier) })),
    },
  };
}

export type TodayHub = Awaited<ReturnType<typeof getTodayHub>>;

/** Próxima melhor ação (determinística): conflito → atrasada → missão principal → hábito pendente → foco. */
export function nextBestAction(h: Pick<TodayHub, "conflicts" | "missions" | "main" | "habits" | "indicators"> & { focusNow?: TodayHub["focusNow"] }): { kind: string; text: string; targetId: string | null } {
  if (h.conflicts.length) return { kind: "conflict", text: `Resolva o conflito na agenda: ${h.conflicts[0]!.a} × ${h.conflicts[0]!.b}.`, targetId: null };
  const overdue = h.missions.find((m) => m.overdue);
  if (overdue) return { kind: "overdue", text: `Conclua ou reagende a missão atrasada “${overdue.title}”.`, targetId: overdue.id };
  if (h.main && h.main.status !== "Concluído") return { kind: "main", text: `Inicie um bloco de foco na missão principal “${h.main.title}”.`, targetId: h.main.id };
  const lead = h.focusNow?.[0];
  if (lead) return { kind: "focus_now", text: `Próxima prioridade: “${lead.title}”.`, targetId: lead.id };
  const habit = h.habits.items.find((i) => !i.done);
  if (habit) return { kind: "habit", text: `Cumpra o hábito “${habit.name}”.`, targetId: habit.id };
  if (h.indicators.focusMinutes < 25) return { kind: "focus", text: "Faça um Pomodoro de 25 minutos em algo importante.", targetId: null };
  return { kind: "rest", text: "Dia em ordem: registre o encerramento no Diário.", targetId: null };
}

/** Blocos de foco sugeridos nas janelas livres de hoje (nada é agendado sem você). */
export function focusBlocks(h: Pick<TodayHub, "agenda">, nowMinutes: number, count = 3, duration = 50) {
  const busy = h.agenda.filter((a) => !a.allDay && a.startsAt.length > 10).map((a) => ({ start: minutesOf(a.startsAt)!, end: a.endsAt && a.endsAt.length > 10 ? minutesOf(a.endsAt)! : minutesOf(a.startsAt)! + 60 }));
  const out: Array<{ start: string; end: string }> = [];
  let from = Math.max(8 * 60, nowMinutes);
  for (let i = 0; i < count; i++) {
    const slot = nextFreeSlot(busy, duration, from);
    if (slot == null) break;
    const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    out.push({ start: hm(slot), end: hm(slot + duration) });
    busy.push({ start: slot, end: slot + duration + 10 });
    from = slot + duration + 10;
  }
  return out;
}

/** Encerramento do dia: síntese só com dados reais; vai ao Diário apenas com aprovação. */
export function dayCloseSummary(h: TodayHub) {
  const lines = [
    `Missões concluídas: ${h.indicators.missionsDone}.`,
    `Hábitos: ${h.habits.done}/${h.habits.total}.`,
    `Foco: ${h.indicators.focusMinutes} min em ${h.indicators.focusSessions} sessão(ões).`,
    `XP recebido: ${h.profile.xpToday}.`,
    h.rewards.achievementsToday.length ? `Conquistas: ${h.rewards.achievementsToday.map((a) => a.title).join(", ")}.` : "",
    h.missions.length ? `Pendências: ${h.missions.slice(0, 5).map((m) => m.title).join("; ")}.` : "Sem pendências para hoje.",
  ].filter(Boolean);
  return lines.join("\n");
}

export async function saveDayCloseToJournal(db: Client, ownerId: string, text: string) {
  const { today } = await userDayContext(db, ownerId);
  const block = `— Encerramento do dia —\n${text.slice(0, 2000)}`;
  await db.execute({
    sql: `INSERT INTO journal_entries (id, owner_id, entry_date, thoughts) VALUES (?, ?, ?, ?)
          ON CONFLICT (owner_id, entry_date) DO UPDATE SET thoughts = CASE WHEN COALESCE(thoughts, '') = '' THEN excluded.thoughts ELSE thoughts || char(10) || char(10) || excluded.thoughts END, updated_at = datetime('now')`,
    args: [nanoid(), ownerId, today, block],
  });
}

/* ─────────────────────────────── Automações ─────────────────────────────── */

export async function runMorningPlan(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const h = await getTodayHub(db, ownerId);
  if (!h.missions.length && !h.agenda.length && !h.habits.total) return { status: "skipped", summary: "Nada planejado para hoje." };
  const body = `${h.main ? `Missão principal: ${h.main.title}. ` : ""}${h.missions.length} missão(ões), ${h.agenda.length} compromisso(s) e ${h.habits.total} hábito(s) hoje.`;
  await notifyFromAutomation(db, ownerId, { eventType: "today_morning", title: "☀️ Plano da jornada", body, url: "/hoje", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: body };
}

export async function runSmartAlerts(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const h = await getTodayHub(db, ownerId);
  const overdue = h.missions.filter((m) => m.overdue);
  const dueToday = h.missions.filter((m) => m.dueDate === h.today);
  if (!overdue.length && !dueToday.length && !h.conflicts.length) return { status: "skipped", summary: "Sem alertas hoje." };
  const parts = [overdue.length ? `${overdue.length} atrasada(s)` : "", dueToday.length ? `${dueToday.length} vence(m) hoje` : "", h.conflicts.length ? `${h.conflicts.length} conflito(s) na agenda` : ""].filter(Boolean);
  await notifyFromAutomation(db, ownerId, { eventType: "today_alerts", title: "⚠️ Alertas da jornada", body: parts.join(" · "), url: "/hoje", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: parts.join(" · ") };
}

