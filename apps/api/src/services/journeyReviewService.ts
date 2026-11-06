import { nanoid } from "nanoid";
import type { Client } from "@libsql/client";
import { localDaysWhere } from "./localDayService.js";
import { awardReviewClosed, dayKeyIn, reviewRewardStatus, todayKeyFor, userTimezone } from "./gamificationService.js";
import { periodRange, periodKeyForDay, shiftPeriodKey, isReviewRewardEligible, savePeriodicReview } from "./periodicReviewService.js";
import { loadDirectionGoals } from "./directionService.js";
import { computeLifeScore, computeRangeMetrics } from "./metricsService.js";
import { validateFocus, type FocusRef } from "./warCouncilService.js";
import { automationConfig, notifyFromAutomation } from "./automationService.js";
import { evaluateAchievements } from "./achievementsService.js";
import { generateText, getGeminiConfig } from "./geminiService.js";
import { extractJson, str } from "./aiJson.js";
import { getFreeWindows } from "./capacityPlannerService.js";

/**
 * Revisões da Jornada 3.0 — semana, mês, trimestre e ano num só modelo.
 *
 * - Indicadores sempre recalculados das fontes originais; o retrato é
 *   copiado em snapshot_json só no selo (a revisão conta a mesma história depois).
 * - Período em andamento é comparado com a MESMA quantidade de dias do
 *   período anterior (comparação parcial, sinalizada). Sem base, não há variação.
 * - A recompensa é a regra oficial de fechamento de ciclo (awardReviewClosed),
 *   idempotente por tipo+período: editar, reabrir ou repetir não paga de novo.
 * - Cada salvamento é espelhado em weekly_reviews / periodic_reviews para a
 *   Linha do Tempo, conquistas e Analytics continuarem na mesma fonte.
 */

export class ReviewError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export type ReviewKind = "weekly" | "monthly" | "quarterly" | "annual";
export const REVIEW_KINDS: ReviewKind[] = ["weekly", "monthly", "quarterly", "annual"];
const KIND_LABEL: Record<ReviewKind, string> = { weekly: "semanal", monthly: "mensal", quarterly: "trimestral", annual: "anual" };

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
/** Semana começa na segunda-feira — mesma regra do Conselho de Guerra e das revisões semanais existentes. */
export const mondayOf = (day: string) => addDays(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7));

export function isValidKey(kind: ReviewKind, key: string): boolean {
  if (kind === "weekly") return /^\d{4}-\d{2}-\d{2}$/.test(key) && mondayOf(key) === key;
  if (kind === "monthly") return /^\d{4}-(0[1-9]|1[0-2])$/.test(key);
  if (kind === "quarterly") return /^\d{4}-Q[1-4]$/.test(key);
  return /^\d{4}$/.test(key);
}
export function rangeOf(kind: ReviewKind, key: string) {
  if (kind === "weekly") {
    const to = addDays(key, 6);
    const fmt = (d: string) => d.slice(8, 10) + "/" + d.slice(5, 7);
    return { from: key, to, label: `Semana de ${fmt(key)} a ${fmt(to)}` };
  }
  return periodRange(kind, key);
}
export const currentKey = (kind: ReviewKind, today: string) => (kind === "weekly" ? mondayOf(today) : periodKeyForDay(kind, today));
export const shiftKey = (kind: ReviewKind, key: string, delta: number) => (kind === "weekly" ? addDays(key, 7 * delta) : shiftPeriodKey(kind, key, delta));

/* ───────────────────────────── indicadores ───────────────────────────── */

const DIMS = ["productivity", "health", "habits", "goals", "education", "reading", "professional"] as const;
type Dim = (typeof DIMS)[number];
export const DIM_LABEL: Record<Dim, string> = { productivity: "Produtividade", health: "Saúde", habits: "Hábitos", goals: "Metas", education: "Educação", reading: "Leitura", professional: "Profissional" };

export interface WindowMetrics {
  xp: number;
  coins: number;
  tasksDone: number;
  habitsDone: number;
  habitDays: number;
  workouts: number;
  workoutMinutes: number;
  pagesRead: number;
  readingDays: number;
  studyMinutes: number;
  focusMinutes: number;
  sleepAvgMinutes: number | null;
  moodAvg: number | null;
  energyAvg: number | null;
  journalDays: number;
  goalsCompleted: number;
  contractsFulfilled: number;
  projectsCompleted: number;
  lifeScore: number | null;
  lifeScoreDays: number;
  dims: Record<Dim, number | null>;
  days: number;
}

const one = (rows: unknown[], key = "n") => Number((rows[0] as Record<string, unknown> | undefined)?.[key] ?? 0);
const avg = (rows: unknown[], key = "v") => {
  const v = (rows[0] as Record<string, unknown> | undefined)?.[key];
  return v == null ? null : Math.round(Number(v) * 10) / 10;
};

export async function windowMetrics(db: Client, ownerId: string, from: string, to: string, tz: string): Promise<WindowMetrics> {
  const w = (column: string) => localDaysWhere(column, from, to, tz);
  const q = (head: string, column: string) => {
    const f = w(column);
    return db.execute({ sql: `${head} AND ${f.sql}`, args: [ownerId, ...f.args] });
  };
  const a = [ownerId, from, to];
  const [xp, coins, tasks, habits, habitDays, workouts, pages, readDays, study, focus, sleep, mood, journal, goals, contracts, projects, life] = await Promise.all([
    db.execute({ sql: "SELECT COALESCE(SUM(xp), 0) AS n FROM xp_events WHERE owner_id = ? AND day_key BETWEEN ? AND ?", args: a }),
    q("SELECT COALESCE(SUM(amount), 0) AS n FROM coin_ledger WHERE owner_id = ? AND amount > 0", "created_at"),
    q("SELECT COUNT(*) AS n FROM tasks WHERE owner_id = ? AND status = 'Concluído'", "COALESCE(completed_at, updated_at)"),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM habit_entries he JOIN habits h ON h.id = he.habit_id WHERE he.owner_id = ? AND he.entry_date BETWEEN ? AND ? AND he.count >= h.target_count", args: a }),
    db.execute({ sql: "SELECT COUNT(DISTINCT he.entry_date) AS n FROM habit_entries he JOIN habits h ON h.id = he.habit_id WHERE he.owner_id = ? AND he.entry_date BETWEEN ? AND ? AND he.count >= h.target_count", args: a }),
    q("SELECT COUNT(*) AS n, COALESCE(SUM(duration_minutes), 0) AS m FROM workouts WHERE owner_id = ?", "performed_at"),
    q("SELECT COALESCE(SUM(pages_read), 0) AS n FROM reading_sessions WHERE owner_id = ?", "started_at"),
    q("SELECT COUNT(DISTINCT substr(started_at, 1, 10)) AS n FROM reading_sessions WHERE owner_id = ?", "started_at"),
    q("SELECT COALESCE(SUM(duration_minutes), 0) AS n FROM study_sessions WHERE owner_id = ?", "occurred_at"),
    q("SELECT COALESCE(SUM(duration_minutes), 0) AS n FROM time_entries WHERE owner_id = ?", "started_at"),
    q("SELECT AVG(duration_minutes) AS v FROM sleep_entries WHERE owner_id = ?", "went_to_bed_at"),
    q("SELECT AVG(mood) AS v, AVG(energy) AS e FROM mood_entries WHERE owner_id = ?", "recorded_at"),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM journal_entries WHERE owner_id = ? AND entry_date BETWEEN ? AND ? AND (COALESCE(thoughts, '') != '' OR COALESCE(closing_reflection, '') != '')", args: a }),
    q("SELECT COUNT(*) AS n FROM goals WHERE owner_id = ? AND status = 'done'", "completed_at"),
    q("SELECT COUNT(*) AS n FROM contracts WHERE owner_id = ? AND status = 'concluido'", "completed_at"),
    q("SELECT COUNT(*) AS n FROM projects WHERE owner_id = ? AND status = 'completed'", "completed_at"),
    db.execute({
      sql: `SELECT COUNT(*) AS n, AVG(overall_score) AS v, AVG(productivity) AS productivity, AVG(health) AS health, AVG(habits) AS habits, AVG(goals) AS goals,
                   AVG(education) AS education, AVG(reading) AS reading, AVG(professional) AS professional
            FROM life_scores WHERE owner_id = ? AND score_date BETWEEN ? AND ?`,
      args: a,
    }),
  ]);
  const lr = life.rows[0] as Record<string, unknown> | undefined;
  const dims = Object.fromEntries(DIMS.map((d) => [d, lr?.[d] == null ? null : Math.round(Number(lr[d]))])) as Record<Dim, number | null>;
  return {
    xp: one(xp.rows),
    coins: one(coins.rows),
    tasksDone: one(tasks.rows),
    habitsDone: one(habits.rows),
    habitDays: one(habitDays.rows),
    workouts: one(workouts.rows),
    workoutMinutes: one(workouts.rows, "m"),
    pagesRead: one(pages.rows),
    readingDays: one(readDays.rows),
    studyMinutes: one(study.rows),
    focusMinutes: one(focus.rows),
    sleepAvgMinutes: avg(sleep.rows) == null ? null : Math.round(avg(sleep.rows)!),
    moodAvg: avg(mood.rows),
    energyAvg: avg(mood.rows, "e"),
    journalDays: one(journal.rows),
    goalsCompleted: one(goals.rows),
    contractsFulfilled: one(contracts.rows),
    projectsCompleted: one(projects.rows),
    lifeScore: lr?.v == null ? null : Math.round(Number(lr.v)),
    lifeScoreDays: one(life.rows),
    dims,
    days: daysBetween(from, to) + 1,
  };
}

export interface Indicator {
  key: keyof WindowMetrics;
  label: string;
  unit: string;
  kind: "sum" | "avg";
  value: number | null;
  previous: number | null;
  delta: number | null;
  deltaPct: number | null;
  note: string | null;
}
const INDICATORS: Array<{ key: keyof WindowMetrics; label: string; unit: string; kind: "sum" | "avg" }> = [
  { key: "xp", label: "XP conquistado", unit: "XP", kind: "sum" },
  { key: "coins", label: "Moedas", unit: "moedas", kind: "sum" },
  { key: "tasksDone", label: "Missões concluídas", unit: "missões", kind: "sum" },
  { key: "habitsDone", label: "Hábitos cumpridos", unit: "check-ins", kind: "sum" },
  { key: "habitDays", label: "Dias com hábitos", unit: "dias", kind: "sum" },
  { key: "workouts", label: "Treinos", unit: "treinos", kind: "sum" },
  { key: "pagesRead", label: "Páginas lidas", unit: "páginas", kind: "sum" },
  { key: "readingDays", label: "Dias de leitura", unit: "dias", kind: "sum" },
  { key: "studyMinutes", label: "Estudo", unit: "min", kind: "sum" },
  { key: "focusMinutes", label: "Tempo de foco", unit: "min", kind: "sum" },
  { key: "sleepAvgMinutes", label: "Sono médio", unit: "min/noite", kind: "avg" },
  { key: "energyAvg", label: "Energia média", unit: "/5", kind: "avg" },
  { key: "journalDays", label: "Dias com Diário", unit: "dias", kind: "sum" },
  { key: "goalsCompleted", label: "Metas concluídas", unit: "metas", kind: "sum" },
  { key: "contractsFulfilled", label: "Contratos cumpridos", unit: "contratos", kind: "sum" },
  { key: "projectsCompleted", label: "Projetos concluídos", unit: "projetos", kind: "sum" },
  { key: "lifeScore", label: "Life Score médio", unit: "/100", kind: "avg" },
];

export function compareIndicators(cur: WindowMetrics, prev: WindowMetrics | null, partial: boolean): Indicator[] {
  return INDICATORS.map((d) => {
    const value = cur[d.key] as number | null;
    const previous = prev ? (prev[d.key] as number | null) : null;
    // Ausência de base não vira “−100%”: sem valor anterior (ou zero), não há variação percentual.
    const delta = value != null && previous != null ? Math.round((value - previous) * 10) / 10 : null;
    const deltaPct = delta != null && previous != null && previous !== 0 ? Math.round((delta / Math.abs(previous)) * 100) : null;
    const note = prev == null ? "Comparação desativada." : previous == null ? "Sem dados no período anterior." : previous === 0 && value != null && value > 0 ? "Sem base anterior (era zero)." : partial ? "Comparação parcial: mesmo número de dias do período anterior." : null;
    return { key: d.key, label: d.label, unit: d.unit, kind: d.kind, value, previous, delta, deltaPct, note };
  });
}

/* ───────────────────────────── séries e linha do tempo ───────────────────────────── */

interface Bucket {
  label: string;
  from: string;
  to: string;
}
export function bucketsOf(kind: ReviewKind, from: string, to: string): Bucket[] {
  const out: Bucket[] = [];
  if (kind === "weekly") {
    for (let i = 0; i <= daysBetween(from, to); i++) {
      const d = addDays(from, i);
      out.push({ label: ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][new Date(`${d}T12:00:00Z`).getUTCDay()]!, from: d, to: d });
    }
  } else if (kind === "annual") {
    for (let m = 0; m < 12; m++) {
      const s = `${from.slice(0, 4)}-${String(m + 1).padStart(2, "0")}-01`;
      const e = new Date(Date.UTC(Number(from.slice(0, 4)), m + 1, 0)).toISOString().slice(0, 10);
      out.push({ label: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"][m]!, from: s, to: e });
    }
  } else {
    let s = from;
    let i = 1;
    while (s <= to) {
      const e = addDays(mondayOf(s), 6) < to ? addDays(mondayOf(s), 6) : to;
      out.push({ label: `Sem ${i++}`, from: s, to: e });
      s = addDays(e, 1);
    }
  }
  return out;
}

export async function seriesOf(db: Client, ownerId: string, kind: ReviewKind, from: string, to: string, tz: string, until: string) {
  const buckets = bucketsOf(kind, from, to);
  const [life, tasks, habits] = await Promise.all([
    db.execute({ sql: `SELECT score_date, overall_score, ${DIMS.join(", ")} FROM life_scores WHERE owner_id = ? AND score_date BETWEEN ? AND ?`, args: [ownerId, from, to] }),
    db.execute({ sql: "SELECT COALESCE(completed_at, updated_at) AS at FROM tasks WHERE owner_id = ? AND status = 'Concluído' AND COALESCE(completed_at, updated_at) >= ? AND COALESCE(completed_at, updated_at) < ?", args: [ownerId, addDays(from, -1), addDays(to, 2)] }),
    db.execute({ sql: "SELECT he.entry_date AS d, COUNT(*) AS n FROM habit_entries he JOIN habits h ON h.id = he.habit_id WHERE he.owner_id = ? AND he.entry_date BETWEEN ? AND ? AND he.count >= h.target_count GROUP BY he.entry_date", args: [ownerId, from, to] }),
  ]);
  const taskDays = (tasks.rows as Array<Record<string, unknown>>).map((r) => dayKeyIn(new Date(String(r.at).includes("T") ? String(r.at) : `${String(r.at).replace(" ", "T")}Z`), tz));
  const habitRows = habits.rows as Array<Record<string, unknown>>;
  const lifeRows = life.rows as Array<Record<string, unknown>>;
  return buckets.map((b) => {
    const inB = (d: string) => d >= b.from && d <= b.to;
    const lr = lifeRows.filter((r) => inB(String(r.score_date)));
    const mean = (k: string) => {
      const v = lr.map((r) => r[k]).filter((x) => x != null).map(Number);
      return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null;
    };
    return {
      label: b.label,
      from: b.from,
      to: b.to,
      future: b.from > until,
      lifeScore: mean("overall_score"),
      ...Object.fromEntries(DIMS.map((d) => [d, mean(d)])),
      tasksDone: taskDays.filter(inB).length,
      habitsDone: habitRows.filter((r) => inB(String(r.d))).reduce((s, r) => s + Number(r.n), 0),
    };
  });
}

async function timelineOf(db: Client, ownerId: string, from: string, to: string, tz: string, limit: number) {
  const w = (col: string) => localDaysWhere(col, from, to, tz);
  const run = (sql: string, col: string) => {
    const f = w(col);
    return db.execute({ sql: `${sql} AND ${f.sql}`, args: [ownerId, ...f.args] });
  };
  const [ach, goals, contracts, projects, epic, campaigns] = await Promise.all([
    run("SELECT a.title AS t, a.tier AS x, ua.unlocked_at AS at FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id WHERE ua.owner_id = ?", "ua.unlocked_at"),
    run("SELECT title AS t, completed_at AS at FROM goals WHERE owner_id = ? AND status = 'done'", "completed_at"),
    run("SELECT title AS t, completed_at AS at FROM contracts WHERE owner_id = ? AND status = 'concluido'", "completed_at"),
    run("SELECT name AS t, completed_at AS at FROM projects WHERE owner_id = ? AND status = 'completed'", "completed_at"),
    run("SELECT title AS t, completed_at AS at FROM tasks WHERE owner_id = ? AND status = 'Concluído' AND difficulty IN ('dificil', 'epico')", "completed_at"),
    run("SELECT title AS t, completed_at AS at FROM campaigns WHERE owner_id = ? AND status = 'completed'", "completed_at"),
  ]);
  const ev: Array<{ kind: string; title: string; at: string; detail: string | null }> = [];
  const push = (kind: string, rows: unknown[], detail?: (r: Record<string, unknown>) => string | null) => {
    for (const r of rows as Array<Record<string, unknown>>) if (r.at) ev.push({ kind, title: String(r.t), at: String(r.at), detail: detail ? detail(r) : null });
  };
  push("conquista", ach.rows, (r) => (r.x ? String(r.x) : null));
  push("meta", goals.rows);
  push("contrato", contracts.rows);
  push("projeto", projects.rows);
  push("missao_epica", epic.rows);
  push("campanha", campaigns.rows);
  return { events: ev.sort((a, b) => a.at.localeCompare(b.at)).slice(-limit), achievements: ach.rows.length };
}

/* ───────────────────────────── perguntas por período ───────────────────────────── */

export const QUESTIONS: Record<ReviewKind, Array<{ key: string; label: string; hint: string }>> = {
  weekly: [
    { key: "worked", label: "O que funcionou?", hint: "Vitórias, estratégias eficazes, hábitos consistentes, resultados positivos." },
    { key: "didnt", label: "O que não funcionou?", hint: "Obstáculos, dificuldades, pendências, interrupções, falhas de planejamento." },
    { key: "learned", label: "O que aprendi?", hint: "Um aprendizado que vale levar para a próxima semana." },
  ],
  monthly: [
    { key: "how", label: "Como foi o mês?", hint: "Um retrato honesto em poucas frases." },
    { key: "wins", label: "Principais conquistas", hint: "O que você realizou e quer lembrar." },
    { key: "worked", label: "O que funcionou?", hint: "Estratégias e rotinas que deram certo." },
    { key: "improve", label: "O que precisa melhorar?", hint: "Onde o mês ficou aquém." },
    { key: "goals", label: "Quais metas avançaram?", hint: "E quanto avançaram." },
    { key: "pending", label: "O que ficou pendente?", hint: "Objetivos que não andaram." },
    { key: "learned", label: "O que aprendi?", hint: "Aprendizados do mês." },
  ],
  quarterly: [
    { key: "goals", label: "Quais metas avançaram?", hint: "Avanço real nos objetivos de médio prazo." },
    { key: "rhythm", label: "O que aprendi sobre meu ritmo?", hint: "Quando você rende mais, onde perde energia." },
    { key: "change", label: "O que precisa mudar?", hint: "Mudanças de estratégia." },
    { key: "continue", label: "Quais projetos devem continuar?", hint: "E quais devem ser pausados ou encerrados." },
    { key: "replan", label: "O que deve ser replanejado?", hint: "Objetivos com prazo ou escopo irreais." },
  ],
  annual: [
    { key: "proud", label: "Do que mais me orgulho?", hint: "As conquistas que marcaram o ano." },
    { key: "challenges", label: "Quais desafios enfrentei?", hint: "E como lidou com eles." },
    { key: "learned", label: "Quais aprendizados foram importantes?", hint: "Lições que mudam o próximo ano." },
    { key: "differently", label: "O que faria diferente?", hint: "Com o que sabe hoje." },
    { key: "professional", label: "Como evoluí profissionalmente?", hint: "Trabalho, carreira, projetos." },
    { key: "academic", label: "Como evoluí academicamente?", hint: "Estudos, cursos, pesquisa." },
    { key: "personal", label: "Como evoluí pessoalmente?", hint: "Saúde, relações, hábitos." },
    { key: "build", label: "O que desejo construir no próximo ano?", hint: "A visão para o próximo capítulo." },
  ],
};
export const WEEKLY_STEPS = ["retrato", "funcionou", "nao_funcionou", "melhorar", "proxima"] as const;
const DEFAULT_REQUIRED: Record<ReviewKind, number> = { weekly: 1, monthly: 2, quarterly: 2, annual: 3 };

/* ───────────────────────────── estado salvo ───────────────────────────── */

export interface ReviewAction {
  id: string;
  text: string;
  convertedTo: "missao" | "habito" | "meta" | "experimento" | "protocolo" | null;
  refId: string | null;
}
export interface ReviewPlan {
  objective: string;
  priorities: string[];
  focus: FocusRef[];
  goalIds: string[];
  missionIds: string[];
  habitIds: string[];
  notes: string;
}
const EMPTY_PLAN: ReviewPlan = { objective: "", priorities: [], focus: [], goalIds: [], missionIds: [], habitIds: [], notes: "" };

interface Stored {
  id: string | null;
  steps: string[];
  answers: Record<string, string>;
  reflection: string;
  actions: ReviewAction[];
  plan: ReviewPlan;
  status: "draft" | "sealed";
  sealedAt: string | null;
  planAppliedAt: string | null;
  revision: number;
  updatedAt: string | null;
  snapshot: unknown;
  legacy: boolean;
}

const J = <T>(v: unknown, fb: T): T => {
  if (v == null) return fb;
  try {
    return JSON.parse(String(v)) as T;
  } catch {
    return fb;
  }
};

async function loadStored(db: Client, ownerId: string, kind: ReviewKind, key: string): Promise<Stored> {
  const r = await db.execute({ sql: "SELECT * FROM journey_reviews WHERE owner_id = ? AND kind = ? AND period_key = ?", args: [ownerId, kind, key] });
  const x = r.rows[0] as Record<string, unknown> | undefined;
  if (x) {
    return {
      id: String(x.id),
      steps: J<string[]>(x.steps_json, []),
      answers: J<Record<string, string>>(x.answers_json, {}),
      reflection: String(x.reflection ?? ""),
      actions: J<ReviewAction[]>(x.actions_json, []),
      plan: { ...EMPTY_PLAN, ...J<Partial<ReviewPlan>>(x.plan_json, {}) },
      status: x.status === "sealed" ? "sealed" : "draft",
      sealedAt: x.sealed_at ? String(x.sealed_at) : null,
      planAppliedAt: x.plan_applied_at ? String(x.plan_applied_at) : null,
      revision: Number(x.revision ?? 0),
      updatedAt: String(x.updated_at),
      snapshot: J<unknown>(x.snapshot_json, null),
      legacy: false,
    };
  }
  // Primeira abertura: aproveita o que já existia nas revisões antigas (nada é perdido).
  const empty: Stored = { id: null, steps: [], answers: {}, reflection: "", actions: [], plan: { ...EMPTY_PLAN }, status: "draft", sealedAt: null, planAppliedAt: null, revision: 0, updatedAt: null, snapshot: null, legacy: false };
  if (kind === "weekly") {
    const w = await db.execute({ sql: "SELECT what_worked, what_didnt_work, what_to_improve, next_priorities, created_at FROM weekly_reviews WHERE owner_id = ? AND week_start_date = ?", args: [ownerId, key] });
    const l = w.rows[0] as Record<string, unknown> | undefined;
    if (l) {
      const improve = String(l.what_to_improve ?? "").trim();
      return {
        ...empty,
        answers: { worked: String(l.what_worked ?? ""), didnt: String(l.what_didnt_work ?? "") },
        actions: improve ? improve.split(/\n+/).filter(Boolean).map((t) => ({ id: nanoid(8), text: t.slice(0, 300), convertedTo: null, refId: null })) : [],
        plan: { ...EMPTY_PLAN, priorities: String(l.next_priorities ?? "").split(/\n+/).filter(Boolean).slice(0, 5) },
        updatedAt: String(l.created_at),
        legacy: true,
      };
    }
  } else {
    const p = await db.execute({ sql: "SELECT wins, lessons, focus_next, updated_at FROM periodic_reviews WHERE owner_id = ? AND kind = ? AND period_key = ?", args: [ownerId, kind, key] });
    const l = p.rows[0] as Record<string, unknown> | undefined;
    if (l) {
      const winsKey = kind === "annual" ? "proud" : kind === "quarterly" ? "goals" : "wins";
      const learnKey = kind === "quarterly" ? "rhythm" : "learned";
      return { ...empty, answers: { [winsKey]: String(l.wins ?? ""), [learnKey]: String(l.lessons ?? "") }, plan: { ...EMPTY_PLAN, objective: String(l.focus_next ?? "") }, updatedAt: String(l.updated_at), legacy: true };
    }
  }
  return empty;
}

const filledAnswers = (s: Pick<Stored, "answers" | "reflection">) => Object.values(s.answers).filter((v) => typeof v === "string" && v.replace(/<[^>]+>/g, "").trim().length > 0).length + (s.reflection.replace(/<[^>]+>/g, "").trim() ? 1 : 0);

/* ───────────────────────────── visão completa ───────────────────────────── */

export async function getReview(db: Client, ownerId: string, kind: ReviewKind, keyRaw?: string | null) {
  const today = await todayKeyFor(db, ownerId);
  const tz = await userTimezone(db, ownerId);
  const key = keyRaw ?? currentKey(kind, today);
  if (!isValidKey(kind, key)) throw new ReviewError("Período inválido.");
  const range = rangeOf(kind, key);
  if (range.from > today) throw new ReviewError("Esse período ainda não começou.");
  const inProgress = range.to >= today;
  const until = inProgress ? today : range.to;
  const elapsed = daysBetween(range.from, until) + 1;
  const prevKey = shiftKey(kind, key, -1);
  const prevRange = rangeOf(kind, prevKey);
  const prevTo = inProgress ? (addDays(prevRange.from, elapsed - 1) < prevRange.to ? addDays(prevRange.from, elapsed - 1) : prevRange.to) : prevRange.to;
  const compareOn = (await automationConfig(db, ownerId, "reviews", "comparison")).enabled;

  const [cur, prev, series, prevSeries, stored, goals, timeline, reward, settings, revisor, history] = await Promise.all([
    windowMetrics(db, ownerId, range.from, until, tz),
    compareOn ? windowMetrics(db, ownerId, prevRange.from, prevTo, tz) : Promise.resolve(null),
    seriesOf(db, ownerId, kind, range.from, range.to, tz, until),
    kind === "weekly" ? Promise.resolve(null) : seriesOf(db, ownerId, kind, prevRange.from, prevRange.to, tz, prevRange.to),
    loadStored(db, ownerId, kind, key),
    loadDirectionGoals(db, ownerId),
    timelineOf(db, ownerId, range.from, until, tz, kind === "annual" ? 60 : 20),
    reviewRewardStatus(db, ownerId, kind, key),
    reviewSettings(db, ownerId),
    revisorOf(db, ownerId),
    listHistory(db, ownerId, 24),
  ]);
  const indicators = compareIndicators(cur, prev, inProgress);
  const radar = DIMS.map((d) => ({ key: d, label: DIM_LABEL[d], value: cur.dims[d], previous: prev?.dims[d] ?? null }));
  const goalsView = goals
    .filter((g) => g.status === "active" || (g.status === "done" && g.cycle && g.cycle.startsWith(key.slice(0, 4))))
    .sort((a, b) => (b.progressPct ?? -1) - (a.progressPct ?? -1))
    .slice(0, 8)
    .map((g) => ({ id: g.id, title: g.title, status: g.status, progressPct: g.progressPct, cycle: g.cycle, lifeArea: g.lifeArea, openTasks: g.openTasks, doneTasks: g.doneTasks }));
  const eligible = kind === "weekly" ? (() => {
    const age = daysBetween(key, today);
    return age >= 0 && age < 14;
  })() : await isReviewRewardEligible(db, ownerId, kind, key);
  const required = settings[kind];
  const filled = filledAnswers(stored);
  const canSeal = filled >= required && (kind !== "weekly" || stored.plan.priorities.length + stored.plan.focus.length > 0 || stored.actions.length > 0);
  const insights = await insightsOf(db, ownerId, indicators, goalsView);
  // I — Missões → Revisões: pendências reais da execução entram no retrato (desativável nas automações de Missões).
  const feed = (await automationConfig(db, ownerId, "missions", "reviews_feed")).enabled;
  const pendingR = feed
    ? await db.execute({
        sql: `SELECT id, title, status, due_date FROM tasks WHERE owner_id = ? AND status != 'Concluído' AND archived_at IS NULL
              AND ((due_date IS NOT NULL AND substr(due_date, 1, 10) <= ?) OR status = 'Em Revisão') ORDER BY due_date LIMIT 8`,
        args: [ownerId, until],
      })
    : null;
  const missionsPending = pendingR ? (pendingR.rows as Array<Record<string, unknown>>).map((r) => ({ id: String(r.id), title: String(r.title), status: String(r.status), dueDate: r.due_date ? String(r.due_date).slice(0, 10) : null })) : null;
  return {
    kind,
    key,
    label: range.label,
    range: { from: range.from, to: range.to, until, inProgress, elapsedDays: elapsed, totalDays: daysBetween(range.from, range.to) + 1 },
    previous: { key: prevKey, label: prevRange.label, from: prevRange.from, to: prevTo, partial: inProgress },
    nav: { prevKey, nextKey: shiftKey(kind, key, 1) <= currentKey(kind, today) ? shiftKey(kind, key, 1) : null, currentKey: currentKey(kind, today) },
    indicators,
    lifeScoreDays: cur.lifeScoreDays,
    series,
    previousSeries: prevSeries,
    radar,
    goals: goalsView,
    timeline: timeline.events,
    questions: QUESTIONS[kind],
    steps: kind === "weekly" ? WEEKLY_STEPS : [],
    review: { ...stored, snapshot: undefined },
    seal: { canSeal, required, filled, sealed: stored.status === "sealed", sealedAt: stored.sealedAt, reason: canSeal ? null : kind === "weekly" ? `Preencha ${required} reflexão e defina ao menos uma prioridade ou ação para a próxima semana.` : `Responda pelo menos ${required} perguntas da revisão ${KIND_LABEL[kind]}.` },
    chest: { ...reward, eligible, sealed: stored.status === "sealed", rule: "Recompensa oficial de fechamento de ciclo: uma vez por período, só para o período atual ou o imediatamente anterior." },
    seals: sealsOf(kind, stored, reward),
    revisor,
    history,
    insights,
    missionsPending,
    settings,
  };
}

function sealsOf(kind: ReviewKind, s: Stored, reward: { awarded: boolean; awardedAt: string | null; xp: number; coins: number }) {
  const names: Record<ReviewKind, string> = { weekly: "Revisão semanal concluída", monthly: "Ciclo mensal encerrado", quarterly: "Trimestre analisado", annual: "Jornada anual registrada" };
  return [
    { code: `sealed_${kind}`, name: names[kind], criterion: `Selar a revisão ${KIND_LABEL[kind]} deste período.`, done: s.status === "sealed", at: s.sealedAt, reward: reward.awarded ? `+${reward.xp} XP · +${reward.coins} moedas` : null },
    { code: "plan_confirmed", name: "Plano confirmado", criterion: "Aplicar o plano do próximo ciclo depois de revisá-lo.", done: !!s.planAppliedAt, at: s.planAppliedAt, reward: null },
  ];
}

/** Insights determinísticos (dado real → inferência), sem IA. */
async function insightsOf(db: Client, ownerId: string, ind: Indicator[], goals: Array<{ title: string; progressPct: number | null; openTasks: number }>) {
  const bottleneckOn = (await automationConfig(db, ownerId, "reviews", "bottlenecks")).enabled;
  const out: Array<{ kind: "alta" | "queda" | "meta"; title: string; text: string; indicator: string | null }> = [];
  const moves = ind.filter((i) => i.deltaPct != null && i.previous != null && i.previous >= 3 && Math.abs(i.deltaPct) >= 20 && i.key !== "coins");
  for (const i of moves.filter((m) => m.deltaPct! > 0).sort((a, b) => b.deltaPct! - a.deltaPct!).slice(0, 2)) out.push({ kind: "alta", title: `${i.label} em alta`, text: `${i.previous} → ${i.value} ${i.unit} (${i.deltaPct! > 0 ? "+" : ""}${i.deltaPct}%).`, indicator: i.key });
  if (bottleneckOn) {
    for (const i of moves.filter((m) => m.deltaPct! < 0).sort((a, b) => a.deltaPct! - b.deltaPct!).slice(0, 2)) out.push({ kind: "queda", title: `Atenção: ${i.label.toLowerCase()}`, text: `${i.previous} → ${i.value} ${i.unit} (${i.deltaPct}%).`, indicator: i.key });
    for (const g of goals.filter((x) => (x.progressPct ?? 0) < 30 && x.openTasks === 0).slice(0, 1)) out.push({ kind: "meta", title: `Meta sem próxima missão`, text: `“${g.title}” está em ${g.progressPct ?? 0}% e não tem missão aberta.`, indicator: null });
  }
  return out;
}

/* ───────────────────────────── configurações ───────────────────────────── */

export async function reviewSettings(db: Client, ownerId: string): Promise<Record<ReviewKind, number>> {
  const r = await db.execute({ sql: "SELECT required_json FROM journey_review_settings WHERE owner_id = ?", args: [ownerId] });
  const saved = J<Partial<Record<ReviewKind, number>>>(r.rows[0]?.required_json, {});
  return Object.fromEntries(REVIEW_KINDS.map((k) => [k, Math.max(1, Math.min(QUESTIONS[k].length + 1, Number(saved[k] ?? DEFAULT_REQUIRED[k])))])) as Record<ReviewKind, number>;
}
export async function saveReviewSettings(db: Client, ownerId: string, required: Partial<Record<ReviewKind, number>>) {
  const cur = await reviewSettings(db, ownerId);
  const next = { ...cur, ...Object.fromEntries(Object.entries(required).map(([k, v]) => [k, Math.max(1, Math.min(QUESTIONS[k as ReviewKind].length + 1, Number(v)))])) };
  await db.execute({
    sql: "INSERT INTO journey_review_settings (owner_id, required_json) VALUES (?, ?) ON CONFLICT (owner_id) DO UPDATE SET required_json = excluded.required_json, updated_at = datetime('now')",
    args: [ownerId, JSON.stringify(next)],
  });
  return next;
}

/* ───────────────────────────── salvar, selar, recompensa ───────────────────────────── */

export interface ReviewPatch {
  steps?: string[];
  answers?: Record<string, string>;
  reflection?: string;
  actions?: ReviewAction[];
  plan?: Partial<ReviewPlan>;
  baseUpdatedAt?: string | null;
}

async function mirrorLegacy(db: Client, ownerId: string, kind: ReviewKind, key: string, s: Stored) {
  const strip = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (kind === "weekly") {
    const to = addDays(key, 7);
    const [metrics, life] = await Promise.all([computeRangeMetrics(ownerId, key, to), computeLifeScore(ownerId, addDays(to, -1))]);
    await db.execute({
      sql: `INSERT INTO weekly_reviews (id, owner_id, week_start_date, productivity_pct, health_pct, education_pct, reading_pct, habits_pct, tasks_completed, pages_read, what_worked, what_didnt_work, what_to_improve, next_priorities)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (owner_id, week_start_date) DO UPDATE SET productivity_pct = excluded.productivity_pct, health_pct = excluded.health_pct, education_pct = excluded.education_pct,
              reading_pct = excluded.reading_pct, habits_pct = excluded.habits_pct, tasks_completed = excluded.tasks_completed, pages_read = excluded.pages_read,
              what_worked = excluded.what_worked, what_didnt_work = excluded.what_didnt_work, what_to_improve = excluded.what_to_improve, next_priorities = excluded.next_priorities`,
      args: [nanoid(), ownerId, key, life.productivity, life.health, life.education, life.reading, life.habits, metrics.tasksCompleted, metrics.pagesRead, strip(s.answers.worked ?? "") || null, strip(s.answers.didnt ?? "") || null, s.actions.map((a) => a.text).join("\n") || null, s.plan.priorities.join("\n") || null],
    });
  } else {
    const wins = strip(s.answers.wins ?? s.answers.proud ?? s.answers.goals ?? s.answers.how ?? "");
    const lessons = strip(s.answers.learned ?? s.answers.rhythm ?? s.answers.change ?? "");
    await savePeriodicReview(db, ownerId, kind, key, { wins: wins || null, lessons: lessons || null, focusNext: (s.plan.objective || s.plan.priorities.join("; ")).slice(0, 2000) || null, energyScore: null });
  }
}

export async function saveReview(db: Client, ownerId: string, kind: ReviewKind, key: string, patch: ReviewPatch) {
  if (!isValidKey(kind, key)) throw new ReviewError("Período inválido.");
  const today = await todayKeyFor(db, ownerId);
  if (rangeOf(kind, key).from > today) throw new ReviewError("Esse período ainda não começou.");
  const cur = await loadStored(db, ownerId, kind, key);
  // Proteção contra sobrescrever edição feita em outra aba/dispositivo.
  if (patch.baseUpdatedAt !== undefined && cur.id && cur.updatedAt && patch.baseUpdatedAt !== cur.updatedAt) throw new ReviewError("Esta revisão foi alterada em outro lugar. Recarregue para não perder nada.", 409);
  const next: Stored = {
    ...cur,
    steps: patch.steps ?? cur.steps,
    answers: patch.answers ? { ...cur.answers, ...Object.fromEntries(Object.entries(patch.answers).map(([k, v]) => [k, String(v).slice(0, 8000)])) } : cur.answers,
    reflection: patch.reflection != null ? patch.reflection.slice(0, 40_000) : cur.reflection,
    actions: patch.actions ? patch.actions.slice(0, 15).map((a) => ({ id: a.id || nanoid(8), text: String(a.text).slice(0, 300), convertedTo: a.convertedTo ?? null, refId: a.refId ?? null })) : cur.actions,
    plan: patch.plan ? { ...cur.plan, ...patch.plan, priorities: (patch.plan.priorities ?? cur.plan.priorities).slice(0, 5).map((p) => String(p).slice(0, 200)) } : cur.plan,
  };
  if (patch.plan?.focus) next.plan.focus = await validateFocus(db, ownerId, patch.plan.focus.slice(0, 3));
  const id = cur.id ?? nanoid();
  if (cur.status === "sealed") {
    // Correção depois do selo: registra o que mudou (sem nova recompensa).
    const changed = Object.fromEntries(
      (["answers", "reflection", "actions", "plan", "steps"] as const).filter((k) => JSON.stringify(cur[k]) !== JSON.stringify(next[k])).map((k) => [k, { before: cur[k], after: next[k] }]),
    );
    if (Object.keys(changed).length) {
      await db.execute({ sql: "INSERT INTO journey_review_revisions (id, owner_id, review_id, revision, changed_json) VALUES (?, ?, ?, ?, ?)", args: [nanoid(), ownerId, id, cur.revision + 1, JSON.stringify(changed).slice(0, 100_000)] });
      next.revision = cur.revision + 1;
    }
  }
  await db.execute({
    sql: `INSERT INTO journey_reviews (id, owner_id, kind, period_key, steps_json, answers_json, reflection, actions_json, plan_json, revision)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (owner_id, kind, period_key) DO UPDATE SET steps_json = excluded.steps_json, answers_json = excluded.answers_json, reflection = excluded.reflection,
            actions_json = excluded.actions_json, plan_json = excluded.plan_json, revision = excluded.revision, updated_at = datetime('now')`,
    args: [id, ownerId, kind, key, JSON.stringify(next.steps), JSON.stringify(next.answers), next.reflection, JSON.stringify(next.actions), JSON.stringify(next.plan), next.revision],
  });
  if (cur.status === "sealed" || filledAnswers(next) > 0) await mirrorLegacy(db, ownerId, kind, key, next).catch((e: unknown) => console.warn("[revisoes] espelho legado:", e instanceof Error ? e.message : "erro"));
  const saved = await loadStored(db, ownerId, kind, key);
  return { updatedAt: saved.updatedAt, revision: saved.revision, status: saved.status };
}

/** Sela a revisão: valida, guarda o retrato, espelha, integra (Conselho, Crônica, conquistas). Recompensa é no baú (claim). */
export async function sealReview(db: Client, ownerId: string, kind: ReviewKind, key: string) {
  const view = await getReview(db, ownerId, kind, key);
  if (view.seal.sealed) return { alreadySealed: true, sealedAt: view.seal.sealedAt, warCouncil: null };
  if (!view.seal.canSeal) throw new ReviewError(view.seal.reason ?? "Revisão incompleta.");
  const stored = await loadStored(db, ownerId, kind, key);
  if (!stored.id) throw new ReviewError("Salve a revisão antes de selar.");
  const snapshot = { indicators: view.indicators, radar: view.radar, range: view.range, sealedFrom: "journey-3.0" };
  const upd = await db.execute({
    sql: "UPDATE journey_reviews SET status = 'sealed', sealed_at = datetime('now'), snapshot_json = ?, updated_at = datetime('now') WHERE owner_id = ? AND kind = ? AND period_key = ? AND status = 'draft'",
    args: [JSON.stringify(snapshot), ownerId, kind, key],
  });
  if (upd.rowsAffected === 0) return { alreadySealed: true, sealedAt: view.seal.sealedAt, warCouncil: null };
  await mirrorLegacy(db, ownerId, kind, key, stored).catch(() => undefined);
  const [chronicle, council, ach] = await Promise.all([
    automationConfig(db, ownerId, "reviews", "chronicle"),
    automationConfig(db, ownerId, "reviews", "war_council"),
    automationConfig(db, ownerId, "reviews", "achievements"),
  ]);
  if (chronicle.enabled) {
    await db
      .execute({ sql: "INSERT OR IGNORE INTO chronicle_marks (owner_id, event_key, label, event_at) VALUES (?, ?, ?, datetime('now'))", args: [ownerId, `review:${kind}:${key}`, `Revisão ${KIND_LABEL[kind]} selada — ${view.label}`] })
      .catch(() => undefined);
  }
  let warCouncil: { weekStart: string; focus: number; priorities: number } | null = null;
  if (kind === "weekly" && council.enabled) warCouncil = await prefillWarCouncil(db, ownerId, key, stored.plan);
  if (ach.enabled) await evaluateAchievements(ownerId).catch(() => undefined);
  return { alreadySealed: false, sealedAt: new Date().toISOString(), warCouncil };
}

/**
 * K — Conselho de Guerra: as prioridades da revisão semanal viram rascunho do
 * plano da semana seguinte (sem selar e sem sobrescrever plano já selado).
 */
async function prefillWarCouncil(db: Client, ownerId: string, weekKey: string, plan: ReviewPlan) {
  const nextWeek = addDays(weekKey, 7);
  const today = await todayKeyFor(db, ownerId);
  if (nextWeek < mondayOf(today)) return null;
  const existing = await db.execute({ sql: "SELECT sealed_at FROM weekly_plans WHERE owner_id = ? AND week_start = ?", args: [ownerId, nextWeek] });
  if (existing.rows[0]?.sealed_at) return null;
  const focus = await validateFocus(db, ownerId, plan.focus.slice(0, 3));
  const notes = plan.priorities.length ? `Prioridades da revisão semanal: ${plan.priorities.join("; ")}` : null;
  await db.execute({
    sql: `INSERT INTO weekly_plans (id, owner_id, week_start, focus, notes, sealed_at) VALUES (?, ?, ?, ?, ?, NULL)
          ON CONFLICT (owner_id, week_start) DO UPDATE SET focus = excluded.focus, notes = COALESCE(excluded.notes, weekly_plans.notes), updated_at = datetime('now')
          WHERE weekly_plans.sealed_at IS NULL`,
    args: [nanoid(), ownerId, nextWeek, JSON.stringify(focus), notes],
  });
  return { weekStart: nextWeek, focus: focus.length, priorities: plan.priorities.length };
}

/** Abre o baú: recompensa oficial uma vez por período (idempotente pela chave review:<tipo>:<período>). */
export async function claimReward(db: Client, ownerId: string, kind: ReviewKind, key: string) {
  const s = await loadStored(db, ownerId, kind, key);
  if (s.status !== "sealed") throw new ReviewError("Sele a revisão para abrir o baú.");
  const before = await reviewRewardStatus(db, ownerId, kind, key);
  if (before.awarded) return { granted: false, alreadyClaimed: true, ...before };
  const today = await todayKeyFor(db, ownerId);
  const eligible = kind === "weekly" ? daysBetween(key, today) >= 0 && daysBetween(key, today) < 14 : await isReviewRewardEligible(db, ownerId, kind, key);
  if (!eligible) return { granted: false, alreadyClaimed: false, ...before, reason: "Só o período atual ou o imediatamente anterior rendem recompensa (evita acumular revisões antigas)." };
  await awardReviewClosed(db, ownerId, kind, key, { eligible: true, hasReflection: true });
  const after = await reviewRewardStatus(db, ownerId, kind, key);
  return { granted: after.awarded, alreadyClaimed: false, ...after };
}

/** Plano confirmado: marca o selo e, na semanal, garante o rascunho do Conselho de Guerra. */
export async function applyPlan(db: Client, ownerId: string, kind: ReviewKind, key: string) {
  const s = await loadStored(db, ownerId, kind, key);
  if (!s.id) throw new ReviewError("Salve a revisão antes de aplicar o plano.");
  if (!s.plan.objective && !s.plan.priorities.length && !s.plan.focus.length) throw new ReviewError("O plano está vazio.");
  await db.execute({ sql: "UPDATE journey_reviews SET plan_applied_at = COALESCE(plan_applied_at, datetime('now')) WHERE owner_id = ? AND kind = ? AND period_key = ?", args: [ownerId, kind, key] });
  const council = kind === "weekly" && (await automationConfig(db, ownerId, "reviews", "war_council")).enabled ? await prefillWarCouncil(db, ownerId, key, s.plan) : null;
  return { applied: true, warCouncil: council };
}

/** L — Agenda: sugere blocos livres na próxima semana para as prioridades (não grava nada). */
export async function suggestBlocks(db: Client, ownerId: string, kind: ReviewKind, key: string) {
  if (!(await automationConfig(db, ownerId, "reviews", "agenda_blocks")).enabled) return { enabled: false, blocks: [] };
  const s = await loadStored(db, ownerId, kind, key);
  const today = await todayKeyFor(db, ownerId);
  const start = kind === "weekly" ? (addDays(key, 7) > today ? addDays(key, 7) : today) : today;
  const blocks: Array<{ title: string; date: string; start: string; minutes: number }> = [];
  const items = s.plan.priorities.length ? s.plan.priorities : s.actions.map((a) => a.text);
  let day = start;
  for (const title of items.slice(0, 5)) {
    for (let tries = 0; tries < 7; tries++) {
      const free = (await getFreeWindows(db, ownerId, day)).find((w) => Number(w.end.slice(0, 2)) * 60 + Number(w.end.slice(3)) - (Number(w.start.slice(0, 2)) * 60 + Number(w.start.slice(3))) >= 60);
      if (free) {
        blocks.push({ title: title.slice(0, 120), date: day, start: free.start, minutes: 60 });
        day = addDays(day, 1);
        break;
      }
      day = addDays(day, 1);
    }
  }
  return { enabled: true, blocks };
}

/* ───────────────────────────── histórico e Revisor ───────────────────────────── */

export async function listHistory(db: Client, ownerId: string, limit = 40) {
  const [j, w, p] = await Promise.all([
    db.execute({ sql: "SELECT kind, period_key, status, sealed_at, plan_applied_at, snapshot_json, updated_at FROM journey_reviews WHERE owner_id = ? ORDER BY period_key DESC LIMIT ?", args: [ownerId, limit] }),
    db.execute({ sql: "SELECT week_start_date AS k, productivity_pct, created_at FROM weekly_reviews WHERE owner_id = ? AND (COALESCE(what_worked,'') != '' OR COALESCE(what_didnt_work,'') != '' OR COALESCE(what_to_improve,'') != '' OR COALESCE(next_priorities,'') != '') ORDER BY week_start_date DESC LIMIT ?", args: [ownerId, limit] }),
    db.execute({ sql: "SELECT kind, period_key AS k, updated_at FROM periodic_reviews WHERE owner_id = ? ORDER BY period_key DESC LIMIT ?", args: [ownerId, limit] }),
  ]);
  const seen = new Set<string>();
  const out: Array<{ kind: ReviewKind; key: string; label: string; status: "sealed" | "draft" | "legacy"; sealedAt: string | null; planApplied: boolean; lifeScore: number | null; tasksDone: number | null; at: string }> = [];
  for (const r of j.rows as Array<Record<string, unknown>>) {
    const kind = r.kind as ReviewKind;
    const key = String(r.period_key);
    seen.add(`${kind}:${key}`);
    const snap = J<{ indicators?: Indicator[] } | null>(r.snapshot_json, null);
    const find = (k: string) => snap?.indicators?.find((i) => i.key === k)?.value ?? null;
    out.push({ kind, key, label: rangeOf(kind, key).label, status: r.status === "sealed" ? "sealed" : "draft", sealedAt: r.sealed_at ? String(r.sealed_at) : null, planApplied: !!r.plan_applied_at, lifeScore: find("lifeScore"), tasksDone: find("tasksDone"), at: String(r.sealed_at ?? r.updated_at) });
  }
  for (const r of w.rows as Array<Record<string, unknown>>) {
    const key = String(r.k);
    if (seen.has(`weekly:${key}`) || !isValidKey("weekly", key)) continue;
    out.push({ kind: "weekly", key, label: rangeOf("weekly", key).label, status: "legacy", sealedAt: null, planApplied: false, lifeScore: null, tasksDone: null, at: String(r.created_at) });
  }
  for (const r of p.rows as Array<Record<string, unknown>>) {
    const kind = r.kind as ReviewKind;
    const key = String(r.k);
    if (seen.has(`${kind}:${key}`)) continue;
    out.push({ kind, key, label: rangeOf(kind, key).label, status: "legacy", sealedAt: null, planApplied: false, lifeScore: null, tasksDone: null, at: String(r.updated_at) });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

export const REVISOR_TITLES = [
  { min: 0, title: "Aprendiz da Reflexão" },
  { min: 5, title: "Observador da Jornada" },
  { min: 15, title: "Guardião dos Ciclos" },
  { min: 35, title: "Estrategista do Tempo" },
  { min: 70, title: "Mestre da Evolução" },
  { min: 120, title: "Cronista Lendário" },
];
const WEIGHT: Record<ReviewKind, number> = { weekly: 1, monthly: 3, quarterly: 6, annual: 12 };

/**
 * Progressão do Revisor — critério objetivo: pontos por revisão registrada
 * (semana 1, mês 3, trimestre 6, ano 12) + 1 por plano confirmado. É só
 * título/nível: XP e moedas continuam vindo apenas do fechamento oficial.
 */
export async function revisorOf(db: Client, ownerId: string) {
  const [j, w, p] = await Promise.all([
    db.execute({ sql: "SELECT kind, period_key, status, plan_applied_at FROM journey_reviews WHERE owner_id = ?", args: [ownerId] }),
    db.execute({ sql: "SELECT week_start_date AS k FROM weekly_reviews WHERE owner_id = ? AND (COALESCE(what_worked,'') != '' OR COALESCE(what_didnt_work,'') != '' OR COALESCE(what_to_improve,'') != '' OR COALESCE(next_priorities,'') != '')", args: [ownerId] }),
    db.execute({ sql: "SELECT kind, period_key AS k FROM periodic_reviews WHERE owner_id = ? AND (COALESCE(wins,'') != '' OR COALESCE(lessons,'') != '' OR COALESCE(focus_next,'') != '')", args: [ownerId] }),
  ]);
  const done = new Map<string, ReviewKind>();
  let plans = 0;
  for (const r of j.rows as Array<Record<string, unknown>>) {
    if (r.status === "sealed") done.set(`${r.kind}:${r.period_key}`, r.kind as ReviewKind);
    if (r.plan_applied_at) plans++;
  }
  for (const r of w.rows as Array<Record<string, unknown>>) done.set(`weekly:${r.k}`, "weekly");
  for (const r of p.rows as Array<Record<string, unknown>>) done.set(`${r.kind}:${r.k}`, r.kind as ReviewKind);
  const counts = { weekly: 0, monthly: 0, quarterly: 0, annual: 0 } as Record<ReviewKind, number>;
  for (const k of done.values()) counts[k]++;
  const points = REVIEW_KINDS.reduce((s, k) => s + counts[k] * WEIGHT[k], 0) + plans;
  const idx = REVISOR_TITLES.reduce((acc, t, i) => (points >= t.min ? i : acc), 0);
  const next = REVISOR_TITLES[idx + 1] ?? null;
  // Sequência: semanas consecutivas revisadas terminando na semana atual ou na anterior.
  const today = await todayKeyFor(db, ownerId);
  const weeks = new Set([...done.entries()].filter(([, k]) => k === "weekly").map(([key]) => key.slice(7)));
  let w0 = mondayOf(today);
  if (!weeks.has(w0)) w0 = addDays(w0, -7);
  let streak = 0;
  while (weeks.has(w0)) {
    streak++;
    w0 = addDays(w0, -7);
  }
  return {
    level: idx + 1,
    title: REVISOR_TITLES[idx]!.title,
    points,
    next: next ? { title: next.title, min: next.min } : null,
    pct: next ? Math.round(((points - REVISOR_TITLES[idx]!.min) / (next.min - REVISOR_TITLES[idx]!.min)) * 100) : 100,
    counts,
    plans,
    streakWeeks: streak,
    rule: "Pontos: semana 1, mês 3, trimestre 6, ano 12, plano confirmado +1.",
  };
}

/* ───────────────────────────── Conselheiro de Revisão ───────────────────────────── */

export type ReviewAdvisorMode = "analyze" | "reflection" | "bottlenecks" | "plan" | "missions" | "compare";
type AdvisorItem = { kind: "dado" | "inferencia" | "sugestao"; text: string };

const ADVISOR_SCHEMA = {
  type: "object",
  properties: {
    items: { type: "array", items: { type: "object", properties: { kind: { type: "string", enum: ["dado", "inferencia", "sugestao"] }, text: { type: "string" } }, required: ["kind", "text"] } },
    draft: { type: "object", properties: { answers: { type: "array", items: { type: "object", properties: { key: { type: "string" }, text: { type: "string" } }, required: ["key", "text"] } } } },
    missions: { type: "array", items: { type: "object", properties: { request: { type: "string" }, why: { type: "string" } }, required: ["request", "why"] } },
    priorities: { type: "array", items: { type: "string" } },
  },
  required: ["items"],
};

/**
 * Análise do período. Fatos (números) são sempre calculados aqui; a IA só
 * interpreta e sugere. Recomendações de missão voltam como PEDIDOS para o
 * Conselheiro de Missões (mesmo agente de criação) — nada é criado sem aprovação.
 */
export async function reviewAdvisor(db: Client, ownerId: string, kind: ReviewKind, key: string, mode: ReviewAdvisorMode, question?: string | null) {
  const view = await getReview(db, ownerId, kind, key);
  const [draftCfg, suggCfg, missionsCfg, bottleCfg, planCfg] = await Promise.all([
    automationConfig(db, ownerId, "reviews", "ai_draft"),
    automationConfig(db, ownerId, "reviews", "suggestions"),
    automationConfig(db, ownerId, "reviews", "mission_seeds"),
    automationConfig(db, ownerId, "reviews", "bottlenecks"),
    automationConfig(db, ownerId, "reviews", "next_plan"),
  ]);
  const gate: Partial<Record<ReviewAdvisorMode, { enabled: boolean }>> = { reflection: draftCfg, missions: missionsCfg, bottlenecks: bottleCfg, plan: planCfg };
  if (gate[mode] && !gate[mode]!.enabled) throw new ReviewError("Esta função está desativada nas Automações das Revisões.");

  const withData = view.indicators.filter((i) => i.value != null && (i.value !== 0 || (i.previous ?? 0) !== 0));
  const facts: AdvisorItem[] = withData.slice(0, 12).map((i) => ({ kind: "dado", text: `${i.label}: ${i.value} ${i.unit}${i.deltaPct != null ? ` (${i.deltaPct > 0 ? "+" : ""}${i.deltaPct}% vs ${view.previous.label})` : i.note ? ` — ${i.note.replace(/\.$/, "")}` : ""}.` }));
  for (const g of view.goals.slice(0, 4)) facts.push({ kind: "dado", text: `Meta “${g.title}”: ${g.progressPct ?? 0}% · ${g.openTasks} missões abertas.` });
  const insufficient = withData.length < 2;
  const rules: AdvisorItem[] = view.insights.map((i) => ({ kind: i.kind === "alta" ? "inferencia" : "inferencia", text: `${i.title}: ${i.text}` }));
  const seeds: Array<{ request: string; why: string }> = [];
  if (missionsCfg.enabled) {
    for (const i of view.insights.filter((x) => x.kind === "queda").slice(0, 2)) seeds.push({ request: `Criar uma missão para recuperar ${i.title.replace("Atenção: ", "")} na próxima ${kind === "weekly" ? "semana" : "etapa"}`, why: i.text });
    for (const g of view.goals.filter((x) => x.openTasks === 0 && x.status === "active").slice(0, 2)) seeds.push({ request: `Definir a próxima missão da meta “${g.title}”`, why: `A meta está em ${g.progressPct ?? 0}% e não tem missão aberta.` });
  }
  const priorities = planCfg.enabled ? [...view.review.actions.map((a) => a.text), ...view.insights.filter((x) => x.kind === "queda").map((x) => x.title.replace("Atenção: ", "Recuperar "))].slice(0, 3) : [];

  const config = await getGeminiConfig();
  if (!config || insufficient) {
    return {
      ai: { used: false, status: config ? "dados_insuficientes" : "indisponivel", detail: insufficient ? "Poucos registros neste período: mostro só os números reais, sem interpretação." : "IA não configurada: análise por regras sobre os seus números." },
      items: [...facts, ...(suggCfg.enabled ? rules : [])],
      draft: null,
      missionSeeds: seeds,
      priorities,
      comparison: mode === "compare" ? view.indicators : null,
    };
  }
  const own = mode === "reflection" ? `\nRESPOSTAS JÁ ESCRITAS PELO USUÁRIO (texto dele, use só para continuar no mesmo tom; não invente fatos): ${JSON.stringify(view.review.answers).slice(0, 3000)}` : "";
  const modeText: Record<ReviewAdvisorMode, string> = {
    analyze: "Analise o período: pontos fortes, dificuldades e tendências.",
    reflection: `Escreva um RASCUNHO de respostas para as perguntas (${view.questions.map((q) => `${q.key}: ${q.label}`).join("; ")}) em primeira pessoa, baseado só nos números. Marque claramente que é rascunho.`,
    bottlenecks: "Identifique gargalos: quedas relevantes e metas sem avanço, com a evidência numérica.",
    plan: "Proponha até 3 prioridades concretas para o próximo ciclo, ligadas às evidências.",
    missions: "Proponha até 3 missões (como pedidos curtos em linguagem natural) que atacam os pontos fracos do período.",
    compare: "Compare com o período anterior: o que subiu, o que caiu e o que é comparação parcial.",
  };
  const prompt = `Você é o Conselheiro de Revisão do LifeOS (RPG de produtividade, português do Brasil).
${modeText[mode]}
Período: ${view.label} (${view.range.from} a ${view.range.until}${view.range.inProgress ? ", em andamento" : ""}).
Regras: use SOMENTE os números abaixo; não invente métricas, causas médicas ou eventos. Classifique cada item como "dado" (número real), "inferencia" (interpretação) ou "sugestao" (ação). Seja breve (até 8 itens). Variação parcial deve ser dita como parcial.
NÚMEROS:
${facts.map((f) => `- ${f.text}`).join("\n")}
SINAIS JÁ DETECTADOS:
${rules.map((r) => `- ${r.text}`).join("\n") || "- nenhum"}${own}
${question ? `PERGUNTA DO USUÁRIO: ${question.slice(0, 500)}` : ""}`;
  const out = await generateText(prompt, config, { responseSchema: ADVISOR_SCHEMA, timeoutMs: 30_000, retries: 1, maxOutputTokens: 2500 });
  if (!out.ok) {
    return { ai: { used: false, status: "erro", detail: `A IA não respondeu (${out.message.slice(0, 140)}). Mostro a análise por regras.` }, items: [...facts, ...rules], draft: null, missionSeeds: seeds, priorities, comparison: mode === "compare" ? view.indicators : null };
  }
  const parsed = extractJson(out.text) as { items?: unknown[]; draft?: { answers?: unknown[] }; missions?: unknown[]; priorities?: unknown[] } | null;
  const items = (parsed?.items ?? [])
    .map((x) => x as Record<string, unknown>)
    .map((x) => ({ kind: (["dado", "inferencia", "sugestao"].includes(String(x.kind)) ? x.kind : "inferencia") as AdvisorItem["kind"], text: str(x.text, 500) ?? "" }))
    .filter((x) => x.text)
    .slice(0, 10);
  const validKeys = new Set(view.questions.map((q) => q.key));
  const draft =
    mode === "reflection"
      ? Object.fromEntries(((parsed?.draft?.answers ?? []) as Array<Record<string, unknown>>).filter((a) => validKeys.has(String(a.key))).map((a) => [String(a.key), str(a.text, 2000) ?? ""]).filter(([, t]) => t))
      : null;
  const aiSeeds = missionsCfg.enabled ? ((parsed?.missions ?? []) as Array<Record<string, unknown>>).map((m) => ({ request: str(m.request, 300) ?? "", why: str(m.why, 300) ?? "" })).filter((m) => m.request).slice(0, 3) : [];
  return {
    ai: { used: true, status: "ok", detail: "Interpretação da IA configurada no LifeOS sobre números calculados aqui." },
    items: [...facts.slice(0, 6), ...items],
    draft,
    missionSeeds: aiSeeds.length ? aiSeeds : seeds,
    priorities: planCfg.enabled ? ((parsed?.priorities ?? []) as unknown[]).map((p) => str(p, 200)).filter((p): p is string => !!p).slice(0, 3).concat(priorities).slice(0, 3) : [],
    comparison: mode === "compare" ? view.indicators : null,
  };
}

/* ───────────────────────────── automações diárias (A e B) ───────────────────────────── */

type Outcome = { status: "ok" | "skipped" | "error"; summary: string };

/** Período que acabou de fechar ontem (se algum). */
function justClosed(today: string): Array<{ kind: ReviewKind; key: string }> {
  const y = addDays(today, -1);
  const out: Array<{ kind: ReviewKind; key: string }> = [];
  if (new Date(`${today}T12:00:00Z`).getUTCDay() === 1) out.push({ kind: "weekly", key: mondayOf(y) });
  if (today.slice(8, 10) === "01") {
    out.push({ kind: "monthly", key: y.slice(0, 7) });
    if (["01", "04", "07", "10"].includes(today.slice(5, 7))) out.push({ kind: "quarterly", key: periodKeyForDay("quarterly", y) });
    if (today.slice(5, 7) === "01") out.push({ kind: "annual", key: y.slice(0, 4) });
  }
  return out;
}

/** A — Lembrete: avisa no encerramento do período se a revisão não foi selada. */
export async function runReviewReminder(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const today = await todayKeyFor(db, ownerId);
  const due = justClosed(today);
  if (!due.length) return { status: "skipped", summary: "Nenhum período terminou ontem." };
  const pending: string[] = [];
  for (const d of due) {
    const r = await db.execute({ sql: "SELECT status FROM journey_reviews WHERE owner_id = ? AND kind = ? AND period_key = ?", args: [ownerId, d.kind, d.key] });
    if (r.rows[0]?.status !== "sealed") pending.push(`${KIND_LABEL[d.kind]} (${rangeOf(d.kind, d.key).label})`);
  }
  if (!pending.length) return { status: "skipped", summary: "As revisões dos períodos encerrados já estão seladas." };
  if (config.inApp !== false) {
    await notifyFromAutomation(db, ownerId, { eventType: "review_reminder", title: "Hora de revisar a jornada", body: `Revisão pendente: ${pending.join(", ")}.`, url: "/revisoes", inApp: true, push: config.push === true });
  }
  return { status: "ok", summary: `Lembrete enviado: ${pending.join(", ")}.` };
}

/** B — Pré-análise: deixa o retrato do período encerrado pronto (rascunho com indicadores). */
export async function runPreAnalysis(db: Client, ownerId: string): Promise<Outcome> {
  const today = await todayKeyFor(db, ownerId);
  const due = justClosed(today);
  if (!due.length) return { status: "skipped", summary: "Nenhum período terminou ontem." };
  const done: string[] = [];
  for (const d of due) {
    const view = await getReview(db, ownerId, d.kind, d.key);
    if (view.review.status === "sealed") continue;
    await db.execute({
      sql: `INSERT INTO journey_reviews (id, owner_id, kind, period_key, snapshot_json) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (owner_id, kind, period_key) DO UPDATE SET snapshot_json = excluded.snapshot_json WHERE journey_reviews.status = 'draft'`,
      args: [nanoid(), ownerId, d.kind, d.key, JSON.stringify({ indicators: view.indicators, preparedAt: today })],
    });
    done.push(KIND_LABEL[d.kind]);
  }
  return done.length ? { status: "ok", summary: `Retrato preparado: ${done.join(", ")}.` } : { status: "skipped", summary: "Revisões já seladas." };
}
