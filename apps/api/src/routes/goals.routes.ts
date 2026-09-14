import { Router } from "express";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { createGoalSchema, updateGoalSchema, goalProgressSchema } from "../validators/goals.schema.js";

export const goalsRouter = Router();
goalsRouter.use(requireAuth);

async function getOwnedGoal(db: ReturnType<typeof getDb>, goalId: string, ownerId: string) {
  const result = await db.execute({
    sql: "SELECT * FROM goals WHERE id = ? AND owner_id = ?",
    args: [goalId, ownerId],
  });
  return result.rows[0] ?? null;
}

/** Sequência atual de dias consecutivos com check-in, contando pra trás a partir de hoje (ou ontem). */
function computeHabitStreak(entryDates: string[]): { current: number } {
  const dates = new Set(entryDates);
  let current = 0;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const cursor = new Date(today);
  if (!dates.has(cursor.toISOString().slice(0, 10))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    current += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return { current };
}

/** GET /api/goals?status=&parentGoalId= — parentGoalId="null" retorna só as metas de topo (anuais) */
goalsRouter.get("/", async (req, res) => {
  const { status, parentGoalId } = req.query as { status?: string; parentGoalId?: string };
  const db = getDb();
  const conditions = ["owner_id = ?"];
  const args: Array<string> = [req.user!.id];

  if (status) {
    conditions.push("status = ?");
    args.push(status);
  }
  if (parentGoalId === "null") {
    conditions.push("parent_goal_id IS NULL");
  } else if (parentGoalId) {
    conditions.push("parent_goal_id = ?");
    args.push(parentGoalId);
  }

  const result = await db.execute({
    sql: `SELECT * FROM goals WHERE ${conditions.join(" AND ")} ORDER BY due_date ASC, created_at ASC`,
    args,
  });
  return res.json(result.rows);
});

/**
 * GET /api/goals/stats — dados agregados para o dashboard de Metas:
 * concluídas no ano, sequência de dias registrando progresso, progresso
 * por período (anual/semestral/mensal/semanal), metas por área da vida,
 * próximos marcos (o próximo passo que o usuário cadastrou em cada meta)
 * e conquistas recentes reais (metas concluídas e sequências de hábito).
 */
goalsRouter.get("/stats", async (req, res) => {
  const db = getDb();
  const ownerId = req.user!.id;

  const [allGoalsResult, progressDatesResult, habitsResult] = await Promise.all([
    db.execute({ sql: "SELECT * FROM goals WHERE owner_id = ?", args: [ownerId] }),
    db.execute({
      sql: "SELECT DISTINCT date(recorded_at) AS d FROM goal_progress WHERE owner_id = ? ORDER BY d DESC",
      args: [ownerId],
    }),
    db.execute({
      sql: "SELECT id, name, icon, target_count FROM habits WHERE owner_id = ? AND archived_at IS NULL",
      args: [ownerId],
    }),
  ]);

  type GoalRow = {
    id: string; title: string; category: string | null; kind: string; status: string;
    target_value: number | null; current_value: number; unit: string | null; period: string | null;
    next_action: string | null; next_action_due: string | null; completed_at: string | null; created_at: string;
  };
  const goals = allGoalsResult.rows as unknown as GoalRow[];

  const yearNow = new Date().getUTCFullYear();
  const completedThisYear = goals.filter((g) => g.status === "done" && g.completed_at && new Date(g.completed_at).getUTCFullYear() === yearNow).length;

  // "Dias em foco": sequência atual de dias consecutivos (a partir de
  // hoje/ontem) em que o usuário registrou progresso em alguma meta.
  const progressDates = new Set((progressDatesResult.rows as unknown as Array<{ d: string }>).map((r) => r.d));
  let daysInFocus = 0;
  {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const cursor = new Date(today);
    if (!progressDates.has(cursor.toISOString().slice(0, 10))) cursor.setUTCDate(cursor.getUTCDate() - 1);
    while (progressDates.has(cursor.toISOString().slice(0, 10))) {
      daysInFocus += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
  }

  // Progresso por período: entre as metas que têm um período definido,
  // quantas já foram concluídas ("X de Y").
  const PERIOD_LABEL: Record<string, string> = { anual: "Anuais", semestral: "Semestrais", mensal: "Mensais", semanal: "Semanais" };
  const periodMap = new Map<string, { done: number; total: number }>();
  for (const g of goals) {
    if (!g.period) continue;
    const entry = periodMap.get(g.period) ?? { done: 0, total: 0 };
    entry.total += 1;
    if (g.status === "done") entry.done += 1;
    periodMap.set(g.period, entry);
  }
  const periodOrder = ["anual", "semestral", "mensal", "semanal"];
  const periods = periodOrder
    .filter((p) => periodMap.has(p))
    .map((p) => {
      const v = periodMap.get(p)!;
      return { period: p, label: PERIOD_LABEL[p], doneCount: v.done, totalCount: v.total, pct: v.total > 0 ? Math.round((v.done / v.total) * 100) : 0 };
    });

  // Metas por área da vida (categoria livre, definida pelo próprio usuário).
  const categoryMap = new Map<string, number>();
  for (const g of goals) {
    const key = g.category?.trim() || "Sem área";
    categoryMap.set(key, (categoryMap.get(key) ?? 0) + 1);
  }
  const categories = [...categoryMap.entries()].map(([category, count]) => ({ category, count }));

  // Próximos marcos: o próximo passo cadastrado em cada meta ativa, mais
  // próximo primeiro. Nunca inventado — só aparece se o usuário preencheu.
  const upcomingMilestones = goals
    .filter((g) => g.status === "active" && g.next_action && g.next_action_due)
    .sort((a, b) => (a.next_action_due! < b.next_action_due! ? -1 : 1))
    .slice(0, 6)
    .map((g) => ({ goalId: g.id, goalTitle: g.title, category: g.category, nextAction: g.next_action, nextActionDue: g.next_action_due }));

  // Conquistas recentes: combina metas concluídas de verdade com marcos de
  // sequência de hábitos (7/14/30/60/100 dias) que o usuário atingiu agora.
  type Achievement = { type: "goal_done" | "habit_streak"; title: string; subtitle: string; at: string };
  const achievements: Achievement[] = [];
  for (const g of goals) {
    if (g.status === "done" && g.completed_at) {
      achievements.push({ type: "goal_done", title: "Meta concluída", subtitle: g.title, at: g.completed_at });
    }
  }
  const STREAK_MILESTONES = [100, 60, 30, 14, 7];
  for (const habit of habitsResult.rows as unknown as Array<{ id: string; name: string; target_count: number }>) {
    const entriesResult = await db.execute({
      sql: "SELECT entry_date FROM habit_entries WHERE habit_id = ? AND count >= ? ORDER BY entry_date ASC",
      args: [habit.id, habit.target_count],
    });
    const dates = (entriesResult.rows as unknown as Array<{ entry_date: string }>).map((r) => r.entry_date);
    const { current } = computeHabitStreak(dates);
    const hit = STREAK_MILESTONES.find((m) => current === m);
    if (hit) {
      achievements.push({ type: "habit_streak", title: `${hit} dias seguidos`, subtitle: habit.name, at: dates[dates.length - 1] ?? new Date().toISOString() });
    }
  }
  achievements.sort((a, b) => (a.at < b.at ? 1 : -1));

  return res.json({
    totalGoals: goals.length,
    completedThisYear,
    daysInFocus,
    periods,
    categories,
    upcomingMilestones,
    recentAchievements: achievements.slice(0, 6),
  });
});

/** GET /api/goals/:id — inclui submetas diretas e histórico de progresso */
goalsRouter.get("/:id", async (req, res) => {
  const db = getDb();
  const goal = await getOwnedGoal(db, req.params.id, req.user!.id);
  if (!goal) return res.status(404).json({ error: "Meta não encontrada." });

  const [children, progress] = await Promise.all([
    db.execute({
      sql: "SELECT * FROM goals WHERE parent_goal_id = ? AND owner_id = ? ORDER BY created_at ASC",
      args: [req.params.id, req.user!.id],
    }),
    db.execute({
      sql: "SELECT * FROM goal_progress WHERE goal_id = ? ORDER BY recorded_at ASC",
      args: [req.params.id],
    }),
  ]);

  return res.json({ ...goal, children: children.rows, progress: progress.rows });
});

/** POST /api/goals */
goalsRouter.post("/", async (req, res) => {
  const parsed = createGoalSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const d = parsed.data;
  const db = getDb();

  if (d.parentGoalId) {
    const parent = await getOwnedGoal(db, d.parentGoalId, req.user!.id);
    if (!parent) return res.status(400).json({ error: "Meta superior inválida." });
  }

  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO goals (id, owner_id, parent_goal_id, title, description, category, kind, target_value, unit, due_date, period, next_action, next_action_due)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      req.user!.id,
      d.parentGoalId ?? null,
      d.title,
      d.description ?? null,
      d.category ?? null,
      d.kind,
      d.targetValue ?? null,
      d.unit ?? null,
      d.dueDate ?? null,
      d.period ?? null,
      d.nextAction ?? null,
      d.nextActionDue ?? null,
    ],
  });
  const created = await db.execute({ sql: "SELECT * FROM goals WHERE id = ?", args: [id] });
  return res.status(201).json(created.rows[0]);
});

/** PATCH /api/goals/:id */
goalsRouter.patch("/:id", async (req, res) => {
  const parsed = updateGoalSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const existing = await getOwnedGoal(db, req.params.id, req.user!.id);
  if (!existing) return res.status(404).json({ error: "Meta não encontrada." });

  const fieldMap: Record<string, string> = {
    title: "title",
    description: "description",
    category: "category",
    kind: "kind",
    targetValue: "target_value",
    currentValue: "current_value",
    unit: "unit",
    dueDate: "due_date",
    status: "status",
    period: "period",
    nextAction: "next_action",
    nextActionDue: "next_action_due",
  };
  const sets: string[] = [];
  const args: Array<string | number | null> = [];
  for (const [key, column] of Object.entries(fieldMap)) {
    const value = (parsed.data as Record<string, unknown>)[key];
    if (value !== undefined) {
      sets.push(`${column} = ?`);
      args.push(value as string | number | null);
    }
  }
  if (sets.length === 0) return res.json(existing);

  // completed_at reflete a data real em que a meta virou "done" — usado
  // honestamente em "Metas concluídas neste ano" e "Conquistas recentes".
  if (parsed.data.status === "done" && (existing as unknown as { status: string }).status !== "done") {
    sets.push("completed_at = datetime('now')");
  } else if (parsed.data.status && parsed.data.status !== "done") {
    sets.push("completed_at = NULL");
  }

  sets.push("updated_at = datetime('now')");
  args.push(req.params.id, req.user!.id);
  await db.execute({
    sql: `UPDATE goals SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`,
    args,
  });
  const updated = await db.execute({ sql: "SELECT * FROM goals WHERE id = ?", args: [req.params.id] });
  return res.json(updated.rows[0]);
});

/** DELETE /api/goals/:id */
goalsRouter.delete("/:id", async (req, res) => {
  const db = getDb();
  const existing = await getOwnedGoal(db, req.params.id, req.user!.id);
  if (!existing) return res.status(404).json({ error: "Meta não encontrada." });
  await db.execute({ sql: "DELETE FROM goals WHERE id = ? AND owner_id = ?", args: [req.params.id, req.user!.id] });
  return res.status(204).send();
});

/** POST /api/goals/:id/progress — registra um ponto de progresso e atualiza o valor atual da meta */
goalsRouter.post("/:id/progress", async (req, res) => {
  const parsed = goalProgressSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const goal = await getOwnedGoal(db, req.params.id, req.user!.id);
  if (!goal) return res.status(404).json({ error: "Meta não encontrada." });

  await db.execute({
    sql: "INSERT INTO goal_progress (id, goal_id, owner_id, value, note) VALUES (?, ?, ?, ?, ?)",
    args: [nanoid(), req.params.id, req.user!.id, parsed.data.value, parsed.data.note ?? null],
  });
  await db.execute({
    sql: "UPDATE goals SET current_value = ?, updated_at = datetime('now') WHERE id = ?",
    args: [parsed.data.value, req.params.id],
  });

  const updated = await db.execute({ sql: "SELECT * FROM goals WHERE id = ?", args: [req.params.id] });
  return res.status(201).json(updated.rows[0]);
});

/**
 * GET /api/goals/:id/forecast — projeção matemática (regressão linear
 * simples) de quando a meta deve ser concluída, com base no ritmo real
 * de progresso já registrado. Nunca inventa número: se não houver
 * histórico suficiente ou o ritmo não indicar avanço, devolve
 * forecast: null com um motivo em PT-BR (sempre 200, isso é um estado
 * normal, não um erro).
 */
goalsRouter.get("/:id/forecast", async (req, res) => {
  const db = getDb();
  const goal = await getOwnedGoal(db, req.params.id, req.user!.id);
  if (!goal) return res.status(404).json({ error: "Meta não encontrada." });

  const g = goal as unknown as {
    kind: string;
    status: string;
    target_value: number | null;
    current_value: number;
    due_date: string | null;
  };

  if (g.kind !== "numeric" && g.kind !== "percentage") {
    return res.json({ forecast: null, reason: "Previsão disponível apenas para metas numéricas ou de percentual." });
  }
  if (g.target_value === null || g.target_value === undefined) {
    return res.json({ forecast: null, reason: "Meta sem valor-alvo definido — não é possível projetar uma data." });
  }
  if (g.status === "done") {
    return res.json({ forecast: null, reason: "Meta já concluída." });
  }
  if (g.status === "abandoned") {
    return res.json({ forecast: null, reason: "Meta abandonada — sem projeção." });
  }

  const progressResult = await db.execute({
    sql: "SELECT value, recorded_at FROM goal_progress WHERE goal_id = ? ORDER BY recorded_at ASC",
    args: [req.params.id],
  });
  const progress = progressResult.rows as unknown as Array<{ value: number; recorded_at: string }>;

  if (progress.length < 2) {
    return res.json({ forecast: null, reason: "Ainda não há progresso suficiente registrado para projetar uma data." });
  }

  const first = progress[0];
  const last = progress[progress.length - 1];
  const elapsedDays = (new Date(last.recorded_at).getTime() - new Date(first.recorded_at).getTime()) / 86_400_000;

  // Precisa de pelo menos 2 dias de intervalo real entre o primeiro e o
  // último registro pra calcular um ritmo minimamente confiável.
  if (elapsedDays < 2) {
    return res.json({ forecast: null, reason: "Ainda não há progresso suficiente registrado para projetar uma data." });
  }

  const ratePerDay = (last.value - first.value) / elapsedDays;
  if (ratePerDay <= 0) {
    return res.json({ forecast: null, reason: "O ritmo atual não indica avanço — sem projeção possível." });
  }

  const daysRemaining = (g.target_value - g.current_value) / ratePerDay;
  const forecastDateObj = new Date();
  forecastDateObj.setUTCHours(0, 0, 0, 0);
  forecastDateObj.setUTCDate(forecastDateObj.getUTCDate() + Math.ceil(daysRemaining));
  const forecastDate = forecastDateObj.toISOString().slice(0, 10);

  let aheadOrBehindDays: number | null = null;
  if (g.due_date) {
    const due = new Date(g.due_date);
    due.setUTCHours(0, 0, 0, 0);
    aheadOrBehindDays = Math.round((due.getTime() - forecastDateObj.getTime()) / 86_400_000);
  }

  return res.json({
    forecast: {
      date: forecastDate,
      ratePerDay: Math.round(ratePerDay * 10_000) / 10_000,
      daysRemaining: Math.round(daysRemaining * 10) / 10,
      aheadOrBehindDays,
    },
    reason: null,
  });
});
