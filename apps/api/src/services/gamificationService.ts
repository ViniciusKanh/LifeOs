import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { GAMIFICATION_RULES } from "../config/gamification.js";

/**
 * Motor de gamificação do LifeOS ("RPG da vida real").
 *
 * Regras de ouro:
 * - XP e moedas só nascem DEPOIS da ação persistida (os hooks são
 *   chamados pelas rotas após o UPDATE/INSERT dar certo);
 * - cada concessão tem chave de origem única → idempotente (desfazer e
 *   refazer, alternar check-in ou reabrir não duplicam nada);
 * - XP nunca diminui; moedas só diminuem por resgate na loja;
 * - nível é sempre derivado do XP total (levelForXp), nunca gravado.
 */

export type XpSourceType = "task" | "day" | "habit_entry" | "focus" | "project" | "journal" | "review";

export interface XpGrant {
  sourceType: XpSourceType;
  sourceId: string;
  eventType: string;
  xp: number;
  coins: number;
  label: string;
  projectId?: string | null;
}

export interface LevelInfo {
  level: number;
  totalXp: number;
  levelStartXp: number;
  nextLevelXp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progressPct: number;
}

type Curve = { base: number; step: number };

/** XP total necessário para ALCANÇAR o nível informado (nível 1 = 0 XP). */
export function xpToReachLevel(level: number, curve: Curve = GAMIFICATION_RULES.levelCurve): number {
  if (level <= 1) return 0;
  const n = level - 1;
  // Soma de uma PA: base*n + step*(0 + 1 + ... + (n-1))
  return curve.base * n + (curve.step * n * (n - 1)) / 2;
}

/** Função central e pura da curva de nível — testada isoladamente. */
export function levelForXp(totalXpRaw: number, curve: Curve = GAMIFICATION_RULES.levelCurve): LevelInfo {
  const totalXp = Math.max(0, Math.floor(Number.isFinite(totalXpRaw) ? totalXpRaw : 0));
  let level = 1;
  while (xpToReachLevel(level + 1, curve) <= totalXp) level++;
  const levelStartXp = xpToReachLevel(level, curve);
  const nextLevelXp = xpToReachLevel(level + 1, curve);
  const xpForNextLevel = nextLevelXp - levelStartXp;
  const xpIntoLevel = totalXp - levelStartXp;
  return {
    level,
    totalXp,
    levelStartXp,
    nextLevelXp,
    xpIntoLevel,
    xpForNextLevel,
    progressPct: Math.round((xpIntoLevel / xpForNextLevel) * 100),
  };
}

/** Data YYYY-MM-DD no fuso do usuário (o "dia" de jogo). */
export function dayKeyIn(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function daysBetweenKeys(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

async function userTimezone(db: Client, ownerId: string): Promise<string> {
  const r = await db.execute({ sql: "SELECT timezone FROM users WHERE id = ?", args: [ownerId] });
  const tz = r.rows[0]?.timezone;
  return typeof tz === "string" && tz ? tz : GAMIFICATION_RULES.defaultTimezone;
}

export async function todayKeyFor(db: Client, ownerId: string, now = new Date()): Promise<string> {
  return dayKeyIn(now, await userTimezone(db, ownerId));
}

/**
 * Grava uma concessão de XP (+ moedas) de forma atômica e idempotente.
 * Devolve true só quando o XP foi de fato concedido agora.
 */
export async function award(db: Client, ownerId: string, grant: XpGrant, dayKey: string): Promise<boolean> {
  if (grant.xp <= 0 && grant.coins <= 0) return false;
  const statements = [
    {
      sql: `INSERT INTO xp_events (id, owner_id, source_type, source_id, event_type, xp, project_id, label, day_key)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (owner_id, source_type, source_id, event_type) DO NOTHING`,
      args: [nanoid(), ownerId, grant.sourceType, grant.sourceId, grant.eventType, Math.max(0, grant.xp), grant.projectId ?? null, grant.label, dayKey],
    },
  ];
  if (grant.coins > 0) {
    // Mesma chave de origem do XP: o UNIQUE do ledger garante idempotência.
    statements.push({
      sql: `INSERT INTO coin_ledger (id, owner_id, amount, source_type, source_id, event_type, label)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (owner_id, source_type, source_id, event_type) DO NOTHING`,
      args: [nanoid(), ownerId, grant.coins, grant.sourceType, grant.sourceId, grant.eventType, grant.label],
    });
  }
  const results = await db.batch(statements, "write");
  return results[0].rowsAffected > 0;
}

/** Hooks nunca derrubam a ação principal: falha de XP vira só um aviso no log. */
async function safely(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.warn(`[gamificação] falha ao conceder XP (${label}):`, err instanceof Error ? err.message : "erro desconhecido");
  }
}

function parseJsonArray(value: unknown): string[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** Monta as concessões de uma tarefa concluída (puro, sem I/O — testável). */
export function buildTaskGrants(input: {
  taskId: string;
  title: string;
  priority: string;
  dueDate: string | null;
  projectId: string | null;
  dayKey: string;
  isMainMission: boolean;
}): XpGrant[] {
  const R = GAMIFICATION_RULES.task;
  const base = { sourceType: "task" as const, sourceId: input.taskId, projectId: input.projectId };
  const grants: XpGrant[] = [
    {
      ...base,
      eventType: "completed",
      xp: R.xpByPriority[input.priority] ?? R.xpByPriority["Média"],
      coins: R.coinsByPriority[input.priority] ?? R.coinsByPriority["Média"],
      label: `Missão concluída: ${input.title}`,
    },
  ];
  const due = input.dueDate ? input.dueDate.slice(0, 10) : null;
  if (due === input.dayKey) {
    grants.push({ ...base, eventType: "daily_mission", xp: R.dailyMissionXp, coins: 0, label: "Bônus de missão diária" });
  } else if (due && due > input.dayKey) {
    grants.push({ ...base, eventType: "before_deadline", xp: R.beforeDeadlineXp, coins: 0, label: "Bônus: antes do prazo" });
  }
  if (input.isMainMission) {
    grants.push({ ...base, eventType: "main_mission", xp: R.mainMissionXp, coins: R.mainMissionCoins, label: "Bônus de missão principal" });
  }
  return grants;
}

/** Aplica o teto diário de XP de tarefas, cortando as concessões excedentes. */
export function applyDailyCap(grants: XpGrant[], alreadyToday: number, cap: number): XpGrant[] {
  let remaining = Math.max(0, cap - alreadyToday);
  const out: XpGrant[] = [];
  for (const g of grants) {
    if (remaining <= 0) break;
    const xp = Math.min(g.xp, remaining);
    remaining -= xp;
    out.push({ ...g, xp });
  }
  return out;
}

async function taskXpToday(db: Client, ownerId: string, dayKey: string): Promise<number> {
  const r = await db.execute({
    sql: "SELECT COALESCE(SUM(xp), 0) AS total FROM xp_events WHERE owner_id = ? AND day_key = ? AND source_type IN ('task', 'day')",
    args: [ownerId, dayKey],
  });
  return Number(r.rows[0]?.total ?? 0);
}

/** Tarefa concluída → XP/moedas + bônus determinísticos do dia. */
export async function awardTaskCompletion(db: Client, ownerId: string, taskId: string): Promise<void> {
  await safely("tarefa", async () => {
    const r = await db.execute({
      sql: "SELECT id, title, priority, due_date, project_id, status FROM tasks WHERE id = ? AND owner_id = ?",
      args: [taskId, ownerId],
    });
    const task = r.rows[0] as unknown as
      | { id: string; title: string; priority: string; due_date: string | null; project_id: string | null; status: string }
      | undefined;
    if (!task || task.status !== "Concluído") return;

    const dayKey = await todayKeyFor(db, ownerId);
    const journal = await db.execute({
      sql: "SELECT focus_task_ids FROM journal_entries WHERE owner_id = ? AND entry_date = ?",
      args: [ownerId, dayKey],
    });
    const isMainMission = parseJsonArray(journal.rows[0]?.focus_task_ids).includes(taskId);

    const R = GAMIFICATION_RULES.task;
    const grants = buildTaskGrants({
      taskId,
      title: task.title,
      priority: task.priority,
      dueDate: task.due_date,
      projectId: task.project_id,
      dayKey,
      isMainMission,
    });
    grants.push({ sourceType: "day", sourceId: dayKey, eventType: "first_mission", xp: R.firstOfDayXp, coins: 0, label: "Primeira missão do dia" });

    const capped = applyDailyCap(grants, await taskXpToday(db, ownerId, dayKey), R.dailyXpCap);
    if (capped.length === 0) return;
    // A concessão base vem primeiro: se ela já existia (tarefa reaberta e
    // concluída de novo), nenhum bônus é concedido — anti desfazer/refazer.
    const [baseGrant, ...bonuses] = capped;
    if (!(await award(db, ownerId, baseGrant, dayKey))) return;
    for (const g of bonuses) await award(db, ownerId, g, dayKey);

    // "Dia completo": todas as missões com prazo hoje concluídas.
    const daily = await db.execute({
      sql: `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'Concluído' THEN 1 ELSE 0 END) AS done
            FROM tasks WHERE owner_id = ? AND substr(due_date, 1, 10) = ?`,
      args: [ownerId, dayKey],
    });
    const total = Number(daily.rows[0]?.total ?? 0);
    const done = Number(daily.rows[0]?.done ?? 0);
    if (total >= R.allDailyDoneMinTasks && done === total) {
      const [bonus] = applyDailyCap(
        [{ sourceType: "day", sourceId: dayKey, eventType: "all_daily_done", xp: R.allDailyDoneXp, coins: R.allDailyDoneCoins, label: "Todas as missões do dia concluídas" }],
        await taskXpToday(db, ownerId, dayKey),
        R.dailyXpCap,
      );
      if (bonus) await award(db, ownerId, bonus, dayKey);
    }
  });
}

/** Contrato (hábito) cumprido → XP, só para hoje/ontem e só ao bater a meta do dia. */
export async function awardHabitCheckIn(db: Client, ownerId: string, habitId: string, entryDate: string): Promise<void> {
  await safely("hábito", async () => {
    const r = await db.execute({
      sql: `SELECT h.name, h.target_count, e.count FROM habits h
            JOIN habit_entries e ON e.habit_id = h.id AND e.owner_id = h.owner_id
            WHERE h.id = ? AND h.owner_id = ? AND e.entry_date = ?`,
      args: [habitId, ownerId, entryDate],
    });
    const row = r.rows[0] as unknown as { name: string; target_count: number; count: number } | undefined;
    if (!row || Number(row.count) < Math.max(1, Number(row.target_count))) return;

    const dayKey = await todayKeyFor(db, ownerId);
    const diff = daysBetweenKeys(entryDate, dayKey);
    if (diff < 0 || diff > GAMIFICATION_RULES.habit.maxDaysBack) return;

    await award(
      db,
      ownerId,
      {
        sourceType: "habit_entry",
        sourceId: `${habitId}:${entryDate}`,
        eventType: "fulfilled",
        xp: GAMIFICATION_RULES.habit.xp,
        coins: GAMIFICATION_RULES.habit.coins,
        label: `Contrato cumprido: ${row.name}`,
      },
      dayKey,
    );
  });
}

/** Sessão de foco encerrada → XP por bloco completo de 25 min. */
export async function awardFocusSession(db: Client, ownerId: string, entryId: string, minutes: number, projectId: string | null): Promise<void> {
  await safely("foco", async () => {
    const F = GAMIFICATION_RULES.focus;
    const blocks = Math.min(F.maxBlocksPerSession, Math.floor(Math.max(0, minutes) / F.blockMinutes));
    if (blocks <= 0) return;
    const dayKey = await todayKeyFor(db, ownerId);
    await award(
      db,
      ownerId,
      {
        sourceType: "focus",
        sourceId: entryId,
        eventType: "session",
        xp: blocks * F.xpPerBlock,
        coins: blocks * F.coinsPerBlock,
        label: `Foco: ${blocks * F.blockMinutes} min`,
        projectId,
      },
      dayKey,
    );
  });
}

/** Projeto ("campanha") concluído → recompensa grande, uma única vez. */
export async function awardProjectCompleted(db: Client, ownerId: string, projectId: string): Promise<void> {
  await safely("projeto", async () => {
    const r = await db.execute({ sql: "SELECT name, status FROM projects WHERE id = ? AND owner_id = ?", args: [projectId, ownerId] });
    const project = r.rows[0] as unknown as { name: string; status: string } | undefined;
    if (!project || project.status !== "completed") return;
    const dayKey = await todayKeyFor(db, ownerId);
    await award(
      db,
      ownerId,
      {
        sourceType: "project",
        sourceId: projectId,
        eventType: "completed",
        xp: GAMIFICATION_RULES.project.xp,
        coins: GAMIFICATION_RULES.project.coins,
        label: `Campanha concluída: ${project.name}`,
        projectId,
      },
      dayKey,
    );
  });
}

/** Primeira entrada do Diário no dia (com texto) → XP pequeno, só no próprio dia. */
export async function awardJournalEntry(db: Client, ownerId: string, entryDate: string, hasText: boolean): Promise<void> {
  if (!hasText) return;
  await safely("diário", async () => {
    const dayKey = await todayKeyFor(db, ownerId);
    if (entryDate !== dayKey) return;
    await award(
      db,
      ownerId,
      {
        sourceType: "journal",
        sourceId: entryDate,
        eventType: "first_entry",
        xp: GAMIFICATION_RULES.journal.xp,
        coins: GAMIFICATION_RULES.journal.coins,
        label: "Crônica do dia registrada",
      },
      dayKey,
    );
  });
}

export type ReviewKind = "weekly" | "monthly" | "quarterly" | "annual";

const REVIEW_LABEL: Record<ReviewKind, string> = { weekly: "semanal", monthly: "mensal", quarterly: "trimestral", annual: "anual" };

/**
 * Revisão (fechamento de ciclo) → XP uma única vez por período. `eligible`
 * é decidido pela rota (período atual ou o anterior) e `hasReflection`
 * exige ao menos um campo escrito — salvar vazio não "fecha" o ciclo.
 */
export async function awardReviewClosed(
  db: Client,
  ownerId: string,
  kind: ReviewKind,
  periodKey: string,
  opts: { eligible: boolean; hasReflection: boolean },
): Promise<void> {
  if (!opts.eligible || !opts.hasReflection) return;
  await safely("revisão", async () => {
    const rule = GAMIFICATION_RULES.review[kind];
    const dayKey = await todayKeyFor(db, ownerId);
    await award(
      db,
      ownerId,
      { sourceType: "review", sourceId: `${kind}:${periodKey}`, eventType: "closed", xp: rule.xp, coins: rule.coins, label: `Ciclo fechado: revisão ${REVIEW_LABEL[kind]} ${periodKey}` },
      dayKey,
    );
  });
}

/** Recompensa (regra + se já foi concedida) de uma revisão, para a UI mostrar o selo real. */
export async function reviewRewardStatus(db: Client, ownerId: string, kind: ReviewKind, periodKey: string) {
  const r = await db.execute({
    sql: "SELECT xp, created_at FROM xp_events WHERE owner_id = ? AND source_type = 'review' AND source_id = ? AND event_type = 'closed'",
    args: [ownerId, `${kind}:${periodKey}`],
  });
  const rule = GAMIFICATION_RULES.review[kind];
  return { xp: rule.xp, coins: rule.coins, awarded: r.rows.length > 0, awardedAt: r.rows[0] ? String(r.rows[0].created_at) : null };
}

/**
 * Histórico real de subidas de nível: percorre o ledger de XP em ordem e
 * registra o momento em que o acumulado cruzou cada limiar da curva.
 */
export async function getLevelHistory(db: Client, ownerId: string) {
  const r = await db.execute({
    sql: "SELECT xp, created_at, day_key FROM xp_events WHERE owner_id = ? ORDER BY created_at ASC, rowid ASC",
    args: [ownerId],
  });
  const ups: Array<{ level: number; reachedAt: string; dayKey: string; totalXp: number }> = [];
  let total = 0;
  let level = 1;
  for (const row of r.rows) {
    total += Number(row.xp);
    while (xpToReachLevel(level + 1) <= total) {
      level++;
      ups.push({ level, reachedAt: String(row.created_at), dayKey: String(row.day_key), totalXp: total });
    }
  }
  return ups;
}

/** XP e moedas por origem (source_type:source_id) e por dia num intervalo — usado pela Timeline. */
export async function getXpIndex(db: Client, ownerId: string, fromDay: string, toDay: string) {
  const r = await db.execute({
    sql: `SELECT x.source_type, x.source_id, x.day_key, x.xp, COALESCE(c.amount, 0) AS coins
          FROM xp_events x
          LEFT JOIN coin_ledger c ON c.owner_id = x.owner_id AND c.source_type = x.source_type
                                 AND c.source_id = x.source_id AND c.event_type = x.event_type
          WHERE x.owner_id = ? AND x.day_key >= ? AND x.day_key <= ?`,
    args: [ownerId, fromDay, toDay],
  });
  const bySource: Record<string, { xp: number; coins: number }> = {};
  const byDay: Record<string, number> = {};
  for (const row of r.rows) {
    const key = `${row.source_type}:${row.source_id}`;
    const cur = bySource[key] ?? { xp: 0, coins: 0 };
    cur.xp += Number(row.xp);
    cur.coins += Number(row.coins);
    bySource[key] = cur;
    byDay[String(row.day_key)] = (byDay[String(row.day_key)] ?? 0) + Number(row.xp);
  }
  return { bySource, byDay };
}

// ---------------------------------------------------------------------
// Leitura (perfil do jogador, histórico, carteira)
// ---------------------------------------------------------------------

export async function coinBalance(db: Client, ownerId: string): Promise<number> {
  const r = await db.execute({ sql: "SELECT COALESCE(SUM(amount), 0) AS total FROM coin_ledger WHERE owner_id = ?", args: [ownerId] });
  return Number(r.rows[0]?.total ?? 0);
}

/** Sequência de dias consecutivos (terminando hoje ou ontem) com algum XP. */
export function computeStreak(dayKeys: string[], today: string): number {
  const set = new Set(dayKeys);
  let cursor = set.has(today) ? today : null;
  if (!cursor) {
    const y = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    if (!set.has(y)) return 0;
    cursor = y;
  }
  let streak = 0;
  while (set.has(cursor)) {
    streak++;
    cursor = new Date(Date.parse(`${cursor}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  }
  return streak;
}

export interface PlayerEvent {
  id: string;
  sourceType: string;
  sourceId: string;
  eventType: string;
  xp: number;
  coins: number;
  label: string | null;
  dayKey: string;
  createdAt: string;
}

export async function getPlayerProfile(db: Client, ownerId: string) {
  const today = await todayKeyFor(db, ownerId);
  const [xpRow, days, recent, coins] = await Promise.all([
    db.execute({
      sql: "SELECT COALESCE(SUM(xp), 0) AS total, COALESCE(SUM(CASE WHEN day_key = ? THEN xp ELSE 0 END), 0) AS today FROM xp_events WHERE owner_id = ?",
      args: [today, ownerId],
    }),
    db.execute({
      sql: "SELECT DISTINCT day_key FROM xp_events WHERE owner_id = ? AND day_key >= date(?, '-400 days')",
      args: [ownerId, today],
    }),
    db.execute({
      sql: `SELECT x.id, x.source_type, x.source_id, x.event_type, x.xp, x.label, x.day_key, x.created_at,
                   COALESCE(c.amount, 0) AS coins
            FROM xp_events x
            LEFT JOIN coin_ledger c ON c.owner_id = x.owner_id AND c.source_type = x.source_type
                                   AND c.source_id = x.source_id AND c.event_type = x.event_type
            WHERE x.owner_id = ?
            ORDER BY x.created_at DESC, x.rowid DESC LIMIT 20`,
      args: [ownerId],
    }),
    coinBalance(db, ownerId),
  ]);
  const totalXp = Number(xpRow.rows[0]?.total ?? 0);
  return {
    ...levelForXp(totalXp),
    xpToday: Number(xpRow.rows[0]?.today ?? 0),
    coins,
    streakDays: computeStreak(days.rows.map((d) => String(d.day_key)), today),
    today,
    recentEvents: recent.rows.map(
      (e): PlayerEvent => ({
        id: String(e.id),
        sourceType: String(e.source_type),
        sourceId: String(e.source_id),
        eventType: String(e.event_type),
        xp: Number(e.xp),
        coins: Number(e.coins),
        label: e.label == null ? null : String(e.label),
        dayKey: String(e.day_key),
        createdAt: String(e.created_at),
      }),
    ),
  };
}

/** XP por dia e por origem nos últimos N dias (dias sem XP vêm zerados). */
export async function getXpHistory(db: Client, ownerId: string, days: number) {
  const today = await todayKeyFor(db, ownerId);
  const r = await db.execute({
    sql: `SELECT day_key, source_type, SUM(xp) AS xp FROM xp_events
          WHERE owner_id = ? AND day_key > date(?, ?)
          GROUP BY day_key, source_type`,
    args: [ownerId, today, `-${days} days`],
  });
  const byDay = new Map<string, Record<string, number>>();
  for (const row of r.rows) {
    const key = String(row.day_key);
    const bucket = byDay.get(key) ?? {};
    // "day" (bônus do dia) é contabilizado junto das missões.
    const source = String(row.source_type) === "day" ? "task" : String(row.source_type);
    bucket[source] = (bucket[source] ?? 0) + Number(row.xp);
    byDay.set(key, bucket);
  }
  const out: Array<{ date: string; total: number; bySource: Record<string, number> }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.parse(`${today}T00:00:00Z`) - i * 86_400_000).toISOString().slice(0, 10);
    const bySource = byDay.get(date) ?? {};
    out.push({ date, total: Object.values(bySource).reduce((a, b) => a + b, 0), bySource });
  }
  return out;
}

/** XP já conquistado e XP base ainda disponível por projeto ("campanha"). */
export async function getProjectsXp(db: Client, ownerId: string) {
  const [earned, open] = await Promise.all([
    db.execute({
      sql: "SELECT project_id, SUM(xp) AS xp FROM xp_events WHERE owner_id = ? AND project_id IS NOT NULL GROUP BY project_id",
      args: [ownerId],
    }),
    db.execute({
      sql: `SELECT project_id, priority, COUNT(*) AS n FROM tasks
            WHERE owner_id = ? AND project_id IS NOT NULL AND status != 'Concluído'
            GROUP BY project_id, priority`,
      args: [ownerId],
    }),
  ]);
  const map: Record<string, { earnedXp: number; availableXp: number }> = {};
  for (const row of earned.rows) {
    const id = String(row.project_id);
    map[id] = { earnedXp: Number(row.xp), availableXp: map[id]?.availableXp ?? 0 };
  }
  const R = GAMIFICATION_RULES.task.xpByPriority;
  for (const row of open.rows) {
    const id = String(row.project_id);
    const entry = map[id] ?? { earnedXp: 0, availableXp: 0 };
    entry.availableXp += (R[String(row.priority)] ?? R["Média"]) * Number(row.n);
    map[id] = entry;
  }
  return map;
}

/** Regras públicas (somente valores, sem nada sensível) para a UI mostrar recompensas previstas. */
export function publicRules() {
  const T = GAMIFICATION_RULES.task;
  return {
    task: {
      xpByPriority: T.xpByPriority,
      coinsByPriority: T.coinsByPriority,
      dailyMissionXp: T.dailyMissionXp,
      mainMissionXp: T.mainMissionXp,
      beforeDeadlineXp: T.beforeDeadlineXp,
    },
    habit: { xp: GAMIFICATION_RULES.habit.xp, coins: GAMIFICATION_RULES.habit.coins },
    focus: GAMIFICATION_RULES.focus,
    project: GAMIFICATION_RULES.project,
    journal: GAMIFICATION_RULES.journal,
    review: GAMIFICATION_RULES.review,
  };
}
