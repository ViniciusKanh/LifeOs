import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { GAMIFICATION_RULES } from "../config/gamification.js";
import { campaignGamificationConfig as CC, type CampaignTerm } from "../config/campaignGamification.js";
import { award, getDifficultyRewards, isDifficulty, todayKeyFor } from "./gamificationService.js";
import { applyBonus, calculateCampaignProgress, habitAdherence, streakBonus, suggestedCompletion, trailStates, weeklyStreak, type TrailState } from "./campaignEngine.js";
import { evaluateAchievements } from "./achievementsService.js";

/**
 * Forja de Campanhas — camada de orquestração acima de Projetos.
 * Referencia metas, projetos, tarefas e hábitos do PRÓPRIO usuário (toda
 * query filtra owner_id). Missões de uma campanha = tarefas ligadas
 * diretamente + tarefas dos projetos ligados (sem duplicar nada).
 */

export type CampaignStatus = "planned" | "active" | "paused" | "completed" | "archived";

export class CampaignError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export interface MilestoneView {
  id: string;
  title: string;
  description: string | null;
  position: number;
  dueDate: string | null;
  status: "pending" | "completed";
  isMajor: boolean;
  dependencyId: string | null;
  xpReward: number;
  coinReward: number;
  completedAt: string | null;
  state: TrailState;
}

export interface CampaignView {
  id: string;
  title: string;
  description: string | null;
  status: CampaignStatus;
  goalId: string | null;
  goalTitle: string | null;
  lifeArea: string | null;
  term: CampaignTerm;
  startDate: string | null;
  endDate: string | null;
  banner: string | null;
  icon: string | null;
  themeColor: string | null;
  priority: "Baixa" | "Média" | "Alta";
  streakEnabled: boolean;
  completionReward: { xp: number; coins: number };
  completedAt: string | null;
  createdAt: string;
  counts: { projects: number; missions: number; missionsDone: number; habits: number; milestones: number; milestonesDone: number };
  progress: ReturnType<typeof calculateCampaignProgress>;
  readyToComplete: boolean;
  /** XP/moedas JÁ conquistados (ledger) — tarefas ligadas + marcos + conclusão. */
  earned: { xp: number; coins: number };
  /** Potencial (previsto, ainda não ganho): missões abertas + marcos pendentes + conclusão. */
  potential: { xp: number; coins: number };
  streak: { weeks: number; xpPct: number; coinsPct: number; nextTier: { weeks: number; xpPct: number; coinsPct: number } | null };
  milestones: MilestoneView[];
}

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? null : String(v));
const n = (v: unknown) => Number(v ?? 0);

function placeholders(count: number) {
  return Array.from({ length: count }, () => "?").join(", ");
}

/** Garante que todos os ids pertencem ao usuário (nunca confia no frontend). */
async function assertOwned(db: Client, ownerId: string, table: "projects" | "tasks" | "habits" | "goals", ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return;
  const r = await db.execute({ sql: `SELECT id FROM ${table} WHERE owner_id = ? AND id IN (${placeholders(unique.length)})`, args: [ownerId, ...unique] });
  if (r.rows.length !== unique.length) throw new CampaignError("Há itens inválidos ou de outro usuário na campanha.");
}

async function logEvent(db: Client, ownerId: string, campaignId: string, kind: string, label: string, refId: string | null = null) {
  await db.execute({
    sql: "INSERT INTO campaign_events (id, owner_id, campaign_id, kind, ref_id, label) VALUES (?, ?, ?, ?, ?, ?)",
    args: [nanoid(), ownerId, campaignId, kind, refId, label],
  });
}

/* ------------------------------- Leitura (batch) ------------------------------- */

/** Carrega e calcula todas as campanhas do usuário em poucas queries (sem N+1). */
export async function loadCampaigns(db: Client, ownerId: string, onlyId?: string): Promise<CampaignView[]> {
  const filter = onlyId ? " AND c.id = ?" : "";
  const fargs = onlyId ? [ownerId, onlyId] : [ownerId];
  const [campaigns, tasks, milestones, habits, projects, rewards, today] = await Promise.all([
    db.execute({ sql: `SELECT c.*, g.title AS goal_title FROM campaigns c LEFT JOIN goals g ON g.id = c.goal_id AND g.owner_id = c.owner_id WHERE c.owner_id = ?${filter}`, args: fargs }),
    db.execute({
      sql: `SELECT ct.campaign_id, t.id, t.status, t.priority, t.difficulty, t.completed_at FROM campaign_tasks ct
              JOIN tasks t ON t.id = ct.task_id AND t.owner_id = ct.owner_id WHERE ct.owner_id = ?
            UNION
            SELECT cp.campaign_id, t.id, t.status, t.priority, t.difficulty, t.completed_at FROM campaign_projects cp
              JOIN tasks t ON t.project_id = cp.project_id AND t.owner_id = cp.owner_id WHERE cp.owner_id = ?`,
      args: [ownerId, ownerId],
    }),
    db.execute({ sql: "SELECT * FROM campaign_milestones WHERE owner_id = ? ORDER BY position, COALESCE(due_date, '9999')", args: [ownerId] }),
    db.execute({
      sql: `SELECT ch.campaign_id, h.id, h.frequency, h.target_count, substr(h.created_at, 1, 10) AS created_day FROM campaign_habits ch
            JOIN habits h ON h.id = ch.habit_id AND h.owner_id = ch.owner_id WHERE ch.owner_id = ? AND h.archived_at IS NULL`,
      args: [ownerId],
    }),
    db.execute({ sql: "SELECT campaign_id, COUNT(*) AS n FROM campaign_projects WHERE owner_id = ? GROUP BY campaign_id", args: [ownerId] }),
    getDifficultyRewards(db, ownerId),
    todayKeyFor(db, ownerId),
  ]);

  const linkedHabitIds = [...new Set(habits.rows.map((h) => String(h.id)))];
  const entries = linkedHabitIds.length
    ? await db.execute({ sql: `SELECT habit_id, entry_date, count FROM habit_entries WHERE owner_id = ? AND habit_id IN (${placeholders(linkedHabitIds.length)})`, args: [ownerId, ...linkedHabitIds] })
    : { rows: [] as Row[] };
  const taskIds = [...new Set(tasks.rows.map((t) => String(t.id)))];
  const ids = campaigns.rows.map((c) => String(c.id));
  // XP/moedas realmente conquistados: eventos de campanha + tarefas ligadas.
  const [xpRows, coinRows] = await Promise.all([
    db.execute({
      sql: `SELECT source_type, source_id, xp FROM xp_events WHERE owner_id = ? AND (source_type = 'campaign' OR (source_type = 'task' AND source_id IN (${taskIds.length ? placeholders(taskIds.length) : "''"})))`,
      args: [ownerId, ...taskIds],
    }),
    db.execute({
      sql: `SELECT source_type, source_id, amount FROM coin_ledger WHERE owner_id = ? AND amount > 0 AND (source_type = 'campaign' OR (source_type = 'task' AND source_id IN (${taskIds.length ? placeholders(taskIds.length) : "''"})))`,
      args: [ownerId, ...taskIds],
    }),
  ]);
  const sumBy = (rows: Row[], field: string) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(`${r.source_type}:${r.source_id}`, (m.get(`${r.source_type}:${r.source_id}`) ?? 0) + n(r[field]));
    return m;
  };
  const xpMap = sumBy(xpRows.rows as unknown as Row[], "xp");
  const coinMap = sumBy(coinRows.rows as unknown as Row[], "amount");
  const projectCount = new Map(projects.rows.map((r) => [String(r.campaign_id), n(r.n)]));

  const taskXp = (t: Row) => {
    const d = isDifficulty(t.difficulty) ? rewards[t.difficulty] : null;
    const R = GAMIFICATION_RULES.task;
    return {
      xp: d?.taskXp ?? R.xpByPriority[String(t.priority)] ?? R.xpByPriority["Média"],
      coins: d?.taskCoins ?? R.coinsByPriority[String(t.priority)] ?? R.coinsByPriority["Média"],
    };
  };

  return ids.map((id) => {
    const c = campaigns.rows.find((r) => String(r.id) === id) as unknown as Row;
    const ctasks = tasks.rows.filter((t) => String(t.campaign_id) === id) as unknown as Row[];
    const seen = new Set<string>();
    const uniqueTasks = ctasks.filter((t) => (seen.has(String(t.id)) ? false : (seen.add(String(t.id)), true)));
    const doneTasks = uniqueTasks.filter((t) => String(t.status) === "Concluído");
    const ms = (milestones.rows as unknown as Row[]).filter((m) => String(m.campaign_id) === id);
    const trail = trailStates(
      ms.map((m) => ({
        id: String(m.id),
        title: String(m.title),
        description: s(m.description),
        position: n(m.position),
        dueDate: s(m.due_date),
        status: String(m.status) as "pending" | "completed",
        isMajor: n(m.is_major) === 1,
        dependencyId: s(m.dependency_milestone_id),
        xpReward: n(m.xp_reward),
        coinReward: n(m.coin_reward),
        completedAt: s(m.completed_at),
      })),
    );
    const from = (s(c.start_date) ?? String(c.created_at)).slice(0, 10);
    const chabits = (habits.rows as unknown as Row[]).filter((h) => String(h.campaign_id) === id);
    let expected = 0;
    let met = 0;
    const habitDays: string[] = [];
    for (const h of chabits) {
      const hEntries = (entries.rows as unknown as Row[])
        .filter((e) => String(e.habit_id) === String(h.id))
        .map((e) => ({ date: String(e.entry_date), count: n(e.count) }));
      const windowStart = String(h.created_day) > from ? String(h.created_day) : from;
      const a = habitAdherence({ frequency: String(h.frequency), targetCount: n(h.target_count), from: windowStart, today, entries: hEntries });
      expected += a.expected;
      met += a.met;
      habitDays.push(...hEntries.filter((e) => e.date >= from).map((e) => e.date));
    }
    const progress = calculateCampaignProgress({
      missions: { total: uniqueTasks.length, done: doneTasks.length },
      milestones: { total: trail.length, done: trail.filter((m) => m.state === "completed").length },
      contracts: { expected, met },
    });

    // Sequência: missões concluídas, check-ins dos hábitos ligados e marcos concluídos.
    const activity = [
      ...doneTasks.map((t) => s(t.completed_at)?.slice(0, 10)).filter((d): d is string => !!d && d >= from),
      ...habitDays,
      ...trail.map((m) => m.completedAt?.slice(0, 10)).filter((d): d is string => !!d),
    ];
    const streakEnabled = n(c.streak_enabled) === 1;
    const weeks = streakEnabled ? weeklyStreak(activity, today) : 0;
    const bonus = streakBonus(weeks);

    let earnedXp = xpMap.get(`campaign:${id}`) ?? 0;
    let earnedCoins = coinMap.get(`campaign:${id}`) ?? 0;
    for (const m of trail) {
      earnedXp += xpMap.get(`campaign:${id}:${m.id}`) ?? 0;
      earnedCoins += coinMap.get(`campaign:${id}:${m.id}`) ?? 0;
    }
    for (const t of uniqueTasks) {
      earnedXp += xpMap.get(`task:${t.id}`) ?? 0;
      earnedCoins += coinMap.get(`task:${t.id}`) ?? 0;
    }
    const openTasks = uniqueTasks.filter((t) => String(t.status) !== "Concluído");
    const potential = { xp: 0, coins: 0 };
    for (const t of openTasks) {
      const r = taskXp(t);
      potential.xp += r.xp;
      potential.coins += r.coins;
    }
    for (const m of trail.filter((x) => x.state !== "completed")) {
      potential.xp += m.xpReward;
      potential.coins += m.coinReward;
    }
    const status = String(c.status) as CampaignStatus;
    if (status !== "completed") {
      potential.xp += n(c.completion_xp);
      potential.coins += n(c.completion_coins);
    }
    const hasItems = uniqueTasks.length + trail.length > 0;
    const allDone = openTasks.length === 0 && trail.every((m) => m.state === "completed");

    return {
      id,
      title: String(c.title),
      description: s(c.description),
      status,
      goalId: s(c.goal_id),
      goalTitle: s(c.goal_title),
      lifeArea: s(c.life_area),
      term: String(c.term) as CampaignTerm,
      startDate: s(c.start_date),
      endDate: s(c.end_date),
      banner: s(c.banner),
      icon: s(c.icon),
      themeColor: s(c.theme_color),
      priority: String(c.priority) as CampaignView["priority"],
      streakEnabled,
      completionReward: { xp: n(c.completion_xp), coins: n(c.completion_coins) },
      completedAt: s(c.completed_at),
      createdAt: String(c.created_at),
      counts: {
        projects: projectCount.get(id) ?? 0,
        missions: uniqueTasks.length,
        missionsDone: doneTasks.length,
        habits: chabits.length,
        milestones: trail.length,
        milestonesDone: trail.filter((m) => m.state === "completed").length,
      },
      progress,
      readyToComplete: (status === "active" || status === "paused") && hasItems && allDone,
      earned: { xp: earnedXp, coins: earnedCoins },
      potential,
      streak: { weeks, xpPct: bonus.xpPct, coinsPct: bonus.coinsPct, nextTier: bonus.nextTier },
      milestones: trail,
    };
  });
}

export async function getCampaign(db: Client, ownerId: string, id: string): Promise<CampaignView> {
  const [c] = await loadCampaigns(db, ownerId, id);
  if (!c) throw new CampaignError("Campanha não encontrada.", 404);
  return c;
}

/** Itens ligados (para a tela de detalhe e o wizard de edição). */
export async function getCampaignLinks(db: Client, ownerId: string, id: string) {
  await getCampaign(db, ownerId, id);
  const [projects, tasks, habits, events] = await Promise.all([
    db.execute({
      sql: `SELECT p.id, p.name, p.kind, p.status FROM campaign_projects cp JOIN projects p ON p.id = cp.project_id AND p.owner_id = cp.owner_id
            WHERE cp.campaign_id = ? AND cp.owner_id = ? ORDER BY p.name`,
      args: [id, ownerId],
    }),
    db.execute({
      sql: `SELECT t.*, CASE WHEN ct.task_id IS NULL THEN 0 ELSE 1 END AS direct_link FROM tasks t
            LEFT JOIN campaign_tasks ct ON ct.task_id = t.id AND ct.campaign_id = ? AND ct.owner_id = t.owner_id
            WHERE t.owner_id = ? AND (ct.task_id IS NOT NULL OR t.project_id IN (SELECT project_id FROM campaign_projects WHERE campaign_id = ? AND owner_id = ?))
            ORDER BY CASE WHEN t.status = 'Concluído' THEN 1 ELSE 0 END, COALESCE(t.due_date, '9999')`,
      args: [id, ownerId, id, ownerId],
    }),
    db.execute({
      sql: `SELECT h.id, h.name, h.icon, h.frequency, h.target_count FROM campaign_habits ch JOIN habits h ON h.id = ch.habit_id AND h.owner_id = ch.owner_id
            WHERE ch.campaign_id = ? AND ch.owner_id = ? ORDER BY h.name`,
      args: [id, ownerId],
    }),
    db.execute({ sql: "SELECT id, kind, label, created_at FROM campaign_events WHERE campaign_id = ? AND owner_id = ? ORDER BY created_at DESC LIMIT 40", args: [id, ownerId] }),
  ]);
  return { projects: projects.rows, tasks: tasks.rows, habits: habits.rows, events: events.rows };
}

/* --------------------------------- Escrita --------------------------------- */

export interface MilestoneInput {
  title: string;
  description?: string | null;
  dueDate?: string | null;
  isMajor?: boolean;
  xpReward?: number;
  coinReward?: number;
  /** Índice (no array enviado) do marco de que este depende. */
  dependsOnIndex?: number | null;
}

export interface CampaignInput {
  title: string;
  description?: string | null;
  goalId?: string | null;
  lifeArea?: string | null;
  term?: CampaignTerm;
  status?: "planned" | "active";
  startDate?: string | null;
  endDate?: string | null;
  banner?: string | null;
  icon?: string | null;
  themeColor?: string | null;
  priority?: "Baixa" | "Média" | "Alta";
  streakEnabled?: boolean;
  completionXp?: number;
  completionCoins?: number;
  projectIds?: string[];
  taskIds?: string[];
  habitIds?: string[];
  newTasks?: Array<{ title: string; description?: string | null; priority?: "Baixa" | "Média" | "Alta"; difficulty?: string | null; dueDate?: string | null; projectId?: string | null }>;
  milestones?: MilestoneInput[];
}

const clamp = (v: number | undefined, fallback: number, max: number) => Math.min(max, Math.max(0, Math.round(Number.isFinite(v) ? (v as number) : fallback)));

function milestoneReward(m: MilestoneInput) {
  const sug = m.isMajor ? CC.milestone.suggested.major : CC.milestone.suggested.normal;
  return { xp: clamp(m.xpReward, sug.xp, CC.milestone.limits.xp), coins: clamp(m.coinReward, sug.coins, CC.milestone.limits.coins) };
}

export async function createCampaign(db: Client, ownerId: string, input: CampaignInput): Promise<CampaignView> {
  await Promise.all([
    assertOwned(db, ownerId, "projects", input.projectIds ?? []),
    assertOwned(db, ownerId, "tasks", input.taskIds ?? []),
    assertOwned(db, ownerId, "habits", input.habitIds ?? []),
    assertOwned(db, ownerId, "goals", input.goalId ? [input.goalId] : []),
    assertOwned(db, ownerId, "projects", (input.newTasks ?? []).map((t) => t.projectId ?? "").filter(Boolean)),
  ]);
  const id = nanoid();
  const term = input.term ?? "medio";
  const milestones = (input.milestones ?? []).slice(0, 30);
  const sug = suggestedCompletion(term, milestones.length);
  const status = input.status ?? "active";
  const msIds = milestones.map(() => nanoid());
  const stmts: Array<{ sql: string; args: Array<string | number | null> }> = [
    {
      sql: `INSERT INTO campaigns (id, owner_id, title, description, status, goal_id, life_area, term, start_date, end_date, banner, icon, theme_color, priority, streak_enabled, completion_xp, completion_coins)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id, ownerId, input.title.trim(), input.description ?? null, status, input.goalId ?? null, input.lifeArea ?? null, term,
        input.startDate ?? null, input.endDate ?? null, input.banner ?? null, input.icon ?? null, input.themeColor ?? null,
        input.priority ?? "Média", input.streakEnabled === false ? 0 : 1,
        clamp(input.completionXp, sug.xp, CC.completion.limits.xp), clamp(input.completionCoins, sug.coins, CC.completion.limits.coins),
      ],
    },
    ...[...new Set(input.projectIds ?? [])].map((p) => ({ sql: "INSERT INTO campaign_projects (campaign_id, project_id, owner_id) VALUES (?, ?, ?)", args: [id, p, ownerId] })),
    ...[...new Set(input.taskIds ?? [])].map((t) => ({ sql: "INSERT INTO campaign_tasks (campaign_id, task_id, owner_id) VALUES (?, ?, ?)", args: [id, t, ownerId] })),
    ...[...new Set(input.habitIds ?? [])].map((h) => ({ sql: "INSERT INTO campaign_habits (campaign_id, habit_id, owner_id) VALUES (?, ?, ?)", args: [id, h, ownerId] })),
  ];
  for (const t of (input.newTasks ?? []).slice(0, 40)) {
    const tid = nanoid();
    stmts.push({
      sql: "INSERT INTO tasks (id, owner_id, project_id, title, description, status, priority, difficulty, due_date) VALUES (?, ?, ?, ?, ?, 'A Fazer', ?, ?, ?)",
      args: [tid, ownerId, t.projectId ?? null, t.title.trim(), t.description ?? null, t.priority ?? "Média", isDifficulty(t.difficulty) ? t.difficulty : null, t.dueDate ?? null],
    });
    stmts.push({ sql: "INSERT INTO campaign_tasks (campaign_id, task_id, owner_id) VALUES (?, ?, ?)", args: [id, tid, ownerId] });
  }
  milestones.forEach((m, i) => {
    const r = milestoneReward(m);
    const dep = m.dependsOnIndex != null && m.dependsOnIndex >= 0 && m.dependsOnIndex < i ? msIds[m.dependsOnIndex] : null;
    stmts.push({
      sql: `INSERT INTO campaign_milestones (id, campaign_id, owner_id, title, description, position, due_date, is_major, dependency_milestone_id, xp_reward, coin_reward)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [msIds[i], id, ownerId, m.title.trim(), m.description ?? null, i, m.dueDate ?? null, m.isMajor ? 1 : 0, dep, r.xp, r.coins],
    });
  });
  stmts.push({ sql: "INSERT INTO campaign_events (id, owner_id, campaign_id, kind, ref_id, label) VALUES (?, ?, ?, 'created', NULL, ?)", args: [nanoid(), ownerId, id, `Campanha forjada: ${input.title.trim()}`] });
  await db.batch(stmts, "write");
  return getCampaign(db, ownerId, id);
}

export async function updateCampaign(db: Client, ownerId: string, id: string, input: Partial<Omit<CampaignInput, "projectIds" | "taskIds" | "habitIds" | "newTasks" | "milestones" | "status">>) {
  const current = await getCampaign(db, ownerId, id);
  if (input.goalId) await assertOwned(db, ownerId, "goals", [input.goalId]);
  const map: Record<string, string> = {
    title: "title", description: "description", goalId: "goal_id", lifeArea: "life_area", term: "term", startDate: "start_date", endDate: "end_date",
    banner: "banner", icon: "icon", themeColor: "theme_color", priority: "priority",
  };
  const sets: string[] = [];
  const args: Array<string | number | null> = [];
  for (const [k, col] of Object.entries(map)) {
    if (k in input) {
      sets.push(`${col} = ?`);
      args.push(((input as Record<string, unknown>)[k] as string | null | undefined) ?? null);
    }
  }
  if ("streakEnabled" in input) {
    sets.push("streak_enabled = ?");
    args.push(input.streakEnabled ? 1 : 0);
  }
  // Recompensa de conclusão só pode mudar antes de ser paga (e sempre dentro do limite).
  if (current.status !== "completed") {
    if ("completionXp" in input) {
      sets.push("completion_xp = ?");
      args.push(clamp(input.completionXp, current.completionReward.xp, CC.completion.limits.xp));
    }
    if ("completionCoins" in input) {
      sets.push("completion_coins = ?");
      args.push(clamp(input.completionCoins, current.completionReward.coins, CC.completion.limits.coins));
    }
  }
  if (sets.length) {
    sets.push("updated_at = datetime('now')");
    await db.execute({ sql: `UPDATE campaigns SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`, args: [...args, id, ownerId] });
  }
  return getCampaign(db, ownerId, id);
}

const TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  planned: ["active", "archived"],
  active: ["paused", "archived"],
  paused: ["active", "archived"],
  completed: ["archived"],
  archived: ["planned"],
};
const EVENT_FOR: Partial<Record<CampaignStatus, [string, string]>> = {
  active: ["started", "Campanha iniciada"],
  paused: ["paused", "Campanha pausada"],
  archived: ["archived", "Campanha arquivada"],
};

/** Pausar/retomar/iniciar/arquivar. "completed" só via concluirCampanha. */
export async function setCampaignStatus(db: Client, ownerId: string, id: string, next: CampaignStatus) {
  const c = await getCampaign(db, ownerId, id);
  if (!TRANSITIONS[c.status].includes(next)) throw new CampaignError(`Não é possível mudar de "${c.status}" para "${next}".`);
  await db.execute({ sql: "UPDATE campaigns SET status = ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [next, id, ownerId] });
  const ev = c.status === "paused" && next === "active" ? (["resumed", "Campanha retomada"] as [string, string]) : EVENT_FOR[next];
  if (ev) await logEvent(db, ownerId, id, ev[0], `${ev[1]}: ${c.title}`);
  return getCampaign(db, ownerId, id);
}

export async function deleteCampaign(db: Client, ownerId: string, id: string) {
  await getCampaign(db, ownerId, id);
  // Só a campanha e seus vínculos/marcos somem; projetos, tarefas, hábitos e XP continuam.
  await db.execute({ sql: "DELETE FROM campaigns WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
}

export async function setLinks(db: Client, ownerId: string, id: string, kind: "projects" | "tasks" | "habits", ids: string[], linked: boolean) {
  const c = await getCampaign(db, ownerId, id);
  if (c.status === "archived" || c.status === "completed") throw new CampaignError("Reative a campanha antes de alterar os vínculos.");
  await assertOwned(db, ownerId, kind, ids);
  const table = { projects: ["campaign_projects", "project_id"], tasks: ["campaign_tasks", "task_id"], habits: ["campaign_habits", "habit_id"] }[kind];
  await db.batch(
    [...new Set(ids)].map((x) =>
      linked
        ? { sql: `INSERT INTO ${table[0]} (campaign_id, ${table[1]}, owner_id) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`, args: [id, x, ownerId] }
        : { sql: `DELETE FROM ${table[0]} WHERE campaign_id = ? AND ${table[1]} = ? AND owner_id = ?`, args: [id, x, ownerId] },
    ),
    "write",
  );
  return getCampaign(db, ownerId, id);
}

/* --------------------------------- Marcos --------------------------------- */

export async function addMilestone(db: Client, ownerId: string, campaignId: string, m: MilestoneInput & { dependencyId?: string | null }) {
  const c = await getCampaign(db, ownerId, campaignId);
  if (c.milestones.length >= 30) throw new CampaignError("Limite de 30 marcos por campanha.");
  if (m.dependencyId && !c.milestones.some((x) => x.id === m.dependencyId)) throw new CampaignError("Marco de dependência inválido.");
  const r = milestoneReward(m);
  await db.execute({
    sql: `INSERT INTO campaign_milestones (id, campaign_id, owner_id, title, description, position, due_date, is_major, dependency_milestone_id, xp_reward, coin_reward)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [nanoid(), campaignId, ownerId, m.title.trim(), m.description ?? null, c.milestones.length, m.dueDate ?? null, m.isMajor ? 1 : 0, m.dependencyId ?? null, r.xp, r.coins],
  });
  return getCampaign(db, ownerId, campaignId);
}

export async function updateMilestone(
  db: Client,
  ownerId: string,
  campaignId: string,
  milestoneId: string,
  m: Partial<MilestoneInput> & { dependencyId?: string | null },
) {
  const c = await getCampaign(db, ownerId, campaignId);
  const cur = c.milestones.find((x) => x.id === milestoneId);
  if (!cur) throw new CampaignError("Marco não encontrado.", 404);
  if (m.dependencyId && (m.dependencyId === milestoneId || !c.milestones.some((x) => x.id === m.dependencyId))) throw new CampaignError("Marco de dependência inválido.");
  const sets: string[] = [];
  const args: Array<string | number | null> = [];
  const put = (col: string, v: string | number | null) => (sets.push(`${col} = ?`), args.push(v));
  if (m.title !== undefined) put("title", m.title.trim());
  if (m.description !== undefined) put("description", m.description ?? null);
  if (m.dueDate !== undefined) put("due_date", m.dueDate ?? null);
  if (m.isMajor !== undefined) put("is_major", m.isMajor ? 1 : 0);
  if (m.dependencyId !== undefined) put("dependency_milestone_id", m.dependencyId ?? null);
  // Recompensa só muda enquanto o marco não foi concluído (já paga não muda).
  if (cur.status !== "completed") {
    if (m.xpReward !== undefined) put("xp_reward", clamp(m.xpReward, cur.xpReward, CC.milestone.limits.xp));
    if (m.coinReward !== undefined) put("coin_reward", clamp(m.coinReward, cur.coinReward, CC.milestone.limits.coins));
  }
  if (sets.length) await db.execute({ sql: `UPDATE campaign_milestones SET ${sets.join(", ")} WHERE id = ? AND campaign_id = ? AND owner_id = ?`, args: [...args, milestoneId, campaignId, ownerId] });
  return getCampaign(db, ownerId, campaignId);
}

export async function deleteMilestone(db: Client, ownerId: string, campaignId: string, milestoneId: string) {
  await getCampaign(db, ownerId, campaignId);
  await db.execute({ sql: "DELETE FROM campaign_milestones WHERE id = ? AND campaign_id = ? AND owner_id = ?", args: [milestoneId, campaignId, ownerId] });
  return getCampaign(db, ownerId, campaignId);
}

/** Reordena pelos ids enviados (todos precisam ser marcos desta campanha). */
export async function reorderMilestones(db: Client, ownerId: string, campaignId: string, orderedIds: string[]) {
  const c = await getCampaign(db, ownerId, campaignId);
  const own = new Set(c.milestones.map((m) => m.id));
  if (orderedIds.length !== own.size || orderedIds.some((x) => !own.has(x))) throw new CampaignError("Ordem de marcos inválida.");
  await db.batch(
    orderedIds.map((mid, i) => ({ sql: "UPDATE campaign_milestones SET position = ? WHERE id = ? AND campaign_id = ? AND owner_id = ?", args: [i, mid, campaignId, ownerId] })),
    "write",
  );
  return getCampaign(db, ownerId, campaignId);
}

/**
 * Conclui (ou reabre) um marco. A recompensa é paga UMA vez (chave única
 * no ledger), só em campanha ativa e respeitando os tetos diário e por
 * campanha; o bônus de sequência vigente é aplicado e registrado.
 */
export async function setMilestoneDone(db: Client, ownerId: string, campaignId: string, milestoneId: string, done: boolean) {
  const c = await getCampaign(db, ownerId, campaignId);
  const m = c.milestones.find((x) => x.id === milestoneId);
  if (!m) throw new CampaignError("Marco não encontrado.", 404);
  if (c.status === "archived" || c.status === "completed") throw new CampaignError("Esta campanha não aceita mais alterações.");
  if (done && m.state === "blocked") throw new CampaignError("Conclua antes o marco de que este depende.");
  if (done === (m.status === "completed")) return { campaign: c, rewarded: false };

  // UPDATE condicional: dois cliques simultâneos não concluem duas vezes.
  const upd = await db.execute({
    sql: `UPDATE campaign_milestones SET status = ?, completed_at = ${done ? "datetime('now')" : "NULL"}
          WHERE id = ? AND campaign_id = ? AND owner_id = ? AND status = ?`,
    args: [done ? "completed" : "pending", milestoneId, campaignId, ownerId, done ? "pending" : "completed"],
  });
  if (upd.rowsAffected === 0 || !done) return { campaign: await getCampaign(db, ownerId, campaignId), rewarded: false };
  await logEvent(db, ownerId, campaignId, "milestone", `Marco concluído: ${m.title}`, milestoneId);

  let rewarded = false;
  if (c.status === "active" && (m.xpReward > 0 || m.coinReward > 0)) {
    const dayKey = await todayKeyFor(db, ownerId);
    const [today, perCampaign] = await Promise.all([
      db.execute({ sql: "SELECT COUNT(*) AS n FROM xp_events WHERE owner_id = ? AND source_type = 'campaign' AND event_type = 'milestone' AND day_key = ?", args: [ownerId, dayKey] }),
      db.execute({ sql: "SELECT COUNT(*) AS n FROM xp_events WHERE owner_id = ? AND source_type = 'campaign' AND event_type = 'milestone' AND source_id LIKE ?", args: [ownerId, `${campaignId}:%`] }),
    ]);
    if (n(today.rows[0]?.n) < CC.milestone.maxRewardedPerDay && n(perCampaign.rows[0]?.n) < CC.milestone.maxRewardedPerCampaign) {
      const final = applyBonus({ xp: m.xpReward, coins: m.coinReward }, c.streak);
      rewarded = await award(
        db,
        ownerId,
        {
          sourceType: "campaign",
          sourceId: `${campaignId}:${milestoneId}`,
          eventType: "milestone",
          xp: final.xp,
          coins: final.coins,
          baseXp: m.xpReward,
          multiplier: final.multiplier,
          label: `Marco da campanha: ${m.title}`,
        },
        dayKey,
      );
    }
  }
  return { campaign: await getCampaign(db, ownerId, campaignId), rewarded };
}

/* -------------------------------- Conclusão -------------------------------- */

/**
 * Conclusão confirmada pelo usuário: exige todas as missões e marcos
 * concluídos. Status, data e recompensa são idempotentes (UPDATE
 * condicional + chave única no ledger). Registra Timeline e verifica
 * conquistas.
 */
export async function completeCampaign(db: Client, ownerId: string, id: string) {
  const c = await getCampaign(db, ownerId, id);
  if (c.status === "completed") return { campaign: c, reward: null as null | { xp: number; coins: number } };
  if (!c.readyToComplete) throw new CampaignError("Conclua todas as missões e marcos antes de encerrar a campanha.");
  const upd = await db.execute({
    sql: "UPDATE campaigns SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND owner_id = ? AND status IN ('active', 'paused')",
    args: [id, ownerId],
  });
  if (upd.rowsAffected === 0) return { campaign: await getCampaign(db, ownerId, id), reward: null };
  await logEvent(db, ownerId, id, "completed", `Campanha concluída: ${c.title}`);

  let reward: { xp: number; coins: number } | null = null;
  const start = (c.startDate ?? c.createdAt).slice(0, 10);
  const today = await todayKeyFor(db, ownerId);
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
  if (days >= CC.completion.minDaysSinceStart && (c.completionReward.xp > 0 || c.completionReward.coins > 0)) {
    const final = applyBonus(c.completionReward, c.streak);
    const ok = await award(
      db,
      ownerId,
      {
        sourceType: "campaign",
        sourceId: id,
        eventType: "completed",
        xp: final.xp,
        coins: final.coins,
        baseXp: c.completionReward.xp,
        multiplier: final.multiplier,
        label: `Campanha concluída: ${c.title}`,
      },
      today,
    );
    if (ok) reward = { xp: final.xp, coins: final.coins };
  }
  try {
    await evaluateAchievements(ownerId);
  } catch {
    // Conquistas são efeito colateral: nunca derrubam a conclusão.
  }
  return { campaign: await getCampaign(db, ownerId, id), reward };
}

/** Sugestões de recompensa do LifeOS (para o wizard), sempre dentro dos limites. */
export function rewardSuggestions(term: CampaignTerm, milestones: number) {
  return {
    completion: suggestedCompletion(term, milestones),
    milestone: CC.milestone.suggested,
    limits: { milestone: CC.milestone.limits, completion: CC.completion.limits },
    streakTiers: CC.streak.tiers,
  };
}
