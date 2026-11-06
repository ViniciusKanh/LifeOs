import { nanoid } from "nanoid";
import type { Client } from "@libsql/client";
import {
  ALL_EFFECTS,
  BRANCHES,
  BUILTIN_PRESETS,
  CORE_BRANCHES,
  EVIDENCE_META,
  POINT_RULES,
  RESET_DEFAULTS,
  SKILLS,
  SKILL_BY_KEY,
  SKILL_TREE_VERSION,
  TREE_TITLES,
  type EffectDef,
  type EvidenceMetric,
  type PresetTarget,
  type SkillDef,
} from "../config/skillTree.js";
import { dayKeyIn, levelForXp, todayKeyFor, userTimezone } from "./gamificationService.js";
import { automationConfig, notifyFromAutomation } from "./automationService.js";
import { evaluateAchievements } from "./achievementsService.js";
import { syncCodexUnlocks } from "./codexService.js";
import { getFreeWindows } from "./capacityPlannerService.js";
import { loadDirectionGoals } from "./directionService.js";
import { generateText, getGeminiConfig } from "./geminiService.js";
import { extractJson, str } from "./aiJson.js";

/**
 * Motor da Árvore de Habilidades.
 * - PH (Pontos de Habilidade) vivem num livro-caixa próprio, separado de XP e moedas.
 * - Toda evolução passa por `applySteps`: validação no servidor + uma única transação
 *   (histórico, gasto, nível e efeitos). O índice único por (ciclo, habilidade, nível)
 *   e o gatilho de saldo negativo impedem gasto duplicado mesmo com duas abas abertas.
 * - Efeitos liberam recursos opcionais; nenhum deles toca métricas reais.
 */

export class SkillTreeError extends Error {
  constructor(message: string, public status = 400, public data?: unknown) {
    super(message);
  }
}

type Row = Record<string, unknown>;
const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const parse = <T>(v: unknown, fb: T): T => {
  try {
    return v == null ? fb : (JSON.parse(String(v)) as T);
  } catch {
    return fb;
  }
};

/* ───────────────────────────── fatos reais (evidências) ───────────────────────────── */

export type Facts = Record<EvidenceMetric, number>;

/** Maior sequência de dias consecutivos por hábito (check-ins que atingiram a meta do dia). */
export function bestStreaks(rows: Array<{ habit: string; day: string }>): number[] {
  const by = new Map<string, string[]>();
  for (const r of rows) by.set(r.habit, [...(by.get(r.habit) ?? []), r.day]);
  const out: number[] = [];
  for (const days of by.values()) {
    const sorted = [...new Set(days)].sort();
    let best = 0;
    let run = 0;
    let prev: number | null = null;
    for (const d of sorted) {
      const t = Date.parse(`${d}T12:00:00Z`) / 86_400_000;
      run = prev != null && Math.round(t - prev) === 1 ? run + 1 : 1;
      best = Math.max(best, run);
      prev = t;
    }
    out.push(best);
  }
  return out;
}

export async function evidenceFacts(db: Client, ownerId: string): Promise<Facts> {
  const one = (sql: string) => db.execute({ sql, args: [ownerId] }).then((r) => num(Object.values((r.rows[0] ?? {}) as Row)[0]));
  const [
    tasksDone, onTime, planned, checkins, water, workouts, workoutWeeks, sleep, mood, recovery, journal, gratitude, pages, books,
    studyMin, studyDays, cards, focusMin, focusSess, deep, focusDays, goalsC, goalsD, projC, projD, contracts, campaigns, plans, reviews, events, streakRows,
  ] = await Promise.all([
    one("SELECT COUNT(*) FROM tasks WHERE owner_id = ? AND status = 'Concluído'"),
    one("SELECT COUNT(*) FROM tasks WHERE owner_id = ? AND status = 'Concluído' AND due_date IS NOT NULL AND substr(COALESCE(completed_at, updated_at), 1, 10) <= substr(due_date, 1, 10)"),
    one("SELECT COUNT(*) FROM tasks WHERE owner_id = ? AND due_date IS NOT NULL"),
    one("SELECT COUNT(*) FROM habit_entries he JOIN habits h ON h.id = he.habit_id WHERE he.owner_id = ? AND he.count >= h.target_count"),
    one("SELECT COUNT(DISTINCT substr(recorded_at, 1, 10)) FROM water_entries WHERE owner_id = ?"),
    one("SELECT COUNT(*) FROM workouts WHERE owner_id = ?"),
    one("SELECT COUNT(DISTINCT strftime('%Y-%W', performed_at)) FROM workouts WHERE owner_id = ?"),
    one("SELECT COUNT(*) FROM sleep_entries WHERE owner_id = ?"),
    one("SELECT COUNT(*) FROM mood_entries WHERE owner_id = ?"),
    one("SELECT COUNT(*) FROM recovery_days WHERE owner_id = ?"),
    one("SELECT COUNT(*) FROM journal_entries WHERE owner_id = ? AND (TRIM(COALESCE(thoughts, '')) <> '' OR TRIM(COALESCE(closing_reflection, '')) <> '')"),
    one("SELECT COUNT(*) FROM journal_entries WHERE owner_id = ? AND gratitude IS NOT NULL AND gratitude LIKE '%\"_%'"),
    one("SELECT COALESCE(SUM(pages_read), 0) FROM reading_sessions WHERE owner_id = ?"),
    one("SELECT COUNT(*) FROM books WHERE owner_id = ? AND status = 'Concluído'"),
    one("SELECT COALESCE(SUM(duration_minutes), 0) FROM study_sessions WHERE owner_id = ?"),
    one("SELECT COUNT(DISTINCT occurred_at) FROM study_sessions WHERE owner_id = ?"),
    one("SELECT COUNT(*) FROM flashcard_reviews WHERE owner_id = ?"),
    one("SELECT COALESCE(SUM(duration_minutes), 0) FROM time_entries WHERE owner_id = ?"),
    one("SELECT COUNT(*) FROM time_entries WHERE owner_id = ? AND duration_minutes >= 20"),
    one("SELECT COUNT(*) FROM time_entries WHERE owner_id = ? AND duration_minutes >= 50"),
    one("SELECT COUNT(DISTINCT substr(started_at, 1, 10)) FROM time_entries WHERE owner_id = ? AND duration_minutes >= 1"),
    one("SELECT COUNT(*) FROM goals WHERE owner_id = ?"),
    one("SELECT COUNT(*) FROM goals WHERE owner_id = ? AND status = 'done'"),
    one("SELECT COUNT(*) FROM projects WHERE owner_id = ?"),
    one("SELECT COUNT(*) FROM projects WHERE owner_id = ? AND status = 'completed'"),
    one("SELECT COUNT(*) FROM contracts WHERE owner_id = ? AND status = 'concluido'"),
    one("SELECT COUNT(*) FROM campaigns WHERE owner_id = ? AND status = 'completed'"),
    one("SELECT COUNT(*) FROM weekly_plans WHERE owner_id = ? AND sealed_at IS NOT NULL"),
    one("SELECT COUNT(*) FROM journey_reviews WHERE owner_id = ? AND status = 'sealed'"),
    one("SELECT COUNT(*) FROM events WHERE owner_id = ?"),
    db.execute({ sql: "SELECT he.habit_id AS habit, he.entry_date AS day FROM habit_entries he JOIN habits h ON h.id = he.habit_id WHERE he.owner_id = ? AND he.count >= h.target_count", args: [ownerId] }),
  ]);
  const streaks = bestStreaks((streakRows.rows as Row[]).map((r) => ({ habit: String(r.habit), day: String(r.day).slice(0, 10) })));
  return {
    tasks_done: tasksDone,
    tasks_on_time: onTime,
    tasks_planned: planned,
    habit_checkins: checkins,
    habit_best_streak: streaks.length ? Math.max(...streaks) : 0,
    habits_streak_14: streaks.filter((s) => s >= 14).length,
    habits_streak_30: streaks.filter((s) => s >= 30).length,
    water_days: water,
    workouts,
    workout_weeks: workoutWeeks,
    sleep_logs: sleep,
    mood_logs: mood,
    recovery_days: recovery,
    journal_days: journal,
    gratitude_days: gratitude,
    pages_read: pages,
    books_finished: books,
    study_minutes: studyMin,
    study_days: studyDays,
    flashcard_reviews: cards,
    focus_minutes: focusMin,
    focus_sessions: focusSess,
    deep_sessions: deep,
    focus_days: focusDays,
    goals_created: goalsC,
    goals_done: goalsD,
    projects_created: projC,
    projects_done: projD,
    contracts_done: contracts,
    campaigns_done: campaigns,
    weekly_plans_sealed: plans,
    reviews_sealed: reviews,
    events_planned: events,
  };
}

/* ───────────────────────────── herói, estado e pontos ───────────────────────────── */

export async function heroInfo(db: Client, ownerId: string) {
  const r = await db.execute({ sql: "SELECT COALESCE(SUM(xp), 0) AS total FROM xp_events WHERE owner_id = ?", args: [ownerId] });
  return levelForXp(num(r.rows[0]?.total));
}

interface TreeState {
  epoch: number;
  desired: PresetTarget[];
  settings: { cooldownDays: number; refundPct: number };
  notified: string[];
  lastResetAt: string | null;
}

async function loadState(db: Client, ownerId: string): Promise<TreeState> {
  await db.execute({ sql: "INSERT OR IGNORE INTO skill_tree_state (owner_id) VALUES (?)", args: [ownerId] });
  const r = await db.execute({ sql: "SELECT epoch, desired_json, settings_json, notified_json, last_reset_at FROM skill_tree_state WHERE owner_id = ?", args: [ownerId] });
  const row = (r.rows[0] ?? {}) as Row;
  const settings = { ...RESET_DEFAULTS, ...parse<Partial<TreeState["settings"]>>(row.settings_json, {}) };
  return { epoch: num(row.epoch), desired: sanitizeTargets(parse(row.desired_json, [])), settings, notified: parse<string[]>(row.notified_json, []), lastResetAt: row.last_reset_at ? String(row.last_reset_at) : null };
}

async function userLevels(db: Client, ownerId: string): Promise<Map<string, number>> {
  const r = await db.execute({ sql: "SELECT skill_key, current_level FROM user_skills WHERE owner_id = ?", args: [ownerId] });
  const m = new Map<string, number>();
  for (const row of r.rows as Row[]) if (SKILL_BY_KEY.has(String(row.skill_key))) m.set(String(row.skill_key), num(row.current_level));
  return m;
}

/**
 * Concede PH pendentes (idempotente pelo event_key único). Na primeira vez, concede de
 * forma retroativa todos os níveis já alcançados — marcado como "retroativo" no histórico.
 */
export async function syncPoints(db: Client, ownerId: string, heroLevel?: number): Promise<number> {
  const level = heroLevel ?? (await heroInfo(db, ownerId)).level;
  const [had, ach] = await Promise.all([
    db.execute({ sql: "SELECT COUNT(*) AS n FROM skill_point_ledger WHERE owner_id = ? AND source IN ('level', 'milestone')", args: [ownerId] }),
    db.execute({
      sql: `SELECT a.id, a.title FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id
            WHERE ua.owner_id = ? AND a.tier IN (${POINT_RULES.achievementTiers.map(() => "?").join(", ")}) AND a.id NOT LIKE 'ach_skill_%'`,
      args: [ownerId, ...POINT_RULES.achievementTiers],
    }),
  ]);
  const retro = num(had.rows[0]?.n) === 0 && level > 2;
  const stmts: Array<{ sql: string; args: Array<string | number> }> = [];
  const add = (key: string, amount: number, source: string, label: string) =>
    stmts.push({ sql: "INSERT OR IGNORE INTO skill_point_ledger (id, owner_id, event_key, amount, source, label) VALUES (?, ?, ?, ?, ?, ?)", args: [nanoid(), ownerId, key, amount, source, label] });
  for (let l = 2; l <= level; l++) {
    add(`level:${l}`, POINT_RULES.perLevel, "level", `Nível ${l} alcançado${retro ? " (retroativo)" : ""}`);
    if (l % POINT_RULES.milestoneEvery === 0) add(`milestone:level:${l}`, POINT_RULES.milestoneBonus, "milestone", `Marco do nível ${l}${retro ? " (retroativo)" : ""}`);
  }
  for (const a of ach.rows as Row[]) add(`achievement:${String(a.id)}`, POINT_RULES.achievementBonus, "achievement", `Conquista: ${String(a.title)}`);
  if (!stmts.length) return 0;
  const before = await db.execute({ sql: "SELECT COUNT(*) AS n FROM skill_point_ledger WHERE owner_id = ?", args: [ownerId] });
  await db.batch(stmts, "write");
  const after = await db.execute({ sql: "SELECT COUNT(*) AS n FROM skill_point_ledger WHERE owner_id = ?", args: [ownerId] });
  return num(after.rows[0]?.n) - num(before.rows[0]?.n);
}

export async function pointBalance(db: Client, ownerId: string) {
  const r = await db.execute({
    sql: `SELECT COALESCE(SUM(CASE WHEN source IN ('level','milestone','achievement','event') THEN amount ELSE 0 END), 0) AS earned,
                 COALESCE(SUM(CASE WHEN source = 'spend' THEN -amount ELSE 0 END), 0) AS spent,
                 COALESCE(SUM(CASE WHEN source = 'refund' THEN amount ELSE 0 END), 0) AS refunded,
                 COALESCE(SUM(amount), 0) AS available
          FROM skill_point_ledger WHERE owner_id = ?`,
    args: [ownerId],
  });
  const row = (r.rows[0] ?? {}) as Row;
  return { total: num(row.earned), spent: num(row.spent), refunded: num(row.refunded), available: num(row.available), invested: num(row.spent) - num(row.refunded) };
}

/* ───────────────────────────── avaliação de requisitos ───────────────────────────── */

export interface Check {
  kind: "points" | "hero" | "evidence" | "prereq" | "order" | "max";
  label: string;
  current: number | null;
  target: number | null;
  met: boolean;
  module?: string;
  route?: string;
  options?: Array<{ skill: string; name: string; level: number; current: number; met: boolean }>;
}
export interface Ctx {
  levels: Map<string, number>;
  heroLevel: number;
  facts: Facts;
  available: number;
}

export function prereqGroupsMet(s: SkillDef, levels: Map<string, number>) {
  return s.requires.map((g) => g.some((o) => (levels.get(o.skill) ?? 0) >= o.level));
}

/** Requisitos para comprar `level` de `s` no contexto informado (usado pela tela, pelo simulador e pela transação). */
export function evaluateLevel(s: SkillDef, level: number, ctx: Ctx): { ok: boolean; checks: Check[]; cost: number } {
  const cur = ctx.levels.get(s.key) ?? 0;
  const def = s.levels[level - 1];
  const checks: Check[] = [];
  if (!def) return { ok: false, cost: 0, checks: [{ kind: "max", label: `Nível máximo ${s.levels.length} já alcançado`, current: cur, target: s.levels.length, met: false }] };
  if (level !== cur + 1) checks.push({ kind: "order", label: level <= cur ? `Nível ${level} já desbloqueado` : `Desbloqueie antes o nível ${cur + 1}`, current: cur, target: level - 1, met: false });
  checks.push({ kind: "hero", label: `Herói nível ${def.heroLevel}`, current: ctx.heroLevel, target: def.heroLevel, met: ctx.heroLevel >= def.heroLevel, module: "Perfil do Herói", route: "/conquistas" });
  if (def.evidence) {
    const meta = EVIDENCE_META[def.evidence.metric];
    const v = ctx.facts[def.evidence.metric] ?? 0;
    checks.push({ kind: "evidence", label: meta.label(def.evidence.min), current: v, target: def.evidence.min, met: v >= def.evidence.min, module: meta.module, route: meta.route });
  }
  if (level === 1) {
    s.requires.forEach((g) => {
      const options = g.map((o) => ({ skill: o.skill, name: SKILL_BY_KEY.get(o.skill)!.name, level: o.level, current: ctx.levels.get(o.skill) ?? 0, met: (ctx.levels.get(o.skill) ?? 0) >= o.level }));
      const label = options.map((o) => `${o.name} nv. ${o.level}`).join(" ou ");
      checks.push({ kind: "prereq", label, current: null, target: null, met: options.some((o) => o.met), options });
    });
  }
  checks.push({ kind: "points", label: `${def.cost} PH`, current: ctx.available, target: def.cost, met: ctx.available >= def.cost });
  return { ok: checks.every((c) => c.met), checks, cost: def.cost };
}

export type SkillState = "bloqueada" | "disponivel" | "indisponivel" | "desbloqueada" | "em_evolucao" | "maximizada";
export function stateOf(s: SkillDef, ctx: Ctx): SkillState {
  const cur = ctx.levels.get(s.key) ?? 0;
  if (cur >= s.levels.length) return "maximizada";
  const next = evaluateLevel(s, cur + 1, ctx);
  if (cur > 0) return next.ok ? "em_evolucao" : "desbloqueada";
  if (!prereqGroupsMet(s, ctx.levels).every(Boolean)) return "bloqueada";
  return next.ok ? "disponivel" : "indisponivel";
}

/* ───────────────────────────── simulador (sem gastar) ───────────────────────────── */

export function sanitizeTargets(raw: unknown): PresetTarget[] {
  if (!Array.isArray(raw)) return [];
  const m = new Map<string, number>();
  for (const t of raw) {
    const key = String((t as PresetTarget)?.key ?? "");
    const s = SKILL_BY_KEY.get(key);
    if (!s) continue;
    const level = Math.max(1, Math.min(s.levels.length, Math.floor(Number((t as PresetTarget).level) || 1)));
    m.set(key, Math.max(m.get(key) ?? 0, level));
  }
  return [...m].map(([key, level]) => ({ key, level })).slice(0, 80);
}

export interface PlanStep {
  key: string;
  name: string;
  level: number;
  cost: number;
  ok: boolean;
  reasons: string[];
  checks: Check[];
}

/**
 * Caminho mínimo até os alvos: inclui os pré-requisitos que faltam (no grupo OU escolhe a
 * opção mais barata), ordena topologicamente e simula passo a passo com os recursos atuais.
 * Passos bloqueados não entram no estado simulado — nada depende silenciosamente deles.
 */
export function planTargets(targets: PresetTarget[], ctx: Ctx) {
  const want = new Map<string, number>();
  const order: string[] = [];
  const effective = (k: string) => Math.max(ctx.levels.get(k) ?? 0, want.get(k) ?? 0);
  const costTo = (k: string, lvl: number) => SKILL_BY_KEY.get(k)!.levels.slice(effective(k), lvl).reduce((s, l) => s + l.cost, 0);
  const need = (key: string, lvl: number, depth = 0) => {
    const s = SKILL_BY_KEY.get(key)!;
    const target = Math.min(lvl, s.levels.length);
    if (depth > 60 || effective(key) >= target) return;
    if (effective(key) < 1) {
      for (const g of s.requires) {
        if (g.some((o) => effective(o.skill) >= o.level)) continue;
        const best = [...g].sort((a, b) => costTo(a.skill, a.level) - costTo(b.skill, b.level))[0]!;
        need(best.skill, best.level, depth + 1);
      }
    }
    want.set(key, Math.max(want.get(key) ?? 0, target));
    if (!order.includes(key)) order.push(key);
  };
  for (const t of sanitizeTargets(targets)) need(t.key, t.level);

  const sim: Ctx = { ...ctx, levels: new Map(ctx.levels) };
  const steps: PlanStep[] = [];
  for (const key of order) {
    const s = SKILL_BY_KEY.get(key)!;
    for (let l = (ctx.levels.get(key) ?? 0) + 1; l <= (want.get(key) ?? 0); l++) {
      const e = evaluateLevel(s, l, sim);
      steps.push({ key, name: s.name, level: l, cost: e.cost, ok: e.ok, reasons: e.checks.filter((c) => !c.met).map((c) => c.label), checks: e.checks });
      if (e.ok) {
        sim.levels.set(key, l);
        sim.available -= e.cost;
      }
    }
  }
  const totalCost = steps.reduce((s, x) => s + x.cost, 0);
  const readyCost = steps.filter((x) => x.ok).reduce((s, x) => s + x.cost, 0);
  return {
    steps,
    executable: steps.filter((x) => x.ok).map((x) => ({ key: x.key, level: x.level })),
    totalCost,
    readyCost,
    missingPoints: Math.max(0, totalCost - ctx.available),
    blocked: steps.filter((x) => !x.ok).length,
    pending: [...new Set(steps.flatMap((x) => x.checks.filter((c) => !c.met && c.kind !== "prereq" && c.kind !== "order").map((c) => c.label)))],
    branchDistribution: distribution(sim.levels),
  };
}

function distribution(levels: Map<string, number>) {
  return BRANCHES.map((b) => {
    const list = SKILLS.filter((s) => s.branch === b.key);
    const max = list.reduce((s, x) => s + x.levels.length, 0);
    const got = list.reduce((s, x) => s + Math.min(levels.get(x.key) ?? 0, x.levels.length), 0);
    return { branch: b.key, levels: got, max, pct: max ? Math.round((got / max) * 100) : 0 };
  });
}

async function context(db: Client, ownerId: string): Promise<Ctx & { hero: Awaited<ReturnType<typeof heroInfo>> }> {
  const hero = await heroInfo(db, ownerId);
  await syncPoints(db, ownerId, hero.level);
  const [levels, facts, bal] = await Promise.all([userLevels(db, ownerId), evidenceFacts(db, ownerId), pointBalance(db, ownerId)]);
  return { levels, heroLevel: hero.level, facts, available: bal.available, hero };
}

export async function simulate(db: Client, ownerId: string, targets: unknown) {
  const t = sanitizeTargets(targets);
  if (!t.length) throw new SkillTreeError("Escolha ao menos uma habilidade para simular.");
  const ctx = await context(db, ownerId);
  return { targets: t, available: ctx.available, current: distribution(ctx.levels), ...planTargets(t, ctx) };
}

/* ───────────────────────────── transação de evolução ───────────────────────────── */

function effectsFor(levels: Map<string, number>) {
  const out = new Map<string, EffectDef & { skill: string; level: number }>();
  for (const e of ALL_EFFECTS) if ((levels.get(e.skill) ?? 0) >= e.level) out.set(e.key, e);
  return [...out.values()];
}

function effectSyncStatements(ownerId: string, levels: Map<string, number>) {
  return [
    { sql: "DELETE FROM skill_effects_state WHERE owner_id = ?", args: [ownerId] as Array<string | number> },
    ...effectsFor(levels).map((e) => ({ sql: "INSERT INTO skill_effects_state (owner_id, effect_key, effect_type, source_skill, level, active) VALUES (?, ?, ?, ?, ?, 1)", args: [ownerId, e.key, e.type, e.skill, e.level] as Array<string | number> })),
  ];
}

/**
 * Executa exatamente os passos pedidos, em ordem, se TODOS forem válidos agora.
 * Sem desbloqueio parcial silencioso: qualquer passo inválido recusa a operação inteira.
 */
export async function applySteps(db: Client, ownerId: string, stepsRaw: unknown, origin: "manual" | "build" | "preset" | "oracle" = "manual") {
  const steps = (Array.isArray(stepsRaw) ? stepsRaw : []).map((x) => ({ key: String((x as PresetTarget)?.key ?? ""), level: Math.floor(Number((x as PresetTarget)?.level) || 0) })).slice(0, 80);
  if (!steps.length) throw new SkillTreeError("Nenhuma evolução informada.");
  const ctx = await context(db, ownerId);
  const st = await loadState(db, ownerId);
  const sim: Ctx = { ...ctx, levels: new Map(ctx.levels) };
  const plan: Array<{ s: SkillDef; level: number; cost: number; prev: number }> = [];
  for (const step of steps) {
    const s = SKILL_BY_KEY.get(step.key);
    if (!s) throw new SkillTreeError("Habilidade inexistente.", 404);
    const e = evaluateLevel(s, step.level, sim);
    if (!e.ok) throw new SkillTreeError(`Não dá para evoluir “${s.name}” para o nível ${step.level}: ${e.checks.filter((c) => !c.met).map((c) => c.label).join("; ")}.`, 409, { key: s.key, level: step.level, checks: e.checks });
    plan.push({ s, level: step.level, cost: e.cost, prev: sim.levels.get(s.key) ?? 0 });
    sim.levels.set(s.key, step.level);
    sim.available -= e.cost;
  }
  const stmts: Array<{ sql: string; args: Array<string | number | null> }> = [];
  for (const p of plan) {
    stmts.push({
      sql: "INSERT INTO skill_transactions (id, owner_id, kind, epoch, skill_key, previous_level, new_level, points_spent, origin) VALUES (?, ?, 'upgrade', ?, ?, ?, ?, ?, ?)",
      args: [nanoid(), ownerId, st.epoch, p.s.key, p.prev, p.level, p.cost, origin],
    });
    stmts.push({
      sql: "INSERT INTO skill_point_ledger (id, owner_id, event_key, amount, source, label) VALUES (?, ?, ?, ?, 'spend', ?)",
      args: [nanoid(), ownerId, `spend:e${st.epoch}:${p.s.key}:${p.level}`, -p.cost, `${p.s.name} → nível ${p.level}`],
    });
    stmts.push({
      sql: `INSERT INTO user_skills (owner_id, skill_key, branch, max_level, current_level) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (owner_id, skill_key) DO UPDATE SET current_level = excluded.current_level, updated_at = datetime('now')`,
      args: [ownerId, p.s.key, p.s.branch, p.s.levels.length, p.level],
    });
  }
  const chronicle = (await automationConfig(db, ownerId, "skills", "chronicle")).enabled;
  if (chronicle) {
    for (const p of plan.filter((x) => x.s.tier >= 4 || x.level === x.s.levels.length || (x.prev === 0 && x.s.tier >= 3))) {
      const label = p.level === p.s.levels.length ? `Habilidade maximizada: ${p.s.name}` : p.prev === 0 ? `Nova habilidade: ${p.s.name}` : `${p.s.name} alcançou o nível ${p.level}`;
      stmts.push({ sql: "INSERT OR IGNORE INTO chronicle_marks (owner_id, event_key, label, event_at) VALUES (?, ?, ?, datetime('now'))", args: [ownerId, `skill:e${st.epoch}:${p.s.key}:${p.level}`, label] });
    }
  }
  stmts.push({ sql: "INSERT INTO skill_balance_guard (owner_id, ok) SELECT ?, 0 WHERE (SELECT COALESCE(SUM(amount), 0) FROM skill_point_ledger WHERE owner_id = ?) < 0", args: [ownerId, ownerId] });
  stmts.push(...effectSyncStatements(ownerId, sim.levels));
  try {
    await db.batch(stmts, "write");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("skill_points_insufficient")) throw new SkillTreeError("PH insuficientes: o saldo mudou. Atualize a árvore.", 409);
    if (msg.includes("UNIQUE")) throw new SkillTreeError("Essa evolução já foi feita (talvez em outra aba). Atualize a árvore.", 409);
    throw e;
  }
  if ((await automationConfig(db, ownerId, "skills", "achievements")).enabled) {
    await evaluateAchievements(ownerId).catch(() => undefined);
    await syncCodexUnlocks(db, ownerId).catch(() => undefined);
  }
  const spent = plan.reduce((s, p) => s + p.cost, 0);
  return { applied: plan.map((p) => ({ key: p.s.key, name: p.s.name, level: p.level, cost: p.cost })), spent, available: ctx.available - spent };
}

export async function upgradeSkill(db: Client, ownerId: string, key: string, expectedLevel: unknown) {
  const s = SKILL_BY_KEY.get(key);
  if (!s) throw new SkillTreeError("Habilidade inexistente.", 404);
  const cur = (await userLevels(db, ownerId)).get(key) ?? 0;
  if (expectedLevel != null && Number(expectedLevel) !== cur) throw new SkillTreeError("A habilidade mudou desde que a tela foi carregada. Atualize a árvore.", 409);
  return applySteps(db, ownerId, [{ key, level: cur + 1 }], "manual");
}

/** Aplica uma build/preset: revalida a simulação e exige que o cliente confirme exatamente os passos executáveis. */
export async function applyPlan(db: Client, ownerId: string, targets: unknown, confirmed: unknown, origin: "build" | "preset" | "oracle") {
  const sim = await simulate(db, ownerId, targets);
  const want = sim.executable.map((x) => `${x.key}:${x.level}`).join("|");
  const got = (Array.isArray(confirmed) ? confirmed : []).map((x) => `${String((x as PresetTarget).key)}:${Number((x as PresetTarget).level)}`).join("|");
  if (!sim.executable.length) throw new SkillTreeError("Nenhuma evolução desta proposta pode ser feita agora com os seus recursos.", 409, sim);
  if (want !== got) throw new SkillTreeError("A simulação mudou desde a sua confirmação. Revise os passos e confirme de novo.", 409, sim);
  return { ...(await applySteps(db, ownerId, sim.executable, origin)), skipped: sim.steps.filter((s) => !s.ok).map((s) => ({ key: s.key, name: s.name, level: s.level, reasons: s.reasons })) };
}

/* ───────────────────────────── redefinição ───────────────────────────── */

export async function resetPreview(db: Client, ownerId: string) {
  const [st, levels, tx] = await Promise.all([
    loadState(db, ownerId),
    userLevels(db, ownerId),
    db.execute({ sql: "SELECT COALESCE(SUM(points_spent), 0) AS p FROM skill_transactions WHERE owner_id = ? AND kind = 'upgrade' AND epoch = (SELECT epoch FROM skill_tree_state WHERE owner_id = ?)", args: [ownerId, ownerId] }),
  ]);
  const spent = num(tx.rows[0]?.p);
  const refund = Math.floor((spent * st.settings.refundPct) / 100);
  const nextAllowed = st.lastResetAt && st.settings.cooldownDays > 0 ? new Date(Date.parse(`${st.lastResetAt.replace(" ", "T")}Z`) + st.settings.cooldownDays * 86_400_000).toISOString() : null;
  return {
    epoch: st.epoch,
    skills: [...levels].map(([key, level]) => ({ key, name: SKILL_BY_KEY.get(key)!.name, level })),
    effects: effectsFor(levels).map((e) => ({ key: e.key, label: e.label })),
    spent,
    refund,
    refundPct: st.settings.refundPct,
    cooldownDays: st.settings.cooldownDays,
    blockedUntil: nextAllowed && Date.parse(nextAllowed) > Date.now() ? nextAllowed : null,
    keeps: "Conquistas, títulos já obtidos, histórico, presets e todos os registros reais (missões, hábitos, estudos) são preservados.",
  };
}

export async function resetTree(db: Client, ownerId: string, expectedEpoch: unknown) {
  const p = await resetPreview(db, ownerId);
  if (Number(expectedEpoch) !== p.epoch) throw new SkillTreeError("A árvore mudou desde a prévia. Revise de novo antes de confirmar.", 409);
  if (!p.skills.length) throw new SkillTreeError("Não há habilidades para redefinir.");
  if (p.blockedUntil) throw new SkillTreeError(`Próxima redefinição liberada em ${new Date(p.blockedUntil).toLocaleDateString("pt-BR")} (regra de intervalo).`, 409);
  const stmts: Array<{ sql: string; args: Array<string | number | null> }> = [
    { sql: "UPDATE skill_tree_state SET epoch = epoch + 1, last_reset_at = datetime('now'), notified_json = '[]', updated_at = datetime('now') WHERE owner_id = ? AND epoch = ?", args: [ownerId, p.epoch] },
    { sql: "INSERT INTO skill_transactions (id, owner_id, kind, epoch, points_spent, origin) VALUES (?, ?, 'reset', ?, ?, 'manual')", args: [nanoid(), ownerId, p.epoch, -p.refund] },
    { sql: "DELETE FROM user_skills WHERE owner_id = ?", args: [ownerId] },
    { sql: "DELETE FROM skill_effects_state WHERE owner_id = ?", args: [ownerId] },
  ];
  if (p.refund > 0) stmts.push({ sql: "INSERT INTO skill_point_ledger (id, owner_id, event_key, amount, source, label) VALUES (?, ?, ?, ?, 'refund', ?)", args: [nanoid(), ownerId, `refund:e${p.epoch}`, p.refund, `Redefinição da árvore (${p.refundPct}%)`] });
  try {
    await db.batch(stmts, "write");
  } catch (e) {
    if (e instanceof Error && e.message.includes("UNIQUE")) throw new SkillTreeError("Esta redefinição já foi feita.", 409);
    throw e;
  }
  return { refunded: p.refund, skills: p.skills.length, epoch: p.epoch + 1 };
}

export async function saveTreeSettings(db: Client, ownerId: string, input: { cooldownDays?: unknown; refundPct?: unknown }) {
  const st = await loadState(db, ownerId);
  const next = {
    cooldownDays: input.cooldownDays == null ? st.settings.cooldownDays : Math.max(0, Math.min(90, Math.floor(Number(input.cooldownDays) || 0))),
    refundPct: input.refundPct == null ? st.settings.refundPct : [50, 75, 100].includes(Number(input.refundPct)) ? Number(input.refundPct) : st.settings.refundPct,
  };
  await db.execute({ sql: "UPDATE skill_tree_state SET settings_json = ?, updated_at = datetime('now') WHERE owner_id = ?", args: [JSON.stringify(next), ownerId] });
  return next;
}

/* ───────────────────────────── presets e build desejada ───────────────────────────── */

export async function listPresets(db: Client, ownerId: string) {
  const r = await db.execute({ sql: "SELECT id, name, description, config_json, updated_at FROM skill_presets WHERE owner_id = ? ORDER BY updated_at DESC", args: [ownerId] });
  return [
    ...BUILTIN_PRESETS.map((p) => ({ id: p.id, name: p.name, description: p.description, icon: p.icon, builtin: true, targets: p.targets, updatedAt: null as string | null })),
    ...(r.rows as Row[]).map((x) => ({ id: String(x.id), name: String(x.name), description: x.description ? String(x.description) : "", icon: "Sparkles", builtin: false, targets: sanitizeTargets(parse<{ targets?: unknown }>(x.config_json, {}).targets), updatedAt: String(x.updated_at) })),
  ];
}

export async function savePreset(db: Client, ownerId: string, id: string | null, input: { name?: unknown; description?: unknown; targets?: unknown }) {
  const name = String(input.name ?? "").trim().slice(0, 60);
  const targets = sanitizeTargets(input.targets);
  if (name.length < 2) throw new SkillTreeError("Dê um nome ao preset.");
  if (!targets.length) throw new SkillTreeError("Escolha ao menos uma habilidade no preset.");
  const description = String(input.description ?? "").trim().slice(0, 200) || null;
  if (id) {
    if (BUILTIN_PRESETS.some((p) => p.id === id)) throw new SkillTreeError("Presets oficiais não podem ser editados — duplique para personalizar.");
    const r = await db.execute({ sql: "UPDATE skill_presets SET name = ?, description = ?, config_json = ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [name, description, JSON.stringify({ targets }), id, ownerId] });
    if (!r.rowsAffected) throw new SkillTreeError("Preset não encontrado.", 404);
    return { id };
  }
  const count = await db.execute({ sql: "SELECT COUNT(*) AS n FROM skill_presets WHERE owner_id = ?", args: [ownerId] });
  if (num(count.rows[0]?.n) >= 20) throw new SkillTreeError("Limite de 20 presets personalizados.");
  const nid = nanoid();
  await db.execute({ sql: "INSERT INTO skill_presets (id, owner_id, name, description, config_json) VALUES (?, ?, ?, ?, ?)", args: [nid, ownerId, name, description, JSON.stringify({ targets })] });
  if ((await automationConfig(db, ownerId, "skills", "achievements")).enabled) await evaluateAchievements(ownerId).catch(() => undefined);
  return { id: nid };
}

export async function duplicatePreset(db: Client, ownerId: string, id: string) {
  const all = await listPresets(db, ownerId);
  const p = all.find((x) => x.id === id);
  if (!p) throw new SkillTreeError("Preset não encontrado.", 404);
  return savePreset(db, ownerId, null, { name: `${p.name} (cópia)`.slice(0, 60), description: p.description, targets: p.targets });
}

export async function deletePreset(db: Client, ownerId: string, id: string) {
  const r = await db.execute({ sql: "DELETE FROM skill_presets WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  if (!r.rowsAffected) throw new SkillTreeError("Preset não encontrado.", 404);
  return { deleted: true };
}

export async function saveDesired(db: Client, ownerId: string, targets: unknown) {
  await loadState(db, ownerId);
  const t = sanitizeTargets(targets);
  await db.execute({ sql: "UPDATE skill_tree_state SET desired_json = ?, updated_at = datetime('now') WHERE owner_id = ?", args: [JSON.stringify(t), ownerId] });
  return { targets: t };
}

/* ───────────────────────────── visão completa ───────────────────────────── */

function titleFor(invested: number) {
  const idx = TREE_TITLES.reduce((acc, t, i) => (invested >= t.min ? i : acc), 0);
  const next = TREE_TITLES[idx + 1] ?? null;
  return { title: TREE_TITLES[idx]!.title, next: next ? { title: next.title, min: next.min } : null, pct: next ? Math.round(((invested - TREE_TITLES[idx]!.min) / (next.min - TREE_TITLES[idx]!.min)) * 100) : 100, rule: "Títulos da Árvore sobem com os PH investidos (progressão do RPG, não uma métrica de vida)." };
}

export async function getSkillTree(db: Client, ownerId: string) {
  const ctx = await context(db, ownerId);
  const [bal, st, history, presets, ledger] = await Promise.all([
    pointBalance(db, ownerId),
    loadState(db, ownerId),
    db.execute({ sql: "SELECT id, kind, epoch, skill_key, previous_level, new_level, points_spent, origin, created_at FROM skill_transactions WHERE owner_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 60", args: [ownerId] }),
    listPresets(db, ownerId),
    db.execute({ sql: "SELECT event_key, amount, source, label, created_at FROM skill_point_ledger WHERE owner_id = ? AND source IN ('level','milestone','achievement','event','refund') ORDER BY created_at DESC, rowid DESC LIMIT 30", args: [ownerId] }),
  ]);
  const skills = SKILLS.map((s) => {
    const level = ctx.levels.get(s.key) ?? 0;
    const state = stateOf(s, ctx);
    return {
      key: s.key,
      name: s.name,
      description: s.description,
      branch: s.branch,
      tier: s.tier,
      icon: s.icon,
      rarity: s.rarity,
      maxLevel: s.levels.length,
      level,
      state,
      pos: s.pos,
      requires: s.requires,
      levels: s.levels.map((l, i) => ({
        level: i + 1,
        cost: l.cost,
        heroLevel: l.heroLevel,
        evidence: l.evidence ? { ...l.evidence, label: EVIDENCE_META[l.evidence.metric].label(l.evidence.min), current: ctx.facts[l.evidence.metric] ?? 0, module: EVIDENCE_META[l.evidence.metric].module, route: EVIDENCE_META[l.evidence.metric].route } : null,
        effects: l.effects.map((e) => ({ key: e.key, type: e.type, label: e.label, description: e.description })),
      })),
      next: level < s.levels.length ? evaluateLevel(s, level + 1, ctx) : null,
    };
  });
  const effects = effectsFor(ctx.levels);
  const unlocked = skills.filter((s) => s.level > 0).length;
  const maxed = skills.filter((s) => s.state === "maximizada").length;
  const branches = BRANCHES.map((b) => {
    const list = skills.filter((s) => s.branch === b.key);
    const max = list.reduce((s, x) => s + x.maxLevel, 0);
    const got = list.reduce((s, x) => s + x.level, 0);
    return { key: b.key, label: b.label, tone: b.tone, theme: b.theme, skills: list.length, unlocked: list.filter((s) => s.level > 0).length, levels: got, max, pct: max ? Math.round((got / max) * 100) : 0, avgLevel: list.length ? Math.round((got / list.length) * 10) / 10 : 0 };
  });
  const desiredPlan = st.desired.length ? planTargets(st.desired, ctx) : null;
  const nearest = skills
    .filter((s) => s.next && !s.next.ok && s.state !== "bloqueada")
    .map((s) => ({ key: s.key, name: s.name, level: s.level + 1, missing: s.next!.checks.filter((c) => !c.met).map((c) => c.label), progress: s.next!.checks.reduce((acc, c) => acc + (c.met ? 1 : c.current != null && c.target ? Math.min(0.99, c.current / c.target) : 0), 0) / s.next!.checks.length }))
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 5);
  return {
    version: SKILL_TREE_VERSION,
    hero: { level: ctx.hero.level, totalXp: ctx.hero.totalXp, xpIntoLevel: ctx.hero.xpIntoLevel, xpForNextLevel: ctx.hero.xpForNextLevel, progressPct: ctx.hero.progressPct },
    points: { ...bal, rule: `${POINT_RULES.perLevel} PH por nível do herói acima do 1, +${POINT_RULES.milestoneBonus} a cada ${POINT_RULES.milestoneEvery} níveis e +${POINT_RULES.achievementBonus} por conquista ouro ou platina. Moedas e XP não mudam.` },
    epoch: st.epoch,
    settings: st.settings,
    skills,
    branches,
    stats: { total: skills.length, unlocked, maxed, available: skills.filter((s) => s.state === "disponivel" || s.state === "em_evolucao").length, levels: skills.reduce((s, x) => s + x.level, 0), maxLevels: skills.reduce((s, x) => s + x.maxLevel, 0) },
    title: titleFor(bal.invested),
    effects: effects.map((e) => ({ key: e.key, type: e.type, label: e.label, description: e.description, skill: e.skill, skillName: SKILL_BY_KEY.get(e.skill)!.name, level: e.level })),
    history: (history.rows as Row[]).map((h) => {
      const id = String(h.id);
      return { id, kind: String(h.kind), epoch: num(h.epoch), skill: h.skill_key ? String(h.skill_key) : null, name: h.skill_key ? SKILL_BY_KEY.get(String(h.skill_key))?.name ?? String(h.skill_key) : null, from: h.previous_level == null ? null : num(h.previous_level), to: h.new_level == null ? null : num(h.new_level), points: num(h.points_spent), origin: String(h.origin), at: String(h.created_at) };
    }),
    grants: (ledger.rows as Row[]).map((g) => ({ key: String(g.event_key), amount: num(g.amount), source: String(g.source), label: String(g.label), at: String(g.created_at) })),
    presets,
    desired: st.desired,
    desiredPlan: desiredPlan ? { totalCost: desiredPlan.totalCost, readyCost: desiredPlan.readyCost, blocked: desiredPlan.blocked, steps: desiredPlan.steps.length, done: st.desired.filter((t) => (ctx.levels.get(t.key) ?? 0) >= t.level).length, targets: st.desired.length } : null,
    nearest,
  };
}

/* ───────────────────────────── efeitos consumidos pelos módulos ───────────────────────────── */

export async function activeEffects(db: Client, ownerId: string) {
  const levels = await userLevels(db, ownerId);
  const list = effectsFor(levels);
  const pick = (type: string) => list.filter((e) => e.type === type).map((e) => ({ key: e.key, label: e.label, skill: SKILL_BY_KEY.get(e.skill)!.name, ...e.params }));
  return {
    focusPresets: pick("focus.preset"),
    missionTemplates: pick("missions.template"),
    habitTemplates: pick("habits.template"),
    goalTemplates: pick("goals.template"),
    projectTemplates: pick("projects.template"),
    diaryPrompts: pick("diary.prompts"),
    grimoireSessions: pick("grimoire.session"),
    agendaBlocks: pick("agenda.blocks"),
    analyses: pick("analysis.panel"),
    titles: pick("codex.title"),
    count: list.length,
  };
}

async function requireEffect(db: Client, ownerId: string, effectKey: string) {
  const e = effectsFor(await userLevels(db, ownerId)).find((x) => x.key === effectKey);
  if (!e) throw new SkillTreeError("Este recurso ainda não foi desbloqueado na Árvore de Habilidades.", 403);
  return e;
}

/** Planejador de blocos: só PROPÕE janelas livres; a criação dos eventos é feita pela Agenda após confirmação. */
export async function agendaPreview(db: Client, ownerId: string, effectKey: string) {
  const e = await requireEffect(db, ownerId, effectKey);
  if (e.type !== "agenda.blocks") throw new SkillTreeError("Efeito não é um planejador de blocos.");
  const { minutes, count, label, category } = e.params as { minutes: number; count: number; label: string; category: string };
  const today = await todayKeyFor(db, ownerId);
  const blocks: Array<{ title: string; date: string; start: string; minutes: number; category: string }> = [];
  const add = (d: string, n: number) => {
    const x = new Date(`${d}T12:00:00Z`);
    x.setUTCDate(x.getUTCDate() + n);
    return x.toISOString().slice(0, 10);
  };
  const toMin = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  for (let i = 0; i < 14 && blocks.length < count; i++) {
    const day = add(today, i);
    const w = (await getFreeWindows(db, ownerId, day)).find((x) => toMin(x.end) - toMin(x.start) >= minutes);
    if (w) blocks.push({ title: label, date: day, start: w.start, minutes, category });
  }
  return { effect: e.key, label, blocks, note: blocks.length < count ? `Encontrei ${blocks.length} de ${count} janelas livres nos próximos 14 dias.` : null };
}

/* ───────────────────────────── análises complementares ───────────────────────────── */

const WEEKDAY = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export async function analysisPanel(db: Client, ownerId: string, panel: string) {
  await requireEffect(db, ownerId, `analysis.panel.${panel}`);
  const tz = await userTimezone(db, ownerId);
  const today = await todayKeyFor(db, ownerId);
  const since = (days: number) => {
    const x = new Date(`${today}T12:00:00Z`);
    x.setUTCDate(x.getUTCDate() - days + 1);
    return x.toISOString().slice(0, 10);
  };
  const local = (iso: unknown) => dayKeyIn(new Date(String(iso).includes("T") ? String(iso) : `${String(iso).replace(" ", "T")}Z`), tz);
  const wd = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
  const q = (sql: string, args: Array<string | number>) => db.execute({ sql, args: [ownerId, ...args] }).then((r) => r.rows as Row[]);
  switch (panel) {
    case "prod_weekday": {
      const rows = await q("SELECT COALESCE(completed_at, updated_at) AS at FROM tasks WHERE owner_id = ? AND status = 'Concluído' AND COALESCE(completed_at, updated_at) >= ?", [since(56)]);
      const c = [0, 0, 0, 0, 0, 0, 0];
      for (const r of rows) c[wd(local(r.at))]++;
      return { kind: "bars", title: "Missões concluídas por dia da semana (8 semanas)", unit: "missões", items: WEEKDAY.map((l, i) => ({ label: l, value: c[i]! })), sample: rows.length };
    }
    case "habit_consistency": {
      const rows = await q("SELECT h.name, he.entry_date AS d FROM habit_entries he JOIN habits h ON h.id = he.habit_id WHERE he.owner_id = ? AND he.count >= h.target_count AND he.entry_date >= ?", [since(30)]);
      const by = new Map<string, Set<string>>();
      for (const r of rows) by.set(String(r.name), (by.get(String(r.name)) ?? new Set()).add(String(r.d).slice(0, 10)));
      return { kind: "bars", title: "Dias com check-in por hábito (30 dias)", unit: "dias", items: [...by].map(([label, s]) => ({ label, value: s.size })).sort((a, b) => b.value - a.value).slice(0, 10), sample: rows.length };
    }
    case "deadline_risk": {
      const rows = await q("SELECT t.title, t.due_date, COALESCE(p.name, 'Sem projeto') AS project FROM tasks t LEFT JOIN projects p ON p.id = t.project_id WHERE t.owner_id = ? AND t.status <> 'Concluído' AND t.due_date IS NOT NULL AND substr(t.due_date, 1, 10) <= ? ORDER BY t.due_date LIMIT 40", [since(-6)]);
      const by = new Map<string, number>();
      for (const r of rows) by.set(String(r.project), (by.get(String(r.project)) ?? 0) + 1);
      return { kind: "bars", title: "Missões vencidas ou vencendo em 7 dias, por projeto", unit: "missões", items: [...by].map(([label, value]) => ({ label, value })), sample: rows.length, list: rows.slice(0, 10).map((r) => ({ label: String(r.title), detail: String(r.due_date).slice(0, 10) })) };
    }
    case "health_consistency": {
      const from = since(30);
      const [w, k, s, m] = await Promise.all([
        q("SELECT COUNT(DISTINCT substr(recorded_at, 1, 10)) AS n FROM water_entries WHERE owner_id = ? AND recorded_at >= ?", [from]),
        q("SELECT COUNT(DISTINCT substr(performed_at, 1, 10)) AS n FROM workouts WHERE owner_id = ? AND performed_at >= ?", [from]),
        q("SELECT COUNT(DISTINCT substr(went_to_bed_at, 1, 10)) AS n FROM sleep_entries WHERE owner_id = ? AND went_to_bed_at >= ?", [from]),
        q("SELECT COUNT(DISTINCT substr(recorded_at, 1, 10)) AS n FROM mood_entries WHERE owner_id = ? AND recorded_at >= ?", [from]),
      ]);
      return { kind: "bars", title: "Dias com registro nos últimos 30 dias", unit: "dias", max: 30, items: [{ label: "Água", value: num(w[0]?.n) }, { label: "Treino", value: num(k[0]?.n) }, { label: "Sono", value: num(s[0]?.n) }, { label: "Humor", value: num(m[0]?.n) }], sample: null, note: "Conta registros feitos — não é avaliação de saúde." };
    }
    case "wellbeing_balance": {
      const rows = await q("SELECT recorded_at, mood, energy FROM mood_entries WHERE owner_id = ? AND recorded_at >= ?", [since(60)]);
      const acc = WEEKDAY.map(() => ({ m: 0, e: 0, n: 0 }));
      for (const r of rows) {
        const a = acc[wd(local(r.recorded_at))]!;
        a.m += num(r.mood);
        a.e += num(r.energy);
        a.n++;
      }
      return { kind: "pairs", title: "Humor e energia médios por dia da semana (60 dias)", unit: "/5", items: WEEKDAY.map((l, i) => ({ label: l, value: acc[i]!.n ? Math.round((acc[i]!.m / acc[i]!.n) * 10) / 10 : null, value2: acc[i]!.n ? Math.round((acc[i]!.e / acc[i]!.n) * 10) / 10 : null })), legend: ["Humor", "Energia"], sample: rows.length };
    }
    case "study_subjects": {
      const [rows, cards] = await Promise.all([
        q("SELECT COALESCE(s.name, 'Sem disciplina') AS subject, SUM(ss.duration_minutes) AS m FROM study_sessions ss LEFT JOIN subjects s ON s.id = ss.subject_id WHERE ss.owner_id = ? AND ss.occurred_at >= ? GROUP BY subject ORDER BY m DESC LIMIT 10", [since(30)]),
        q("SELECT COUNT(*) AS n FROM flashcard_reviews WHERE owner_id = ? AND day_key >= ?", [since(30)]),
      ]);
      return { kind: "bars", title: "Minutos de estudo por disciplina (30 dias)", unit: "min", items: rows.map((r) => ({ label: String(r.subject), value: num(r.m) })), sample: rows.length, note: `${num(cards[0]?.n)} revisões no Grimório no mesmo período.` };
    }
    case "focus_hours": {
      const rows = await q("SELECT started_at, duration_minutes FROM time_entries WHERE owner_id = ? AND started_at >= ? AND duration_minutes >= 1", [since(30)]);
      const h = Array.from({ length: 24 }, () => 0);
      const fmt = new Intl.DateTimeFormat("en-US", { hour: "2-digit", hour12: false, timeZone: tz });
      for (const r of rows) {
        const d = new Date(String(r.started_at).includes("T") ? String(r.started_at) : `${String(r.started_at).replace(" ", "T")}Z`);
        h[Number(fmt.format(d)) % 24] += num(r.duration_minutes);
      }
      return { kind: "bars", title: "Minutos de foco por hora do dia (30 dias)", unit: "min", items: h.map((v, i) => ({ label: `${String(i).padStart(2, "0")}h`, value: v })).filter((x, i) => x.value > 0 || (i >= 6 && i <= 23)), sample: rows.length };
    }
    case "goals_overview": {
      const goals = (await loadDirectionGoals(db, ownerId)).filter((g) => g.status === "active").slice(0, 12);
      return { kind: "bars", title: "Progresso das metas ativas", unit: "%", max: 100, items: goals.map((g) => ({ label: g.title, value: g.progressPct ?? 0, detail: `${g.openTasks} missão(ões) aberta(s)` })), sample: goals.length };
    }
    case "projects_health": {
      const rows = (
        await db.execute({
          sql: `SELECT p.name, SUM(CASE WHEN t.status <> 'Concluído' THEN 1 ELSE 0 END) AS open,
                       SUM(CASE WHEN t.status <> 'Concluído' AND t.due_date IS NOT NULL AND substr(t.due_date, 1, 10) < ? THEN 1 ELSE 0 END) AS late,
                       SUM(CASE WHEN t.status = 'Concluído' AND COALESCE(t.completed_at, t.updated_at) >= ? THEN 1 ELSE 0 END) AS done
                FROM projects p LEFT JOIN tasks t ON t.project_id = p.id AND t.owner_id = p.owner_id
                WHERE p.owner_id = ? AND p.status = 'active' GROUP BY p.id ORDER BY late DESC, open DESC LIMIT 10`,
          args: [today, since(30), ownerId],
        })
      ).rows as Row[];
      return { kind: "table", title: "Projetos ativos", unit: "missões", columns: ["Abertas", "Atrasadas", "Concluídas (30d)"], rows: rows.map((r) => ({ label: String(r.name), values: [num(r.open), num(r.late), num(r.done)] })), sample: rows.length };
    }
    case "journal_rhythm": {
      const from = since(56);
      const [j, g, rec] = await Promise.all([
        q("SELECT entry_date AS d FROM journal_entries WHERE owner_id = ? AND entry_date >= ? AND (TRIM(COALESCE(thoughts, '')) <> '' OR TRIM(COALESCE(closing_reflection, '')) <> '')", [from]),
        q("SELECT entry_date AS d FROM journal_entries WHERE owner_id = ? AND entry_date >= ? AND gratitude LIKE '%\"_%'", [from]),
        q("SELECT day_key AS d FROM recovery_days WHERE owner_id = ? AND day_key >= ?", [from]),
      ]);
      const weeks: Array<{ label: string; value: number; value2: number; value3: number }> = [];
      for (let i = 7; i >= 0; i--) {
        const start = since(7 * (i + 1));
        const end = since(7 * i);
        const inW = (rows: Row[]) => rows.filter((r) => String(r.d) >= start && String(r.d) < end).length;
        weeks.push({ label: start.slice(5).split("-").reverse().join("/"), value: inW(j), value2: inW(g), value3: inW(rec) });
      }
      return { kind: "triples", title: "Diário por semana (8 semanas)", unit: "dias", items: weeks, legend: ["Escrita", "Gratidão", "Recuperação"], sample: j.length };
    }
    case "time_mix": {
      const from = since(30);
      const [f, s, w, r] = await Promise.all([
        q("SELECT COALESCE(SUM(duration_minutes), 0) AS m FROM time_entries WHERE owner_id = ? AND started_at >= ?", [from]),
        q("SELECT COALESCE(SUM(duration_minutes), 0) AS m FROM study_sessions WHERE owner_id = ? AND occurred_at >= ?", [from]),
        q("SELECT COALESCE(SUM(duration_minutes), 0) AS m FROM workouts WHERE owner_id = ? AND performed_at >= ?", [from]),
        q("SELECT COALESCE(SUM(duration_minutes), 0) AS m FROM reading_sessions WHERE owner_id = ? AND started_at >= ?", [from]),
      ]);
      return { kind: "bars", title: "Minutos registrados por tipo (30 dias)", unit: "min", items: [{ label: "Foco", value: num(f[0]?.m) }, { label: "Estudo", value: num(s[0]?.m) }, { label: "Treino", value: num(w[0]?.m) }, { label: "Leitura", value: num(r[0]?.m) }], sample: null, note: "Somente o que foi registrado em cada módulo." };
    }
    case "weekly_balance": {
      const from = since(56);
      const [f, rec, sl, wk] = await Promise.all([
        q("SELECT started_at AS d, duration_minutes AS m FROM time_entries WHERE owner_id = ? AND started_at >= ?", [from]),
        q("SELECT day_key AS d FROM recovery_days WHERE owner_id = ? AND day_key >= ?", [from]),
        q("SELECT went_to_bed_at AS d FROM sleep_entries WHERE owner_id = ? AND went_to_bed_at >= ?", [from]),
        q("SELECT performed_at AS d FROM workouts WHERE owner_id = ? AND performed_at >= ?", [from]),
      ]);
      const weeks = [];
      for (let i = 7; i >= 0; i--) {
        const start = since(7 * (i + 1));
        const end = since(7 * i);
        const inW = (d: unknown) => String(d).slice(0, 10) >= start && String(d).slice(0, 10) < end;
        weeks.push({ label: start.slice(5).split("-").reverse().join("/"), values: [f.filter((x) => inW(x.d)).reduce((s, x) => s + num(x.m), 0), rec.filter((x) => inW(x.d)).length, sl.filter((x) => inW(x.d)).length, wk.filter((x) => inW(x.d)).length] });
      }
      return { kind: "table", title: "Esforço e descanso por semana (8 semanas)", unit: "", columns: ["Foco (min)", "Recuperação (dias)", "Sono registrado", "Treinos"], rows: weeks, sample: f.length };
    }
    default:
      throw new SkillTreeError("Análise desconhecida.", 404);
  }
}

/* ───────────────────────────── Oráculo de Evolução ───────────────────────────── */

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const STOP = new Set(["quero", "meu", "minha", "meus", "minhas", "para", "com", "uma", "um", "de", "do", "da", "dos", "das", "e", "o", "a", "os", "as", "em", "no", "na", "mais", "melhor", "me", "eu", "que", "por", "ser", "ter"]);
const words = (s: string) => norm(s).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.slice(0, 6));

export async function oracle(db: Client, ownerId: string, messageRaw: unknown) {
  const message = String(messageRaw ?? "").trim().slice(0, 600);
  const ctx = await context(db, ownerId);
  const [goals, projects, habits] = await Promise.all([
    loadDirectionGoals(db, ownerId).then((g) => g.filter((x) => x.status === "active").slice(0, 8)),
    db.execute({ sql: "SELECT name FROM projects WHERE owner_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 8", args: [ownerId] }).then((r) => (r.rows as Row[]).map((x) => String(x.name))),
    db.execute({ sql: "SELECT name FROM habits WHERE owner_id = ? AND archived_at IS NULL ORDER BY created_at DESC LIMIT 8", args: [ownerId] }).then((r) => (r.rows as Row[]).map((x) => String(x.name))).catch(() => [] as string[]),
  ]);
  const query = new Set(words(`${message} ${goals.map((g) => g.title).join(" ")} ${projects.join(" ")}`));
  const msgWords = new Set(words(message));
  // Pontuação: termos do pedido valem mais que termos das metas/projetos; habilidades já evoluíveis ganham um bônus.
  const scored = SKILLS.map((s) => {
    const text = new Set(words(`${s.name} ${s.description} ${s.tags.join(" ")} ${s.levels.flatMap((l) => l.effects.map((e) => e.label)).join(" ")}`));
    let score = 0;
    const why: string[] = [];
    for (const w of text) {
      if (msgWords.has(w)) score += 3;
      else if (query.has(w)) score += 1;
    }
    const cur = ctx.levels.get(s.key) ?? 0;
    const st = stateOf(s, ctx);
    if (st === "disponivel" || st === "em_evolucao") score += 2;
    if (cur >= s.levels.length) score = -1;
    const match = goals.find((g) => words(g.title).some((w) => text.has(w)));
    if (match) why.push(`Relacionada à meta “${match.title}”.`);
    return { s, score, cur, st, why };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const picks = scored.slice(0, 5);
  const targets = picks.map((p) => ({ key: p.s.key, level: Math.min(p.s.levels.length, p.cur + 1) }));
  const plan = targets.length ? planTargets(targets, ctx) : null;
  const missionSeeds = (plan?.steps ?? [])
    .flatMap((st) => st.checks.filter((c) => c.kind === "evidence" && !c.met).map((c) => ({ request: `Criar uma missão para avançar em: ${c.label.toLowerCase()} (${c.current}/${c.target}) — requisito de “${st.name}” nível ${st.level}`, why: `Pré-requisito real em ${c.module}.`, skill: st.key })))
    .slice(0, 3);
  const idle = ctx.available > 0 && (plan?.executable.length ?? 0) === 0;
  const base = {
    available: ctx.available,
    heroLevel: ctx.heroLevel,
    recommendations: picks.map((p) => ({ key: p.s.key, name: p.s.name, branch: p.s.branch, level: Math.min(p.s.levels.length, p.cur + 1), state: p.st, why: p.why.length ? p.why : [`Combina com o que você descreveu (${p.s.tags.slice(0, 3).join(", ")}).`] })),
    plan: plan ? { targets, steps: plan.steps.map((s) => ({ key: s.key, name: s.name, level: s.level, cost: s.cost, ok: s.ok, reasons: s.reasons })), executable: plan.executable, totalCost: plan.totalCost, readyCost: plan.readyCost } : null,
    missionSeeds,
    idlePoints: idle ? `Você tem ${ctx.available} PH parados: nenhuma das recomendações pode ser comprada agora — veja os requisitos pendentes.` : null,
    preset: picks.length >= 2 ? { name: `Plano do Oráculo — ${new Date().toLocaleDateString("pt-BR")}`, targets } : null,
  };
  const aiOn = (await automationConfig(db, ownerId, "skills", "recommendations")).enabled;
  const config = aiOn ? await getGeminiConfig() : null;
  if (!config || !message || !picks.length) {
    return { ...base, ai: { used: false, status: !aiOn ? "desligada" : config ? "sem_pedido" : "indisponivel", detail: !aiOn ? "Recomendações por IA desligadas nas automações: análise por regras." : config ? "Descreva um objetivo para uma análise personalizada." : "IA não configurada: recomendações por regras sobre os seus dados." }, summary: picks.length ? `Encontrei ${picks.length} habilidade(s) alinhada(s) ao seu objetivo e aos seus registros.` : "Não encontrei habilidades relacionadas — tente descrever o objetivo com outras palavras." };
  }
  const prompt = `Você é o Oráculo de Evolução do LifeOS (RPG de produtividade, português do Brasil).
Objetivo do usuário: "${message}"
Nível do herói: ${ctx.heroLevel}. PH disponíveis: ${ctx.available}.
Metas ativas: ${goals.map((g) => `${g.title} (${g.progressPct ?? 0}%)`).join("; ") || "nenhuma"}.
Projetos ativos: ${projects.join("; ") || "nenhum"}. Hábitos: ${habits.join("; ") || "nenhum"}.
Habilidades candidatas (use SOMENTE estas chaves): ${picks.map((p) => `${p.s.key} = ${p.s.name}: ${p.s.description}`).join(" | ")}
Plano calculado pelo sistema (não altere custos nem requisitos): ${(plan?.steps ?? []).map((s) => `${s.name} nv.${s.level} ${s.ok ? "pronto" : `pendente: ${s.reasons.join(", ")}`}`).join("; ")}
Explique em até 4 frases por que esse caminho ajuda o objetivo e, para cada candidata, uma justificativa curta. Não invente números, efeitos ou habilidades.
Responda em JSON: {"summary": string, "why": {"<chave>": string}}`;
  const out = await generateText(prompt, config, { timeoutMs: 25_000, retries: 1, maxOutputTokens: 1200 });
  if (!out.ok) return { ...base, ai: { used: false, status: "erro", detail: `A IA não respondeu (${out.message.slice(0, 120)}). Recomendações por regras.` }, summary: `Encontrei ${picks.length} habilidade(s) alinhada(s) ao seu objetivo.` };
  const parsed = extractJson(out.text) as { summary?: unknown; why?: Record<string, unknown> } | null;
  const why = parsed?.why ?? {};
  return {
    ...base,
    recommendations: base.recommendations.map((r) => ({ ...r, why: str(why[r.key], 300) ? [str(why[r.key], 300)!, ...r.why] : r.why })),
    ai: { used: true, status: "ok", detail: "Justificativas da IA configurada no LifeOS; custos, requisitos e plano calculados pelo sistema." },
    summary: str(parsed?.summary, 800) ?? `Encontrei ${picks.length} habilidade(s) alinhada(s) ao seu objetivo.`,
  };
}

/* ───────────────────────────── automações diárias ───────────────────────────── */

type Outcome = { status: "ok" | "skipped" | "error"; summary: string };

async function notifyOnce(db: Client, ownerId: string, eventType: string, title: string, body: string, config: Record<string, unknown>) {
  const dup = await db.execute({ sql: "SELECT 1 FROM in_app_notifications WHERE owner_id = ? AND event_type = ? AND title = ? AND substr(created_at, 1, 10) = date('now')", args: [ownerId, eventType, title] });
  if (dup.rows.length) return false;
  await notifyFromAutomation(db, ownerId, { eventType, title, body: body.slice(0, 500), url: "/arvore-habilidades", inApp: config.inApp !== false, push: config.push === true });
  return true;
}

/** B — Pontos de nível: concede os PH pendentes. */
export async function runSkillPoints(db: Client, ownerId: string): Promise<Outcome> {
  const n = await syncPoints(db, ownerId);
  return n ? { status: "ok", summary: `${n} concessão(ões) de PH registrada(s).` } : { status: "skipped", summary: "Nenhum PH novo: tudo já concedido." };
}

/** A + C — Recalcula requisitos e avisa (uma vez) quando uma evolução fica disponível. */
export async function runAvailability(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const ctx = await context(db, ownerId);
  const st = await loadState(db, ownerId);
  const ready = SKILLS.filter((s) => ["disponivel", "em_evolucao"].includes(stateOf(s, ctx))).map((s) => `${s.key}:${(ctx.levels.get(s.key) ?? 0) + 1}`);
  const fresh = ready.filter((k) => !st.notified.includes(k));
  await db.execute({ sql: "UPDATE skill_tree_state SET notified_json = ? WHERE owner_id = ?", args: [JSON.stringify([...new Set([...st.notified.filter((k) => ready.includes(k)), ...ready])].slice(-200)), ownerId] });
  if (!fresh.length) return { status: "skipped", summary: ready.length ? `${ready.length} evolução(ões) disponível(is), já avisadas.` : "Nenhuma evolução disponível agora." };
  const names = fresh.map((k) => SKILL_BY_KEY.get(k.split(":")[0]!)!.name);
  await notifyOnce(db, ownerId, "skill_available", `${fresh.length} habilidade(s) pronta(s) para evoluir`, names.slice(0, 5).join(" · "), config);
  return { status: "ok", summary: `Aviso: ${names.slice(0, 5).join(", ")}.` };
}

/** H — Próximo desbloqueio: o requisito mais próximo de ser cumprido. */
export async function runNextUnlock(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const view = await getSkillTree(db, ownerId);
  const n = view.nearest[0];
  if (!n) return { status: "skipped", summary: "Sem requisitos pendentes próximos." };
  await notifyOnce(db, ownerId, "skill_next", `Quase lá: ${n.name} nível ${n.level}`, `Falta: ${n.missing.join("; ")}`, config);
  return { status: "ok", summary: `${n.name} nv. ${n.level}: ${n.missing.join("; ")}.` };
}

/** I — Build desejada: progresso até a distribuição planejada. */
export async function runDesiredBuild(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const view = await getSkillTree(db, ownerId);
  if (!view.desiredPlan) return { status: "skipped", summary: "Nenhuma build desejada salva." };
  const d = view.desiredPlan;
  if (d.readyCost > 0) await notifyOnce(db, ownerId, "skill_build", "Sua build desejada pode avançar", `${d.done}/${d.targets} alvos concluídos · ${d.readyCost} PH de evoluções prontas para aplicar.`, config);
  return { status: "ok", summary: `${d.done}/${d.targets} alvos · ${d.steps} passo(s) restantes · ${d.blocked} bloqueado(s).` };
}

/** J — Missões sugeridas: prepara pedidos para o Conselheiro (nada é criado sem aprovação). */
export async function runSuggestedMissions(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const view = await getSkillTree(db, ownerId);
  const seeds = view.nearest.flatMap((n) => n.missing.filter((m) => !m.includes("PH") && !m.startsWith("Herói")).map((m) => `${m} (para ${n.name})`)).slice(0, 3);
  if (!seeds.length) return { status: "skipped", summary: "Nenhum requisito de evidência pendente perto de ser cumprido." };
  await notifyOnce(db, ownerId, "skill_missions", "Missões sugeridas pela Árvore", seeds.join(" · "), config);
  return { status: "ok", summary: `Sugestões preparadas: ${seeds.join("; ")}. Crie pelo Oráculo na Árvore.` };
}

export const SKILL_CORE_BRANCHES = CORE_BRANCHES;
