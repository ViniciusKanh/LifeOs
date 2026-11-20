import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import {
  AGENT_RUN_STALE_MS,
  DECOR_SLOTS,
  DEFAULT_AVATAR,
  DEFAULT_WORLD_SETTINGS,
  WORLD_AGENTS,
  type WorldAvatar,
  type WorldRoom,
  type WorldSettings,
} from "../config/livingWorld.js";
import { getDifficultyRewards, getPlayerProfile, habitStreakEndingAt } from "./gamificationService.js";
import { getInventory } from "./inventoryService.js";
import { getJournalAutoData } from "./journalService.js";
import { localDaysWhere, shiftDayKey, userDayContext } from "./localDayService.js";
import { askAdvisor, type AdvisorAnswer } from "./moduleAdvisorService.js";

/**
 * Meu Mundo (Living World) — camada de leitura e ações do mundo.
 *
 * Princípio: o mundo é uma VISÃO dos dados reais. Atividade atual, XP, moedas,
 * missões, hábitos e inventário são lidos das fontes originais a cada pedido;
 * só preferências, avatar, decoração, eventos do mundo e execuções dos agentes
 * são gravados aqui. Nada daqui concede XP ou moedas.
 */

type Row = Record<string, unknown>;

export class WorldError extends Error {
  constructor(
    message: string,
    public status: 400 | 404 | 409 | 422 = 400,
  ) {
    super(message);
  }
}

const parseJson = <T>(raw: unknown, fallback: T): T => {
  if (typeof raw !== "string" || !raw) return fallback;
  try {
    return { ...fallback, ...(JSON.parse(raw) as object) } as T;
  } catch {
    return fallback;
  }
};

async function ensureProfile(db: Client, ownerId: string) {
  await db.execute({ sql: "INSERT OR IGNORE INTO world_profiles (owner_id) VALUES (?)", args: [ownerId] });
  const r = await db.execute({ sql: "SELECT version, settings_json, avatar_json FROM world_profiles WHERE owner_id = ?", args: [ownerId] });
  const row = r.rows[0] as unknown as Row;
  return {
    version: Number(row?.version ?? 1),
    settings: parseJson<WorldSettings>(row?.settings_json, DEFAULT_WORLD_SETTINGS),
    avatar: parseJson<WorldAvatar>(row?.avatar_json, DEFAULT_AVATAR),
  };
}

export async function recordWorldEvent(db: Client, ownerId: string, e: { type: string; title: string; detail?: string | null; refId?: string | null; meta?: unknown }) {
  await db.execute({
    sql: "INSERT INTO world_events (id, owner_id, type, title, detail, ref_id, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [nanoid(), ownerId, e.type, e.title.slice(0, 200), e.detail?.slice(0, 500) ?? null, e.refId ?? null, e.meta === undefined ? null : JSON.stringify(e.meta)],
  });
}

/* ─────────────────────────── Atividade atual ─────────────────────────── */

export interface WorldActivity {
  kind: "mission";
  taskId: string;
  title: string;
  category: string;
  room: WorldRoom;
  /** Quando a missão entrou em andamento (última atualização registrada). */
  since: string;
  progress: { done: number; total: number } | null;
  reward: { xp: number; coins: number } | null;
}

/**
 * Atividade em execução = missão com status "Em Andamento" (a mais recente).
 * Projeto acadêmico → Biblioteca; demais → Escritório. Sem missão em andamento,
 * não há atividade: o mundo nunca inventa uma.
 */
async function currentActivity(db: Client, ownerId: string): Promise<WorldActivity | null> {
  const r = await db.execute({
    sql: `SELECT t.id, t.title, t.updated_at, t.difficulty, p.name AS project, p.kind AS project_kind,
            (SELECT COUNT(*) FROM tasks s WHERE s.parent_task_id = t.id AND s.owner_id = t.owner_id) AS sub_total,
            (SELECT COUNT(*) FROM tasks s WHERE s.parent_task_id = t.id AND s.owner_id = t.owner_id AND s.status = 'Concluído') AS sub_done
          FROM tasks t LEFT JOIN projects p ON p.id = t.project_id AND p.owner_id = t.owner_id
          WHERE t.owner_id = ? AND t.status = 'Em Andamento' AND t.parent_task_id IS NULL AND t.archived_at IS NULL
          ORDER BY t.updated_at DESC LIMIT 1`,
    args: [ownerId],
  });
  const t = r.rows[0] as unknown as Row | undefined;
  if (!t) return null;
  const academic = String(t.project_kind ?? "") === "academic";
  const rewards = t.difficulty ? (await getDifficultyRewards(db, ownerId))[String(t.difficulty) as keyof Awaited<ReturnType<typeof getDifficultyRewards>>] : null;
  const total = Number(t.sub_total ?? 0);
  return {
    kind: "mission",
    taskId: String(t.id),
    title: String(t.title),
    category: academic ? "Estudos" : t.project ? `Projeto · ${String(t.project)}` : "Missão",
    room: academic ? "biblioteca" : "escritorio",
    since: String(t.updated_at),
    progress: total > 0 ? { done: Number(t.sub_done ?? 0), total } : null,
    reward: rewards ? { xp: rewards.taskXp, coins: rewards.taskCoins } : null,
  };
}

/* ─────────────────────────── Ambientes ─────────────────────────── */

function dueToday(frequency: string, config: unknown, today: string): boolean {
  if (frequency === "daily") return true;
  if (frequency === "specific_days") {
    try {
      const cfg = typeof config === "string" ? (JSON.parse(config) as { days?: number[] }) : null;
      const wd = new Date(`${today}T12:00:00Z`).getUTCDay();
      return Array.isArray(cfg?.days) && cfg!.days.includes(wd);
    } catch {
      return false;
    }
  }
  // Semanal/mensal/N por semana: não há um "dia devido" — nunca marcamos pendência.
  return false;
}

/**
 * Regra das plantas do Jardim (documentada): estágio pela sequência atual
 * (0 broto, 1–2 muda, 3–6 planta, 7–20 arbusto, 21+ árvore); concluído hoje = floresce;
 * pendente só quando o hábito é devido hoje (diário ou dia marcado) e ainda não foi feito.
 */
export function plantStage(streak: number): 0 | 1 | 2 | 3 | 4 {
  if (streak >= 21) return 4;
  if (streak >= 7) return 3;
  if (streak >= 3) return 2;
  if (streak >= 1) return 1;
  return 0;
}

async function gardenHabits(db: Client, ownerId: string, today: string) {
  const r = await db.execute({
    sql: `SELECT h.id, h.name, h.icon, h.frequency, h.frequency_config, h.target_count,
            (SELECT he.count FROM habit_entries he WHERE he.habit_id = h.id AND he.owner_id = h.owner_id AND he.entry_date = ?) AS today_count
          FROM habits h WHERE h.owner_id = ? AND h.archived_at IS NULL ORDER BY h.created_at LIMIT 10`,
    args: [today, ownerId],
  });
  return Promise.all(
    (r.rows as unknown as Row[]).map(async (h) => {
      const target = Math.max(1, Number(h.target_count ?? 1));
      const doneToday = Number(h.today_count ?? 0) >= target;
      const streak = await habitStreakEndingAt(db, ownerId, String(h.id), doneToday ? today : shiftDayKey(today, -1), target);
      return {
        id: String(h.id),
        name: String(h.name),
        icon: h.icon ? String(h.icon) : null,
        frequency: String(h.frequency),
        target,
        todayCount: Number(h.today_count ?? 0),
        doneToday,
        streak,
        stage: plantStage(streak),
        pendingToday: !doneToday && dueToday(String(h.frequency), h.frequency_config, today),
      };
    }),
  );
}

async function guildMissions(db: Client, ownerId: string, tz: string, today: string) {
  const rewards = await getDifficultyRewards(db, ownerId);
  const done = localDaysWhere("completed_at", today, today, tz);
  const [open, doneToday] = await Promise.all([
    db.execute({
      sql: `SELECT t.id, t.title, t.status, t.priority, t.difficulty, t.due_date,
              (SELECT COUNT(*) FROM tasks s WHERE s.parent_task_id = t.id AND s.owner_id = t.owner_id) AS sub_total,
              (SELECT COUNT(*) FROM tasks s WHERE s.parent_task_id = t.id AND s.owner_id = t.owner_id AND s.status = 'Concluído') AS sub_done
            FROM tasks t WHERE t.owner_id = ? AND t.status != 'Concluído' AND t.parent_task_id IS NULL AND t.archived_at IS NULL
            ORDER BY CASE t.status WHEN 'Em Andamento' THEN 0 ELSE 1 END, t.due_date IS NULL, t.due_date,
                     CASE t.priority WHEN 'Alta' THEN 0 WHEN 'Média' THEN 1 ELSE 2 END LIMIT 15`,
      args: [ownerId],
    }),
    db.execute({
      sql: `SELECT id, title, difficulty FROM tasks WHERE owner_id = ? AND status = 'Concluído' AND parent_task_id IS NULL AND ${done.sql} ORDER BY completed_at DESC LIMIT 10`,
      args: [ownerId, ...done.args],
    }),
  ]);
  const reward = (d: unknown) => (d ? { xp: rewards[String(d) as keyof typeof rewards]?.taskXp ?? 0, coins: rewards[String(d) as keyof typeof rewards]?.taskCoins ?? 0 } : null);
  return {
    open: (open.rows as unknown as Row[]).map((t) => ({
      id: String(t.id),
      title: String(t.title),
      status: String(t.status),
      priority: String(t.priority),
      difficulty: t.difficulty ? String(t.difficulty) : null,
      dueDate: t.due_date ? String(t.due_date).slice(0, 10) : null,
      overdue: !!t.due_date && String(t.due_date).slice(0, 10) < today,
      progress: Number(t.sub_total) > 0 ? { done: Number(t.sub_done), total: Number(t.sub_total) } : null,
      reward: reward(t.difficulty),
    })),
    doneToday: (doneToday.rows as unknown as Row[]).map((t) => ({ id: String(t.id), title: String(t.title), reward: reward(t.difficulty) })),
  };
}

async function roomFacts(db: Client, ownerId: string, tz: string, today: string) {
  const study = localDaysWhere("created_at", today, today, tz);
  const workoutsToday = localDaysWhere("performed_at", today, today, tz);
  const workouts7 = localDaysWhere("performed_at", shiftDayKey(today, -6), today, tz);
  const [auto, studyR, wToday, w7, journalR] = await Promise.all([
    getJournalAutoData(db, ownerId, today).catch(() => null),
    db.execute({ sql: `SELECT COALESCE(SUM(duration_minutes), 0) AS m FROM study_sessions WHERE owner_id = ? AND (occurred_at = ? OR (${study.sql}))`, args: [ownerId, today, ...study.args] }).catch(() => ({ rows: [{ m: 0 }] })),
    db.execute({ sql: `SELECT kind, modality, duration_minutes FROM workouts WHERE owner_id = ? AND ${workoutsToday.sql} ORDER BY performed_at`, args: [ownerId, ...workoutsToday.args] }),
    db.execute({ sql: `SELECT COUNT(*) AS n, COALESCE(SUM(duration_minutes), 0) AS m FROM workouts WHERE owner_id = ? AND ${workouts7.sql}`, args: [ownerId, ...workouts7.args] }),
    db.execute({ sql: "SELECT thoughts FROM journal_entries WHERE owner_id = ? AND entry_date = ?", args: [ownerId, today] }),
  ]);
  const thoughts = String(journalR.rows[0]?.thoughts ?? "").replace(/<[^>]+>/g, " ");
  return {
    library: {
      studyMinutesToday: Number((studyR.rows[0] as unknown as Row)?.m ?? 0),
      readingPagesToday: auto?.reading.pages ?? 0,
      readingMinutesToday: auto?.reading.minutes ?? 0,
      currentBook: auto?.currentBook ? { title: auto.currentBook.title, author: auto.currentBook.author } : null,
    },
    gym: {
      today: (wToday.rows as unknown as Row[]).map((w) => ({ name: [w.modality, w.kind].filter(Boolean).map(String).filter((v, i, a) => a.indexOf(v) === i).join(" · "), minutes: w.duration_minutes == null ? null : Number(w.duration_minutes) })),
      week: { count: Number(w7.rows[0]?.n ?? 0), minutes: Number(w7.rows[0]?.m ?? 0) },
    },
    home: {
      journalWordsToday: thoughts.split(/\s+/).filter(Boolean).length,
      waterMl: auto?.waterMl ?? 0,
      sleepMinutes: auto?.sleep?.durationMinutes ?? null,
      mood: auto?.mood ? { mood: auto.mood.mood, energy: auto.mood.energy } : null,
    },
  };
}

/* ─────────────────────────── Agentes ─────────────────────────── */

export interface AgentRunView {
  id: string;
  status: "running" | "done" | "failed";
  question: string | null;
  result: AdvisorAnswer | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

function mapRun(r: Row): AgentRunView {
  const stale = String(r.status) === "running" && Date.now() - Date.parse(`${String(r.started_at).replace(" ", "T")}Z`) > AGENT_RUN_STALE_MS;
  return {
    id: String(r.id),
    status: stale ? "failed" : (String(r.status) as AgentRunView["status"]),
    question: r.question ? String(r.question) : null,
    result: r.result_json ? (JSON.parse(String(r.result_json)) as AdvisorAnswer) : null,
    error: stale ? "A execução foi interrompida antes de terminar." : r.error ? String(r.error) : null,
    startedAt: String(r.started_at),
    finishedAt: r.finished_at ? String(r.finished_at) : null,
  };
}

async function agentsState(db: Client, ownerId: string) {
  const r = await db.execute({
    sql: `SELECT * FROM world_agent_runs r WHERE r.owner_id = ? AND r.started_at = (SELECT MAX(started_at) FROM world_agent_runs x WHERE x.owner_id = r.owner_id AND x.agent_key = r.agent_key)`,
    args: [ownerId],
  });
  const counts = await db.execute({ sql: "SELECT agent_key, COUNT(*) AS n FROM world_agent_runs WHERE owner_id = ? AND status = 'done' GROUP BY agent_key", args: [ownerId] });
  const byKey = new Map((r.rows as unknown as Row[]).map((x) => [String(x.agent_key), mapRun(x)]));
  const doneBy = new Map((counts.rows as unknown as Row[]).map((x) => [String(x.agent_key), Number(x.n)]));
  return WORLD_AGENTS.map((a) => ({
    key: a.key,
    name: a.name,
    specialty: a.specialty,
    room: a.room,
    color: a.color,
    defaultQuestion: a.defaultQuestion,
    lastRun: byKey.get(a.key) ?? null,
    completedRuns: doneBy.get(a.key) ?? 0,
  }));
}

export async function agentHistory(db: Client, ownerId: string, agentKey: string, limit = 10) {
  if (!WORLD_AGENTS.some((a) => a.key === agentKey)) throw new WorldError("Agente desconhecido.", 404);
  const r = await db.execute({ sql: "SELECT * FROM world_agent_runs WHERE owner_id = ? AND agent_key = ? ORDER BY started_at DESC, rowid DESC LIMIT ?", args: [ownerId, agentKey, limit] });
  return (r.rows as unknown as Row[]).map(mapRun);
}

/**
 * Execução real de um agente: grava "running", chama o conselheiro do LifeOS
 * (dados reais; Gemini só se configurado) e grava o resultado ou a falha.
 * O estado visual do agente no mapa vem exclusivamente destas linhas.
 */
export async function runAgent(db: Client, ownerId: string, agentKey: string, question: string | null) {
  const agent = WORLD_AGENTS.find((a) => a.key === agentKey);
  if (!agent) throw new WorldError("Agente desconhecido.", 404);
  const running = await db.execute({ sql: "SELECT * FROM world_agent_runs WHERE owner_id = ? AND agent_key = ? AND status = 'running' ORDER BY started_at DESC LIMIT 1", args: [ownerId, agentKey] });
  const cur = running.rows[0] ? mapRun(running.rows[0] as unknown as Row) : null;
  if (cur && cur.status === "running") throw new WorldError(`${agent.name} já está trabalhando num pedido.`, 409);
  if (running.rows[0]) {
    await db.execute({ sql: "UPDATE world_agent_runs SET status = 'failed', error = ?, finished_at = datetime('now') WHERE id = ?", args: ["A execução foi interrompida antes de terminar.", String(running.rows[0].id)] });
  }
  const id = nanoid();
  const q = (question ?? "").trim().slice(0, 400) || agent.defaultQuestion;
  await db.execute({ sql: "INSERT INTO world_agent_runs (id, owner_id, agent_key, status, question) VALUES (?, ?, ?, 'running', ?)", args: [id, ownerId, agentKey, q] });
  await recordWorldEvent(db, ownerId, { type: "agent.started", title: `${agent.name} começou uma tarefa`, detail: q, refId: id, meta: { agent: agentKey } });
  try {
    const answer = await askAdvisor(db, ownerId, agent.advisor, { useAi: true, question: q });
    await db.execute({ sql: "UPDATE world_agent_runs SET status = 'done', result_json = ?, finished_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [JSON.stringify(answer), id, ownerId] });
    await recordWorldEvent(db, ownerId, { type: "agent.completed", title: `${agent.name} concluiu a análise`, detail: answer.ai ? "Leitura com IA sobre os seus dados reais." : "Leitura por regras (IA indisponível) sobre os seus dados reais.", refId: id, meta: { agent: agentKey, ai: answer.ai } });
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 300) : "Falha desconhecida.";
    await db.execute({ sql: "UPDATE world_agent_runs SET status = 'failed', error = ?, finished_at = datetime('now') WHERE id = ? AND owner_id = ?", args: ["O agente não conseguiu concluir agora. Tente de novo.", id, ownerId] });
    await recordWorldEvent(db, ownerId, { type: "agent.failed", title: `${agent.name} não conseguiu concluir`, detail: null, refId: id, meta: { agent: agentKey } });
    console.error("[meu-mundo] agente falhou:", msg);
  }
  const r = await db.execute({ sql: "SELECT * FROM world_agent_runs WHERE id = ?", args: [id] });
  return mapRun(r.rows[0] as unknown as Row);
}

/* ─────────────────────────── Decoração ─────────────────────────── */

export async function placeable(db: Client, ownerId: string) {
  const inv = await getInventory(db, ownerId);
  return inv.items.filter((i) => i.quantity > 0 && !i.archived).map((i) => ({ key: i.key, name: i.name, type: i.type, rarity: i.rarity, art: i.art, artSet: i.artSet, quantity: i.quantity }));
}

/** Coloca um item do inventário num slot livre. Cosmético: não altera regras nem dá bônus. */
export async function placeDecor(db: Client, ownerId: string, slotKey: string, itemKey: string) {
  const slot = DECOR_SLOTS.find((s) => s.key === slotKey);
  if (!slot) throw new WorldError("Posição inválida para decoração.");
  const items = await placeable(db, ownerId);
  const item = items.find((i) => i.key === itemKey);
  if (!item) throw new WorldError("Você não possui este item no inventário.", 422);
  const used = await db.execute({ sql: "SELECT COUNT(*) AS n FROM world_objects WHERE owner_id = ? AND item_key = ? AND slot_key != ?", args: [ownerId, itemKey, slotKey] });
  if (Number(used.rows[0]?.n ?? 0) >= item.quantity) throw new WorldError("Todas as unidades deste item já estão no mundo.", 409);
  await db.execute({
    sql: `INSERT INTO world_objects (id, owner_id, room, slot_key, item_key, item_name, item_art, item_art_set) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(owner_id, slot_key) DO UPDATE SET item_key = excluded.item_key, item_name = excluded.item_name, item_art = excluded.item_art, item_art_set = excluded.item_art_set, created_at = datetime('now')`,
    args: [nanoid(), ownerId, slot.room, slotKey, itemKey, item.name, item.art, item.artSet],
  });
  await recordWorldEvent(db, ownerId, { type: "decor.placed", title: `${item.name} colocado no mundo`, detail: null, refId: itemKey, meta: { slot: slotKey, room: slot.room } });
  return listObjects(db, ownerId);
}

export async function removeDecor(db: Client, ownerId: string, slotKey: string) {
  const r = await db.execute({ sql: "DELETE FROM world_objects WHERE owner_id = ? AND slot_key = ?", args: [ownerId, slotKey] });
  if (!r.rowsAffected) throw new WorldError("Não há decoração nesta posição.", 404);
  return listObjects(db, ownerId);
}

async function listObjects(db: Client, ownerId: string) {
  const r = await db.execute({ sql: "SELECT slot_key, room, item_key, item_name, item_art, item_art_set FROM world_objects WHERE owner_id = ?", args: [ownerId] });
  return (r.rows as unknown as Row[]).map((o) => ({ slotKey: String(o.slot_key), room: String(o.room), itemKey: String(o.item_key), name: String(o.item_name), art: String(o.item_art), artSet: String(o.item_art_set) as "items" | "rewards" | "codex" }));
}

/* ─────────────────────────── Preferências e avatar ─────────────────────────── */

export async function saveSettings(db: Client, ownerId: string, patch: Partial<WorldSettings>) {
  const cur = await ensureProfile(db, ownerId);
  const next = { ...cur.settings, ...patch };
  await db.execute({ sql: "UPDATE world_profiles SET settings_json = ?, updated_at = datetime('now') WHERE owner_id = ?", args: [JSON.stringify(next), ownerId] });
  return next;
}

export async function saveAvatar(db: Client, ownerId: string, patch: Partial<WorldAvatar>, lookChanged: boolean) {
  const cur = await ensureProfile(db, ownerId);
  const next = { ...cur.avatar, ...patch };
  await db.execute({ sql: "UPDATE world_profiles SET avatar_json = ?, updated_at = datetime('now') WHERE owner_id = ?", args: [JSON.stringify(next), ownerId] });
  if (lookChanged) await recordWorldEvent(db, ownerId, { type: "avatar.updated", title: "Aparência do avatar atualizada" });
  return next;
}

/* ─────────────────────────── Linha do tempo ─────────────────────────── */

const XP_CATEGORY: Record<string, { cat: string; link: (id: string) => string | null }> = {
  task: { cat: "missoes", link: (id) => `/tarefas?task=${id}` },
  contract: { cat: "missoes", link: () => "/contratos" },
  project: { cat: "missoes", link: (id) => `/projetos/${id}` },
  habit_entry: { cat: "habitos", link: () => "/habitos" },
  habit_streak: { cat: "habitos", link: () => "/habitos" },
  journal: { cat: "diario", link: () => "/diario" },
  achievement: { cat: "recompensas", link: () => "/conquistas" },
  review: { cat: "revisoes", link: () => "/revisoes" },
  bank: { cat: "recompensas", link: () => "/banco" },
};

export interface WorldTimelineEvent {
  id: string;
  category: string;
  title: string;
  detail: string | null;
  at: string;
  source: string;
  link: string | null;
  xp: number | null;
}

const toIso = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00.000Z` : s.includes("T") ? s : `${s.replace(" ", "T")}Z`);

export async function listWorldEvents(db: Client, ownerId: string, opts: { category?: string | null; before?: string | null; limit?: number }) {
  const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
  const before = opts.before ? new Date(opts.before).toISOString() : new Date(Date.now() + 60_000).toISOString();
  const beforeSql = before.replace("T", " ").slice(0, 19);
  const cat = opts.category ?? null;
  const want = (c: string) => !cat || cat === c;
  const [xp, world, workouts] = await Promise.all([
    db.execute({ sql: "SELECT id, source_type, source_id, event_type, xp, label, created_at FROM xp_events WHERE owner_id = ? AND created_at < ? ORDER BY created_at DESC, rowid DESC LIMIT ?", args: [ownerId, beforeSql, limit * 2] }),
    db.execute({ sql: "SELECT id, type, title, detail, created_at FROM world_events WHERE owner_id = ? AND created_at < ? ORDER BY created_at DESC, rowid DESC LIMIT ?", args: [ownerId, beforeSql, limit] }),
    want("saude")
      ? db.execute({ sql: "SELECT id, kind, modality, duration_minutes, performed_at FROM workouts WHERE owner_id = ? AND performed_at < ? ORDER BY performed_at DESC LIMIT ?", args: [ownerId, before, limit] })
      : Promise.resolve({ rows: [] as unknown[] }),
  ]);
  const out: WorldTimelineEvent[] = [];
  for (const e of xp.rows as unknown as Row[]) {
    const m = XP_CATEGORY[String(e.source_type)] ?? { cat: "outros", link: () => null };
    if (!want(m.cat)) continue;
    out.push({ id: `xp-${String(e.id)}`, category: m.cat, title: String(e.label ?? e.event_type), detail: null, at: toIso(String(e.created_at)), source: String(e.source_type), link: m.link(String(e.source_id)), xp: Number(e.xp) });
  }
  for (const e of world.rows as unknown as Row[]) {
    const c = String(e.type).startsWith("agent.") ? "agentes" : "mundo";
    if (!want(c)) continue;
    out.push({ id: `w-${String(e.id)}`, category: c, title: String(e.title), detail: e.detail ? String(e.detail) : null, at: toIso(String(e.created_at)), source: String(e.type), link: null, xp: null });
  }
  for (const w of workouts.rows as unknown as Row[]) {
    const name = [w.modality, w.kind].filter(Boolean).map(String).filter((v, i, a) => a.indexOf(v) === i).join(" · ");
    out.push({ id: `wk-${String(w.id)}`, category: "saude", title: `Treino registrado: ${name}`, detail: w.duration_minutes ? `${Number(w.duration_minutes)} min` : null, at: toIso(String(w.performed_at)), source: "workout", link: "/saude", xp: null });
  }
  out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const page = out.slice(0, limit);
  return { events: page, nextBefore: page.length === limit ? page[page.length - 1]!.at : null };
}

/* ─────────────────────────── Estado completo ─────────────────────────── */

export async function getWorld(db: Client, ownerId: string) {
  const { tz, today } = await userDayContext(db, ownerId);
  const [profileRow, player, activity, habits, missions, facts, agents, objects, timeline] = await Promise.all([
    ensureProfile(db, ownerId),
    getPlayerProfile(db, ownerId),
    currentActivity(db, ownerId),
    gardenHabits(db, ownerId, today),
    guildMissions(db, ownerId, tz, today),
    roomFacts(db, ownerId, tz, today),
    agentsState(db, ownerId),
    listObjects(db, ownerId),
    listWorldEvents(db, ownerId, { limit: 8 }),
  ]);
  const name = await db.execute({ sql: "SELECT name FROM users WHERE id = ?", args: [ownerId] });
  const { recentEvents: _omit, ...profile } = player;
  void _omit;
  return {
    today,
    timezone: tz,
    version: profileRow.version,
    settings: profileRow.settings,
    avatar: { ...profileRow.avatar, name: profileRow.avatar.name ?? (name.rows[0]?.name ? String(name.rows[0].name) : "Herói") },
    profile,
    activity,
    habits,
    missions,
    rooms: facts,
    agents,
    decor: { slots: DECOR_SLOTS, objects },
    timeline: timeline.events,
    localHour: Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz }).format(new Date())) % 24,
  };
}
