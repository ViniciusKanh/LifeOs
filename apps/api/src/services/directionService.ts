import { nanoid } from "nanoid";
import type { getDb } from "../db/client.js";
import { LIFE_AREAS, type LifeArea } from "../validators/direction.schema.js";
import { DONE_STATUS } from "./workloadService.js";

/**
 * Direção: visão → valores → roda da vida → metas por ciclo → projetos →
 * tarefas. Tudo derivado das tabelas reais: o progresso de uma meta soma
 * as tarefas ligadas direto a ela E as tarefas dos projetos ligados a ela;
 * o "alinhamento" mede quanto do que está aberto tem um porquê.
 */

type Db = ReturnType<typeof getDb>;
type Row = Record<string, unknown>;

export interface VisionValue {
  name: string;
  description: string | null;
}

export interface Vision {
  vision: string | null;
  purpose: string | null;
  values: VisionValue[];
  updatedAt: string | null;
}

export function currentCycles(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return { year: String(y), quarter: `${y}-Q${Math.ceil(m / 3)}`, month: `${y}-${String(m).padStart(2, "0")}` };
}

export async function getVision(db: Db, ownerId: string): Promise<Vision> {
  const r = await db.execute({ sql: "SELECT vision, purpose, values_json, updated_at FROM life_vision WHERE owner_id = ?", args: [ownerId] });
  const row = r.rows[0] as unknown as { vision: string | null; purpose: string | null; values_json: string; updated_at: string } | undefined;
  let values: VisionValue[] = [];
  try {
    values = row ? (JSON.parse(row.values_json) as VisionValue[]) : [];
  } catch {
    values = [];
  }
  return { vision: row?.vision ?? null, purpose: row?.purpose ?? null, values, updatedAt: row?.updated_at ?? null };
}

export async function saveVision(db: Db, ownerId: string, input: { vision?: string | null; purpose?: string | null; values?: Array<{ name: string; description?: string | null }> }) {
  const current = await getVision(db, ownerId);
  const next = {
    vision: input.vision !== undefined ? input.vision : current.vision,
    purpose: input.purpose !== undefined ? input.purpose : current.purpose,
    values: (input.values ?? current.values).map((v) => ({ name: v.name, description: v.description ?? null })),
  };
  await db.execute({
    sql: `INSERT INTO life_vision (owner_id, vision, purpose, values_json, updated_at) VALUES (?, ?, ?, ?, datetime('now'))
          ON CONFLICT (owner_id) DO UPDATE SET vision = excluded.vision, purpose = excluded.purpose, values_json = excluded.values_json, updated_at = datetime('now')`,
    args: [ownerId, next.vision, next.purpose, JSON.stringify(next.values.map((v) => ({ name: v.name, description: v.description ?? null })))],
  });
  return getVision(db, ownerId);
}

// ---------------------------------------------------------------- roda da vida

export interface WheelAreaScore {
  area: LifeArea;
  score: number | null;
  note: string | null;
  assessedOn: string | null;
  previousScore: number | null;
}

export interface WheelData {
  latest: WheelAreaScore[];
  /** Média por avaliação (data), mais antiga primeiro — mostra a evolução. */
  history: Array<{ assessedOn: string; average: number; scores: Partial<Record<LifeArea, number>> }>;
}

export async function getWheel(db: Db, ownerId: string): Promise<WheelData> {
  const r = await db.execute({
    sql: "SELECT area, score, note, assessed_on FROM life_wheel_scores WHERE owner_id = ? ORDER BY assessed_on DESC, created_at DESC",
    args: [ownerId],
  });
  const rows = r.rows as unknown as Array<{ area: LifeArea; score: number; note: string | null; assessed_on: string }>;
  const latest: WheelAreaScore[] = LIFE_AREAS.map((area) => {
    const forArea = rows.filter((x) => x.area === area);
    return {
      area,
      score: forArea[0] ? Number(forArea[0].score) : null,
      note: forArea[0]?.note ?? null,
      assessedOn: forArea[0]?.assessed_on ?? null,
      previousScore: forArea[1] ? Number(forArea[1].score) : null,
    };
  });
  const byDate = new Map<string, Partial<Record<LifeArea, number>>>();
  for (const x of rows) {
    const m = byDate.get(x.assessed_on) ?? {};
    m[x.area] = Number(x.score);
    byDate.set(x.assessed_on, m);
  }
  const history = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([assessedOn, scores]) => {
      const vals = Object.values(scores) as number[];
      return { assessedOn, scores, average: Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 };
    });
  return { latest, history };
}

export async function saveWheel(db: Db, ownerId: string, assessedOn: string, scores: Array<{ area: LifeArea; score: number; note?: string | null }>) {
  await db.batch(
    scores.map((s) => ({
      sql: `INSERT INTO life_wheel_scores (id, owner_id, area, score, note, assessed_on) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (owner_id, area, assessed_on) DO UPDATE SET score = excluded.score, note = excluded.note`,
      args: [nanoid(), ownerId, s.area, s.score, s.note ?? null, assessedOn],
    })),
    "write"
  );
  return getWheel(db, ownerId);
}

// ---------------------------------------------------------------- metas e alinhamento

export interface DirectionGoal {
  id: string;
  title: string;
  status: string;
  lifeArea: LifeArea | null;
  cycle: string | null;
  parentGoalId: string | null;
  dueDate: string | null;
  progressPct: number | null;
  progressSource: "tasks" | "value" | null;
  openTasks: number;
  doneTasks: number;
  projects: Array<{ id: string; name: string; doneCount: number; taskCount: number }>;
}

interface GoalTaskStats {
  open: number;
  done: number;
}

function goalTaskStats(goalId: string, tasks: Row[], projectIdsOfGoal: Set<string>): GoalTaskStats {
  let open = 0;
  let done = 0;
  for (const t of tasks) {
    const linked = t.goal_id === goalId || (t.project_id != null && projectIdsOfGoal.has(String(t.project_id)));
    if (!linked) continue;
    if (t.status === DONE_STATUS) done += 1;
    else open += 1;
  }
  return { open, done };
}

export async function loadDirectionGoals(db: Db, ownerId: string): Promise<DirectionGoal[]> {
  const [goalsRes, projectsRes, tasksRes] = await Promise.all([
    db.execute({
      sql: "SELECT id, title, status, life_area, cycle, parent_goal_id, due_date, kind, current_value, target_value FROM goals WHERE owner_id = ?",
      args: [ownerId],
    }),
    db.execute({
      sql: `SELECT p.id, p.name, p.goal_id,
              (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.owner_id = p.owner_id) AS task_count,
              (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.owner_id = p.owner_id AND t.status = ?) AS done_count
            FROM projects p WHERE p.owner_id = ? AND p.goal_id IS NOT NULL AND p.archived_at IS NULL`,
      args: [DONE_STATUS, ownerId],
    }),
    db.execute({ sql: "SELECT id, status, goal_id, project_id FROM tasks WHERE owner_id = ? AND (goal_id IS NOT NULL OR project_id IS NOT NULL)", args: [ownerId] }),
  ]);
  const projects = projectsRes.rows as unknown as Row[];
  const tasks = tasksRes.rows as unknown as Row[];

  return (goalsRes.rows as unknown as Row[]).map((g) => {
    const gid = String(g.id);
    const own = projects.filter((p) => p.goal_id === gid);
    const stats = goalTaskStats(gid, tasks, new Set(own.map((p) => String(p.id))));
    const total = stats.open + stats.done;
    const target = g.target_value == null ? null : Number(g.target_value);
    let progressPct: number | null = null;
    let progressSource: DirectionGoal["progressSource"] = null;
    if (g.status === "done") {
      progressPct = 100;
      progressSource = "value";
    } else if (g.kind === "task_based" && total > 0) {
      progressPct = Math.round((stats.done / total) * 100);
      progressSource = "tasks";
    } else if (target && target > 0) {
      progressPct = Math.min(100, Math.round((Number(g.current_value ?? 0) / target) * 100));
      progressSource = "value";
    }
    return {
      id: gid,
      title: String(g.title),
      status: String(g.status),
      lifeArea: (g.life_area as LifeArea | null) ?? null,
      cycle: (g.cycle as string | null) ?? null,
      parentGoalId: (g.parent_goal_id as string | null) ?? null,
      dueDate: (g.due_date as string | null) ?? null,
      progressPct,
      progressSource,
      openTasks: stats.open,
      doneTasks: stats.done,
      projects: own.map((p) => ({ id: String(p.id), name: String(p.name), doneCount: Number(p.done_count ?? 0), taskCount: Number(p.task_count ?? 0) })),
    };
  });
}

export interface AreaBalance {
  area: LifeArea;
  score: number | null;
  activeGoals: number;
  /** Tarefas concluídas nos últimos 30 dias que servem a metas desta área. */
  doneLast30: number;
}

export interface DirectionOverview {
  vision: Vision;
  wheel: WheelData;
  cycles: ReturnType<typeof currentCycles>;
  goals: DirectionGoal[];
  alignment: {
    openTasks: number;
    alignedOpenTasks: number;
    alignedPct: number | null;
    activeGoalsWithoutArea: number;
    activeGoalsWithoutWork: number;
  };
  balance: AreaBalance[];
}

export async function getDirectionOverview(db: Db, ownerId: string): Promise<DirectionOverview> {
  const [vision, wheel, goals, openRes, doneRes] = await Promise.all([
    getVision(db, ownerId),
    getWheel(db, ownerId),
    loadDirectionGoals(db, ownerId),
    db.execute({
      sql: `SELECT t.id, t.goal_id, p.goal_id AS project_goal_id FROM tasks t LEFT JOIN projects p ON p.id = t.project_id AND p.owner_id = t.owner_id
            WHERE t.owner_id = ? AND t.status != ?`,
      args: [ownerId, DONE_STATUS],
    }),
    db.execute({
      sql: `SELECT t.goal_id, p.goal_id AS project_goal_id FROM tasks t LEFT JOIN projects p ON p.id = t.project_id AND p.owner_id = t.owner_id
            WHERE t.owner_id = ? AND t.status = ? AND date(COALESCE(t.completed_at, t.updated_at)) >= date('now', '-30 days')`,
      args: [ownerId, DONE_STATUS],
    }),
  ]);
  const goalArea = new Map(goals.map((g) => [g.id, g.lifeArea]));
  const openTasks = openRes.rows as unknown as Array<{ goal_id: string | null; project_goal_id: string | null }>;
  const aligned = openTasks.filter((t) => t.goal_id || t.project_goal_id).length;
  const active = goals.filter((g) => g.status === "active");

  const doneByArea = new Map<LifeArea, number>();
  for (const t of doneRes.rows as unknown as Array<{ goal_id: string | null; project_goal_id: string | null }>) {
    const area = goalArea.get(t.goal_id ?? t.project_goal_id ?? "") ?? null;
    if (area) doneByArea.set(area, (doneByArea.get(area) ?? 0) + 1);
  }

  return {
    vision,
    wheel,
    cycles: currentCycles(),
    goals,
    alignment: {
      openTasks: openTasks.length,
      alignedOpenTasks: aligned,
      alignedPct: openTasks.length > 0 ? Math.round((aligned / openTasks.length) * 100) : null,
      activeGoalsWithoutArea: active.filter((g) => !g.lifeArea).length,
      activeGoalsWithoutWork: active.filter((g) => g.openTasks + g.doneTasks === 0 && g.projects.length === 0 && g.progressSource !== "value").length,
    },
    balance: LIFE_AREAS.map((area) => ({
      area,
      score: wheel.latest.find((w) => w.area === area)?.score ?? null,
      activeGoals: active.filter((g) => g.lifeArea === area).length,
      doneLast30: doneByArea.get(area) ?? 0,
    })),
  };
}

// ---------------------------------------------------------------- "por quê" de uma tarefa/projeto

export interface WhyStep {
  type: "task" | "project" | "goal" | "value" | "vision";
  id: string | null;
  label: string;
  detail: string | null;
}

/**
 * Cadeia de propósito: tarefa → projeto → meta (→ meta-mãe…) → área → visão.
 * Só sobe por vínculos reais; se a cadeia parar cedo, a UI mostra isso como
 * convite ("ligue a uma meta") em vez de inventar um motivo.
 */
export async function getWhyChain(db: Db, ownerId: string, type: "task" | "project" | "goal", id: string): Promise<WhyStep[] | null> {
  const chain: WhyStep[] = [];
  let goalId: string | null = null;

  if (type === "task") {
    const r = await db.execute({ sql: "SELECT id, title, project_id, goal_id FROM tasks WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
    const t = r.rows[0] as unknown as { id: string; title: string; project_id: string | null; goal_id: string | null } | undefined;
    if (!t) return null;
    chain.push({ type: "task", id: t.id, label: t.title, detail: null });
    goalId = t.goal_id;
    if (t.project_id) {
      const p = await db.execute({ sql: "SELECT id, name, goal_id FROM projects WHERE id = ? AND owner_id = ?", args: [t.project_id, ownerId] });
      const pr = p.rows[0] as unknown as { id: string; name: string; goal_id: string | null } | undefined;
      if (pr) {
        chain.push({ type: "project", id: pr.id, label: pr.name, detail: null });
        goalId = goalId ?? pr.goal_id;
      }
    }
  } else if (type === "project") {
    const p = await db.execute({ sql: "SELECT id, name, goal_id FROM projects WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
    const pr = p.rows[0] as unknown as { id: string; name: string; goal_id: string | null } | undefined;
    if (!pr) return null;
    chain.push({ type: "project", id: pr.id, label: pr.name, detail: null });
    goalId = pr.goal_id;
  } else {
    goalId = id;
  }

  // Sobe pelas metas-mãe (limite de profundidade evita laço por dado corrompido).
  let lastArea: string | null = null;
  for (let depth = 0; goalId && depth < 6; depth++) {
    const g = await db.execute({ sql: "SELECT id, title, cycle, life_area, parent_goal_id FROM goals WHERE id = ? AND owner_id = ?", args: [goalId, ownerId] });
    const gr = g.rows[0] as unknown as { id: string; title: string; cycle: string | null; life_area: string | null; parent_goal_id: string | null } | undefined;
    if (!gr) break;
    chain.push({ type: "goal", id: gr.id, label: gr.title, detail: gr.cycle });
    lastArea = gr.life_area ?? lastArea;
    goalId = gr.parent_goal_id;
  }
  if (type === "goal" && chain.length === 0) return null;

  if (lastArea) chain.push({ type: "value", id: lastArea, label: lastArea, detail: null });
  const vision = await getVision(db, ownerId);
  if (vision.vision && chain.some((s) => s.type === "goal")) chain.push({ type: "vision", id: null, label: vision.purpose || vision.vision, detail: null });
  return chain;
}
