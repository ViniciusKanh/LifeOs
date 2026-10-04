import { applyPct, claimTaskBoost, focusBoostAt, releaseTaskBoost } from "./itemEffectService.js";
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

export type XpSourceType = "task" | "day" | "habit_entry" | "habit_streak" | "focus" | "project" | "journal" | "review" | "life_admin" | "achievement" | "contract" | "experiment" | "campaign";

export interface XpGrant {
  sourceType: XpSourceType;
  sourceId: string;
  eventType: string;
  xp: number;
  coins: number;
  label: string;
  projectId?: string | null;
  /** Quando há bônus (ex.: sequência da campanha): XP antes do bônus e o multiplicador aplicado. */
  baseXp?: number | null;
  multiplier?: number | null;
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

export async function userTimezone(db: Client, ownerId: string): Promise<string> {
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
      sql: `INSERT INTO xp_events (id, owner_id, source_type, source_id, event_type, xp, project_id, label, day_key, base_xp, multiplier)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (owner_id, source_type, source_id, event_type) DO NOTHING`,
      args: [
        nanoid(),
        ownerId,
        grant.sourceType,
        grant.sourceId,
        grant.eventType,
        Math.max(0, grant.xp),
        grant.projectId ?? null,
        grant.label,
        dayKey,
        grant.baseXp ?? null,
        grant.multiplier ?? null,
      ],
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
  /** Recompensa pela dificuldade (configurada pelo usuário); substitui a de prioridade. */
  difficultyReward?: { xp: number; coins: number } | null;
  /** Valores por prioridade configurados pelo usuário (sem eles, o padrão). */
  priorityReward?: { xp: number; coins: number } | null;
}): XpGrant[] {
  const R = GAMIFICATION_RULES.task;
  const base = { sourceType: "task" as const, sourceId: input.taskId, projectId: input.projectId };
  const grants: XpGrant[] = [
    {
      ...base,
      eventType: "completed",
      xp: input.difficultyReward?.xp ?? input.priorityReward?.xp ?? R.xpByPriority[input.priority] ?? R.xpByPriority["Média"],
      coins: input.difficultyReward?.coins ?? input.priorityReward?.coins ?? R.coinsByPriority[input.priority] ?? R.coinsByPriority["Média"],
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

/* ------------------------- Dificuldade (configurável) ------------------------- */

export type DifficultyKey = "facil" | "medio" | "dificil" | "epico";
export type DifficultyRewards = Record<DifficultyKey, { taskXp: number; taskCoins: number; contractXp: number; contractCoins: number }>;

export const DIFFICULTY_KEYS: readonly DifficultyKey[] = GAMIFICATION_RULES.difficulty.levels;

export function isDifficulty(v: unknown): v is DifficultyKey {
  return typeof v === "string" && (DIFFICULTY_KEYS as readonly string[]).includes(v);
}

/** Mescla o salvo com o padrão e corta tudo nos limites (puro — testável). */
export function sanitizeDifficultyRewards(raw: unknown): DifficultyRewards {
  const D = GAMIFICATION_RULES.difficulty;
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, Record<string, unknown> | undefined>;
  const clamp = (v: unknown, fallback: number, max: number) => {
    const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fallback;
    return Math.min(max, Math.max(0, n));
  };
  const out = {} as DifficultyRewards;
  for (const key of DIFFICULTY_KEYS) {
    const d = D.defaults[key];
    const v = src[key] ?? {};
    out[key] = {
      taskXp: clamp(v.taskXp, d.taskXp, D.limits.taskXp),
      taskCoins: clamp(v.taskCoins, d.taskCoins, D.limits.taskCoins),
      contractXp: clamp(v.contractXp, d.contractXp, D.limits.contractXp),
      contractCoins: clamp(v.contractCoins, d.contractCoins, D.limits.contractCoins),
    };
  }
  return out;
}

export async function getDifficultyRewards(db: Client, ownerId: string): Promise<DifficultyRewards> {
  const r = await db.execute({ sql: "SELECT difficulty_json FROM gamification_settings WHERE owner_id = ?", args: [ownerId] });
  let parsed: unknown = null;
  try {
    parsed = r.rows[0]?.difficulty_json ? JSON.parse(String(r.rows[0].difficulty_json)) : null;
  } catch {
    parsed = null;
  }
  return sanitizeDifficultyRewards(parsed);
}

/** Salva os valores do usuário (já limitados). Vale só para recompensas futuras. */
export async function saveDifficultyRewards(db: Client, ownerId: string, raw: unknown): Promise<DifficultyRewards> {
  const clean = sanitizeDifficultyRewards(raw);
  await db.execute({
    sql: `INSERT INTO gamification_settings (owner_id, difficulty_json, updated_at) VALUES (?, ?, datetime('now'))
          ON CONFLICT (owner_id) DO UPDATE SET difficulty_json = excluded.difficulty_json, updated_at = datetime('now')`,
    args: [ownerId, JSON.stringify(clean)],
  });
  return clean;
}

/* --------------------------- Prioridade (configurável) --------------------------- */

export type PriorityKey = "Baixa" | "Média" | "Alta";
export type PriorityRewards = Record<PriorityKey, { xp: number; coins: number }>;
const PRIORITY_KEYS: PriorityKey[] = ["Baixa", "Média", "Alta"];

/** Mescla o salvo com o padrão (GAMIFICATION_RULES.task) e corta nos limites. */
export function sanitizePriorityRewards(raw: unknown): PriorityRewards {
  const T = GAMIFICATION_RULES.task;
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, Record<string, unknown> | undefined>;
  const clamp = (v: unknown, fallback: number, max: number) => Math.min(max, Math.max(0, typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fallback));
  const out = {} as PriorityRewards;
  for (const p of PRIORITY_KEYS) {
    const v = src[p] ?? {};
    out[p] = { xp: clamp(v.xp, T.xpByPriority[p], T.priorityLimits.xp), coins: clamp(v.coins, T.coinsByPriority[p], T.priorityLimits.coins) };
  }
  return out;
}

export async function getPriorityRewards(db: Client, ownerId: string): Promise<PriorityRewards> {
  const r = await db.execute({ sql: "SELECT priority_json FROM gamification_settings WHERE owner_id = ?", args: [ownerId] });
  let parsed: unknown = null;
  try {
    parsed = r.rows[0]?.priority_json ? JSON.parse(String(r.rows[0].priority_json)) : null;
  } catch {
    parsed = null;
  }
  return sanitizePriorityRewards(parsed);
}

export async function savePriorityRewards(db: Client, ownerId: string, raw: unknown): Promise<PriorityRewards> {
  const clean = sanitizePriorityRewards(raw);
  const difficulty = await getDifficultyRewards(db, ownerId);
  await db.execute({
    sql: `INSERT INTO gamification_settings (owner_id, difficulty_json, priority_json, updated_at) VALUES (?, ?, ?, datetime('now'))
          ON CONFLICT (owner_id) DO UPDATE SET priority_json = excluded.priority_json, updated_at = datetime('now')`,
    args: [ownerId, JSON.stringify(difficulty), JSON.stringify(clean)],
  });
  return clean;
}

/** Tarefa concluída → XP/moedas + bônus determinísticos do dia. */
export async function awardTaskCompletion(db: Client, ownerId: string, taskId: string): Promise<void> {
  await safely("tarefa", () => awardTaskCompletionInner(db, ownerId, taskId));
  // O bônus do contrato é verificado mesmo se a tarefa já tinha sido paga antes.
  await safely("contrato", () => maybeCompleteContract(db, ownerId, taskId));
}

async function awardTaskCompletionInner(db: Client, ownerId: string, taskId: string): Promise<void> {
  {
    const r = await db.execute({
      sql: `SELECT t.id, t.title, t.priority, t.due_date, t.project_id, t.status, t.habit_id, t.difficulty,
                   c.difficulty AS contract_difficulty
            FROM tasks t LEFT JOIN contracts c ON c.id = t.contract_id AND c.owner_id = t.owner_id
            WHERE t.id = ? AND t.owner_id = ?`,
      args: [taskId, ownerId],
    });
    const task = r.rows[0] as unknown as
      | {
          id: string;
          title: string;
          priority: string;
          due_date: string | null;
          project_id: string | null;
          status: string;
          habit_id: string | null;
          difficulty: string | null;
          contract_difficulty: string | null;
        }
      | undefined;
    if (!task || task.status !== "Concluído") return;
    // Anti dupla recompensa: tarefa gerada por um hábito é só a
    // representação do check-in — quem paga é o hábito (awardHabitCheckIn).
    if (task.habit_id) return;

    const dayKey = await todayKeyFor(db, ownerId);
    const journal = await db.execute({
      sql: "SELECT focus_task_ids FROM journal_entries WHERE owner_id = ? AND entry_date = ?",
      args: [ownerId, dayKey],
    });
    const isMainMission = parseJsonArray(journal.rows[0]?.focus_task_ids).includes(taskId);

    const R = GAMIFICATION_RULES.task;
    // Dificuldade da própria tarefa ou, na falta, a do contrato a que pertence.
    const diff = isDifficulty(task.difficulty) ? task.difficulty : isDifficulty(task.contract_difficulty) ? task.contract_difficulty : null;
    const difficultyReward = diff ? (await getDifficultyRewards(db, ownerId))[diff] : null;
    const priorityRewards = diff ? null : await getPriorityRewards(db, ownerId);
    const priorityReward = priorityRewards ? priorityRewards[(PRIORITY_KEYS as string[]).includes(task.priority) ? (task.priority as PriorityKey) : "Média"] : null;
    const grants = buildTaskGrants({
      taskId,
      title: task.title,
      priority: task.priority,
      dueDate: task.due_date,
      projectId: task.project_id,
      dayKey,
      isMainMission,
      difficultyReward: difficultyReward ? { xp: difficultyReward.taskXp, coins: difficultyReward.taskCoins } : null,
      priorityReward,
    });
    // Pergaminho da Disciplina (Inventário): +% só no XP base desta missão,
    // reservado de forma atômica e devolvido se a concessão não acontecer.
    const boost = await claimTaskBoost(db, ownerId, `task:${taskId}`);
    if (boost && grants[0]) {
      const b = grants[0];
      grants[0] = { ...b, baseXp: b.xp, multiplier: (100 + boost.pct) / 100, xp: applyPct(b.xp, boost.pct), label: `${b.label} (+${boost.pct}% Pergaminho)` };
    }
    grants.push({ sourceType: "day", sourceId: dayKey, eventType: "first_mission", xp: R.firstOfDayXp, coins: 0, label: "Primeira missão do dia" });

    const capped = applyDailyCap(grants, await taskXpToday(db, ownerId, dayKey), R.dailyXpCap);
    if (capped.length === 0) {
      if (boost) await releaseTaskBoost(db, ownerId, boost.id);
      return;
    }
    // A concessão base vem primeiro: se ela já existia (tarefa reaberta e
    // concluída de novo), nenhum bônus é concedido — anti desfazer/refazer.
    const [baseGrant, ...bonuses] = capped;
    if (!(await award(db, ownerId, baseGrant, dayKey))) {
      if (boost) await releaseTaskBoost(db, ownerId, boost.id);
      return;
    }
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
  }
}

/**
 * Contrato cumprido: todas as tarefas concluídas (mínimo de tarefas) →
 * status "concluido" + bônus único pela dificuldade. Reabrir tarefa
 * devolve o contrato para "ativo", mas o bônus nunca é pago de novo.
 */
export async function maybeCompleteContract(db: Client, ownerId: string, taskId: string): Promise<void> {
  const t = await db.execute({ sql: "SELECT contract_id FROM tasks WHERE id = ? AND owner_id = ?", args: [taskId, ownerId] });
  const contractId = t.rows[0]?.contract_id;
  if (typeof contractId !== "string" || !contractId) return;
  await syncContractStatus(db, ownerId, contractId, { reward: true });
}

/**
 * Recalcula o status do contrato. O bônus só é pago quando a conclusão vem
 * de uma tarefa concluída de verdade (`reward: true`) — apagar tarefas ou
 * vincular tarefas antigas nunca "cumpre" um contrato com recompensa.
 */
export async function syncContractStatus(db: Client, ownerId: string, contractId: string, opts: { reward?: boolean } = {}): Promise<void> {
  const c = await db.execute({
    sql: `SELECT c.id, c.title, c.difficulty, c.status,
                 (SELECT COUNT(*) FROM tasks WHERE contract_id = c.id AND owner_id = c.owner_id) AS total,
                 (SELECT COUNT(*) FROM tasks WHERE contract_id = c.id AND owner_id = c.owner_id AND status = 'Concluído') AS done
          FROM contracts c WHERE c.id = ? AND c.owner_id = ?`,
    args: [contractId, ownerId],
  });
  const row = c.rows[0];
  if (!row || String(row.status) === "arquivado") return;
  const total = Number(row.total ?? 0);
  const done = Number(row.done ?? 0);
  const complete = total > 0 && done === total;
  if (!complete) {
    if (String(row.status) === "concluido") {
      await db.execute({ sql: "UPDATE contracts SET status = 'ativo', completed_at = NULL, updated_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [contractId, ownerId] });
    }
    return;
  }
  if (String(row.status) !== "concluido") {
    await db.execute({
      sql: "UPDATE contracts SET status = 'concluido', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND owner_id = ?",
      args: [contractId, ownerId],
    });
  }
  const C = GAMIFICATION_RULES.contract;
  if (!opts.reward || total < C.minTasks) return;
  const dayKey = await todayKeyFor(db, ownerId);
  const today = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM xp_events WHERE owner_id = ? AND source_type = 'contract' AND day_key = ?",
    args: [ownerId, dayKey],
  });
  if (Number(today.rows[0]?.n ?? 0) >= C.maxRewardedPerDay) return;
  const diff = isDifficulty(row.difficulty) ? row.difficulty : "medio";
  const reward = (await getDifficultyRewards(db, ownerId))[diff];
  await award(
    db,
    ownerId,
    { sourceType: "contract", sourceId: contractId, eventType: "completed", xp: reward.contractXp, coins: reward.contractCoins, label: `Contrato cumprido: ${String(row.title)}` },
    dayKey,
  );
}

/* ------------------------------ Laboratório ------------------------------ */

/** Experimento ganhou vida (rascunho → ativo): bônus único por experimento. */
export async function awardExperimentStarted(db: Client, ownerId: string, experimentId: string, title: string): Promise<void> {
  await safely("experimento", async () => {
    const E = GAMIFICATION_RULES.experiment;
    const dayKey = await todayKeyFor(db, ownerId);
    const today = await db.execute({
      sql: "SELECT COUNT(*) AS n FROM xp_events WHERE owner_id = ? AND source_type = 'experiment' AND event_type = 'started' AND day_key = ?",
      args: [ownerId, dayKey],
    });
    if (Number(today.rows[0]?.n ?? 0) >= E.maxStartedPerDay) return;
    await award(db, ownerId, { sourceType: "experiment", sourceId: experimentId, eventType: "started", xp: E.started.xp, coins: E.started.coins, label: `Experimento iniciado: ${title}` }, dayKey);
  });
}

/** Check-in "feito" de hoje/ontem: um por dia por experimento. */
export async function awardExperimentCheckin(db: Client, ownerId: string, experimentId: string, logDate: string, title: string): Promise<void> {
  await safely("experimento", async () => {
    const R = GAMIFICATION_RULES.experiment;
    const dayKey = await todayKeyFor(db, ownerId);
    const diff = daysBetweenKeys(logDate, dayKey);
    if (diff < 0 || diff > R.checkinMaxDaysBack) return;
    await award(
      db,
      ownerId,
      { sourceType: "experiment", sourceId: `${experimentId}:${logDate}`, eventType: "checkin", xp: R.checkin.xp, coins: R.checkin.coins, label: `Registro no laboratório: ${title}` },
      dayKey,
    );
  });
}

/** Elegibilidade da conclusão (pura — testável). */
export function isExperimentConclusionEligible(input: { startDate: string; today: string; logs: number; conclusion: string | null | undefined }): boolean {
  const R = GAMIFICATION_RULES.experiment;
  return (
    daysBetweenKeys(input.startDate, input.today) >= R.concludeMinDays &&
    input.logs >= R.concludeMinLogs &&
    (input.conclusion ?? "").trim().length >= R.concludeMinConclusionChars
  );
}

/** Experimento concluído com conclusão escrita, duração mínima e registros reais. */
export async function awardExperimentConcluded(db: Client, ownerId: string, experimentId: string): Promise<boolean> {
  let granted = false;
  await safely("experimento", async () => {
    const r = await db.execute({
      sql: `SELECT e.title, e.start_date, e.personal_conclusion,
                   (SELECT COUNT(*) FROM personal_experiment_logs l WHERE l.experiment_id = e.id AND l.owner_id = e.owner_id) AS logs
            FROM personal_experiments e WHERE e.id = ? AND e.owner_id = ? AND e.status = 'completed'`,
      args: [experimentId, ownerId],
    });
    const row = r.rows[0];
    if (!row) return;
    const today = await todayKeyFor(db, ownerId);
    if (!isExperimentConclusionEligible({ startDate: String(row.start_date), today, logs: Number(row.logs ?? 0), conclusion: row.personal_conclusion == null ? null : String(row.personal_conclusion) })) return;
    const R = GAMIFICATION_RULES.experiment.concluded;
    granted = await award(db, ownerId, { sourceType: "experiment", sourceId: experimentId, eventType: "concluded", xp: R.xp, coins: R.coins, label: `Experimento concluído: ${String(row.title)}` }, today);
  });
  return granted;
}

/** Hábito cumprido → XP, só para hoje/ontem e só ao bater a meta do dia. */
export async function awardHabitCheckIn(db: Client, ownerId: string, habitId: string, entryDate: string): Promise<void> {
  await safely("hábito", async () => {
    const r = await db.execute({
      sql: `SELECT h.name, h.target_count, h.frequency, e.count FROM habits h
            JOIN habit_entries e ON e.habit_id = h.id AND e.owner_id = h.owner_id
            WHERE h.id = ? AND h.owner_id = ? AND e.entry_date = ?`,
      args: [habitId, ownerId, entryDate],
    });
    const row = r.rows[0] as unknown as { name: string; target_count: number; frequency: string; count: number } | undefined;
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
        label: `Hábito cumprido: ${row.name}`,
      },
      dayKey,
    );

    // Marcos de sequência (só hábitos diários): um bônus por marco, para sempre.
    if (row.frequency !== "daily") return;
    const streak = await habitStreakEndingAt(db, ownerId, habitId, entryDate, Number(row.target_count));
    for (const m of GAMIFICATION_RULES.habitStreakMilestones) {
      if (streak < m.days) continue;
      await award(
        db,
        ownerId,
        { sourceType: "habit_streak", sourceId: `${habitId}:${m.days}`, eventType: "milestone", xp: m.xp, coins: m.coins, label: `Sequência de ${m.days} dias: ${row.name}` },
        dayKey,
      );
    }
  });
}

/** Dias consecutivos (terminando em `endDate`) em que o hábito bateu a meta. */
export async function habitStreakEndingAt(db: Client, ownerId: string, habitId: string, endDate: string, target: number): Promise<number> {
  const r = await db.execute({
    sql: "SELECT entry_date FROM habit_entries WHERE habit_id = ? AND owner_id = ? AND entry_date <= ? AND count >= ? ORDER BY entry_date DESC LIMIT 400",
    args: [habitId, ownerId, endDate, Math.max(1, target)],
  });
  let streak = 0;
  let cursor = endDate;
  for (const row of r.rows) {
    if (String(row.entry_date) !== cursor) break;
    streak++;
    cursor = new Date(Date.parse(`${cursor}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  }
  return streak;
}

/**
 * Administração da Vida resolvida → XP leve, uma vez por vencimento coberto.
 * Sem prazo, ou com prazo distante (adiantar ciclos), não rende nada.
 */
export async function awardLifeAdminResolved(
  db: Client,
  ownerId: string,
  item: { id: string; kind: string; title: string; coveredDueDate: string | null },
): Promise<void> {
  if (!item.coveredDueDate) return;
  await safely("administração", async () => {
    const dayKey = await todayKeyFor(db, ownerId);
    const L = GAMIFICATION_RULES.lifeAdmin;
    if (daysBetweenKeys(dayKey, item.coveredDueDate!) > L.maxDaysAhead) return;
    const rule = L.byKind[item.kind] ?? L.byKind.vencimento;
    await award(
      db,
      ownerId,
      { sourceType: "life_admin", sourceId: `${item.id}:${item.coveredDueDate}`, eventType: "resolved", xp: rule.xp, coins: rule.coins, label: `Resolvido: ${item.title}` },
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
    const baseXp = blocks * F.xpPerBlock;
    // Poção de Foco ativa: +% só no XP (moedas nunca — evita ciclo item → moedas).
    const boost = await focusBoostAt(db, ownerId, new Date());
    await award(
      db,
      ownerId,
      {
        sourceType: "focus",
        sourceId: entryId,
        eventType: "session",
        xp: boost ? applyPct(baseXp, boost.pct) : baseXp,
        coins: blocks * F.coinsPerBlock,
        label: `Foco: ${blocks * F.blockMinutes} min${boost ? ` (+${boost.pct}% Poção de Foco)` : ""}`,
        projectId,
        baseXp: boost ? baseXp : null,
        multiplier: boost ? (100 + boost.pct) / 100 : null,
      },
      dayKey,
    );
  });
}

/** Projeto concluído → recompensa grande, uma única vez. */
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
        label: `Projeto concluído: ${project.name}`,
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

/**
 * Concede a recompensa de toda conquista oficial já desbloqueada que ainda
 * não foi paga (inclui conquistas anteriores a esta regra). Idempotente:
 * a chave é achievement:<id>, então rodar de novo não paga duas vezes.
 */
export async function awardUnlockedAchievements(db: Client, ownerId: string): Promise<void> {
  await safely("conquista", async () => {
    const r = await db.execute({
      sql: `SELECT ua.achievement_id, a.title, a.tier FROM user_achievements ua
            JOIN achievements a ON a.id = ua.achievement_id
            WHERE ua.owner_id = ? AND NOT EXISTS (
              SELECT 1 FROM xp_events x WHERE x.owner_id = ua.owner_id AND x.source_type = 'achievement' AND x.source_id = ua.achievement_id
            )`,
      args: [ownerId],
    });
    if (r.rows.length === 0) return;
    const dayKey = await todayKeyFor(db, ownerId);
    for (const row of r.rows) {
      const rule = GAMIFICATION_RULES.achievementByTier[String(row.tier)] ?? GAMIFICATION_RULES.achievementByTier.bronze;
      await award(
        db,
        ownerId,
        { sourceType: "achievement", sourceId: String(row.achievement_id), eventType: "unlocked", xp: rule.xp, coins: rule.coins, label: `Conquista: ${row.title}` },
        dayKey,
      );
    }
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

/** XP já conquistado e XP base ainda disponível por projeto. */
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
  const pr = await getPriorityRewards(db, ownerId);
  const R = Object.fromEntries(Object.entries(pr).map(([k, v]) => [k, v.xp])) as Record<string, number>;
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
    habitStreakMilestones: GAMIFICATION_RULES.habitStreakMilestones,
    lifeAdmin: GAMIFICATION_RULES.lifeAdmin.byKind,
    achievementByTier: GAMIFICATION_RULES.achievementByTier,
    difficulty: { defaults: GAMIFICATION_RULES.difficulty.defaults, limits: GAMIFICATION_RULES.difficulty.limits },
    priorityLimits: GAMIFICATION_RULES.task.priorityLimits,
    contract: GAMIFICATION_RULES.contract,
    experiment: GAMIFICATION_RULES.experiment,
  };
}

/** Resumo real da carteira (loja): ganho e gasto nos últimos 30 dias e no total. */
export async function getWalletSummary(db: Client, ownerId: string) {
  const r = await db.execute({
    sql: `SELECT
            -- Estorno de resgate (event_type 'refund') abate o gasto em vez de contar como ganho.
            COALESCE(SUM(CASE WHEN amount > 0 AND event_type != 'refund' THEN amount END), 0) AS earned,
            COALESCE(-SUM(CASE WHEN amount < 0 OR event_type = 'refund' THEN amount END), 0) AS spent,
            COALESCE(SUM(CASE WHEN amount > 0 AND event_type != 'refund' AND created_at >= datetime('now', '-30 days') THEN amount END), 0) AS earned30,
            COALESCE(-SUM(CASE WHEN (amount < 0 OR event_type = 'refund') AND created_at >= datetime('now', '-30 days') THEN amount END), 0) AS spent30
          FROM coin_ledger WHERE owner_id = ?`,
    args: [ownerId],
  });
  const row = r.rows[0] ?? {};
  return {
    balance: await coinBalance(db, ownerId),
    earned: Number(row.earned ?? 0),
    spent: Number(row.spent ?? 0),
    earned30: Number(row.earned30 ?? 0),
    spent30: Number(row.spent30 ?? 0),
  };
}
