import { Router } from "express";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { changePct, computeInsights, computeLifeScore, computeRangeMetrics } from "../services/metricsService.js";

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** GET /api/analytics/life-score?date=YYYY-MM-DD */
analyticsRouter.get("/life-score", async (req, res) => {
  const date = (req.query.date as string) || isoDate(new Date());
  const score = await computeLifeScore(req.user!.id, date);
  return res.json(score);
});

/** Média diária real de sono/água num intervalo [from, to). */
async function sleepWaterAverages(ownerId: string, from: string, to: string) {
  const db = getDb();
  const [sleepAvg, waterAvg] = await Promise.all([
    db.execute({
      sql: "SELECT AVG(duration_minutes) AS avg_minutes FROM sleep_entries WHERE owner_id = ? AND date(went_to_bed_at) >= date(?) AND date(went_to_bed_at) < date(?)",
      args: [ownerId, from, to],
    }),
    db.execute({
      sql: "SELECT AVG(daily_total) AS avg_ml FROM (SELECT date(recorded_at) AS d, SUM(amount_ml) AS daily_total FROM water_entries WHERE owner_id = ? AND date(recorded_at) >= date(?) AND date(recorded_at) < date(?) GROUP BY d)",
      args: [ownerId, from, to],
    }),
  ]);
  return {
    avgSleepMinutes: Math.round(Number(sleepAvg.rows[0]?.avg_minutes ?? 0)),
    avgWaterMl: Math.round(Number(waterAvg.rows[0]?.avg_ml ?? 0)),
  };
}

/**
 * GET /api/analytics/overview?days=30 — totais do período + série diária de
 * tarefas concluídas + variação percentual real contra o período anterior de
 * mesma duração (nunca uma comparação inventada: sem base no período
 * anterior, a variação volta null e o front mostra "—").
 */
analyticsRouter.get("/overview", async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
  const ownerId = req.user!.id;
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - days);
  const fromStr = isoDate(from);
  const toStr = isoDate(to);
  // Limite exclusivo das consultas: precisa ser "amanhã" para o dia de HOJE
  // entrar no período — senão "últimos 30 dias" silenciosamente excluiria
  // tudo que aconteceu hoje.
  const toBoundary = new Date(to);
  toBoundary.setUTCDate(toBoundary.getUTCDate() + 1);
  const toBoundaryStr = isoDate(toBoundary);

  const prevTo = new Date(from);
  const prevFrom = new Date(from);
  prevFrom.setUTCDate(prevFrom.getUTCDate() - days);
  const prevFromStr = isoDate(prevFrom);
  const prevToStr = isoDate(prevTo);

  const db = getDb();
  const [metrics, previous, current, prevWater, tasksByDay, focusByDay, studyByDay, pagesByDay, workoutsByDay, habitsByDay, sleepByDay, waterByDay] = await Promise.all([
    computeRangeMetrics(ownerId, fromStr, toBoundaryStr),
    computeRangeMetrics(ownerId, prevFromStr, prevToStr),
    sleepWaterAverages(ownerId, fromStr, toBoundaryStr),
    sleepWaterAverages(ownerId, prevFromStr, prevToStr),
    db.execute({
      sql: `SELECT date(updated_at) AS day, COUNT(*) AS total FROM tasks
            WHERE owner_id = ? AND status = 'Concluído' AND date(updated_at) >= date(?)
            GROUP BY day ORDER BY day ASC`,
      args: [ownerId, fromStr],
    }),
    db.execute({
      sql: `SELECT date(started_at) AS day, COALESCE(SUM(actual_minutes), 0) AS total FROM focus_sessions
            WHERE owner_id = ? AND ended_at IS NOT NULL AND date(started_at) >= date(?)
            GROUP BY day ORDER BY day ASC`,
      args: [ownerId, fromStr],
    }),
    db.execute({
      sql: `SELECT date(fs.started_at) AS day, COALESCE(SUM(fs.actual_minutes), 0) AS total FROM focus_sessions fs
            JOIN tasks t ON t.id = fs.task_id JOIN projects p ON p.id = t.project_id
            WHERE fs.owner_id = ? AND p.kind = 'academic' AND fs.ended_at IS NOT NULL AND date(fs.started_at) >= date(?)
            GROUP BY day ORDER BY day ASC`,
      args: [ownerId, fromStr],
    }),
    db.execute({
      sql: `SELECT date(started_at) AS day, COALESCE(SUM(pages_read), 0) AS total FROM reading_sessions
            WHERE owner_id = ? AND date(started_at) >= date(?)
            GROUP BY day ORDER BY day ASC`,
      args: [ownerId, fromStr],
    }),
    db.execute({
      sql: `SELECT date(performed_at) AS day, COUNT(*) AS total FROM workouts
            WHERE owner_id = ? AND date(performed_at) >= date(?)
            GROUP BY day ORDER BY day ASC`,
      args: [ownerId, fromStr],
    }),
    db.execute({
      sql: `SELECT he.entry_date AS day, COUNT(*) AS total FROM habit_entries he JOIN habits h ON h.id = he.habit_id
            WHERE he.owner_id = ? AND h.archived_at IS NULL AND he.count >= h.target_count AND he.entry_date >= ?
            GROUP BY day ORDER BY day ASC`,
      args: [ownerId, fromStr],
    }),
    db.execute({
      sql: `SELECT date(went_to_bed_at) AS day, AVG(duration_minutes) AS total FROM sleep_entries
            WHERE owner_id = ? AND duration_minutes IS NOT NULL AND date(went_to_bed_at) >= date(?)
            GROUP BY day ORDER BY day ASC`,
      args: [ownerId, fromStr],
    }),
    db.execute({
      sql: `SELECT date(recorded_at) AS day, COALESCE(SUM(amount_ml), 0) AS total FROM water_entries
            WHERE owner_id = ? AND date(recorded_at) >= date(?)
            GROUP BY day ORDER BY day ASC`,
      args: [ownerId, fromStr],
    }),
  ]);

  // Preenche todos os dias do período (não só os que têm dado) para os
  // gráficos de linha ficarem contínuos — cada série vira um mapa por
  // data e depois é lida dia a dia, nunca um valor inventado (0 quando
  // não há registro naquele dia).
  const toMap = (rows: unknown[]) => new Map((rows as Array<{ day: string; total: number }>).map((r) => [r.day, Number(r.total)]));
  const tasksMap = toMap(tasksByDay.rows as unknown[]);
  const focusMap = toMap(focusByDay.rows as unknown[]);
  const studyMap = toMap(studyByDay.rows as unknown[]);
  const pagesMap = toMap(pagesByDay.rows as unknown[]);
  const workoutsMap = toMap(workoutsByDay.rows as unknown[]);
  const habitsMap = toMap(habitsByDay.rows as unknown[]);
  const sleepMap = toMap(sleepByDay.rows as unknown[]);
  const waterMap = toMap(waterByDay.rows as unknown[]);

  const allDays: string[] = [];
  const cursor = new Date(`${fromStr}T00:00:00Z`);
  const end = new Date(`${toStr}T00:00:00Z`);
  while (cursor <= end) {
    allDays.push(isoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const seriesFor = (map: Map<string, number>) => allDays.map((day) => ({ day: day.slice(5), total: map.get(day) ?? 0 }));

  const dailySeries = {
    tasks: seriesFor(tasksMap),
    focus: seriesFor(focusMap),
    study: seriesFor(studyMap),
    pages: seriesFor(pagesMap),
    workouts: seriesFor(workoutsMap),
    habits: seriesFor(habitsMap),
    sleep: seriesFor(sleepMap),
    water: seriesFor(waterMap),
  };

  // "Distribuição do tempo" — média de minutos/dia investidos em cada
  // área ativa no período, sempre a partir de somas reais já calculadas
  // acima (nunca uma proporção inventada). O sono fica de fora deste
  // gráfico de propósito: por ser muito maior em minutos que as demais
  // áreas, misturado no mesmo donut ele dominaria o gráfico e esconderia
  // a distribuição entre trabalho/estudo/leitura/exercício, que é o que
  // este card se propõe a mostrar — o sono já tem seu próprio card acima.
  const timeDistribution = {
    trabalho: Math.max(0, Math.round((metrics.focusMinutes - metrics.studyMinutes) / days)),
    estudo: Math.round(metrics.studyMinutes / days),
    leitura: Math.round(metrics.readingMinutes / days),
    exercicio: Math.round(metrics.workoutMinutes / days),
  };

  return res.json({
    ...metrics,
    ...current,
    to: toStr,
    tasksCompletedByDay: tasksByDay.rows,
    dailySeries,
    timeDistribution,
    changePct: {
      tasksCompleted: changePct(metrics.tasksCompleted, previous.tasksCompleted),
      focusMinutes: changePct(metrics.focusMinutes, previous.focusMinutes),
      studyMinutes: changePct(metrics.studyMinutes, previous.studyMinutes),
      pagesRead: changePct(metrics.pagesRead, previous.pagesRead),
      workouts: changePct(metrics.workouts, previous.workouts),
      // Diferença em pontos percentuais (não variação relativa) — evita um
      // "+925%" absurdo quando o período anterior tinha consistência perto
      // de zero; é a leitura natural para uma métrica que já é um %.
      habitsCompletionPct: metrics.habitsCompletionPct - previous.habitsCompletionPct,
      avgSleepMinutes: changePct(current.avgSleepMinutes, prevWater.avgSleepMinutes),
      avgWaterMl: changePct(current.avgWaterMl, prevWater.avgWaterMl),
    },
  });
});

/** GET /api/analytics/timeline?from=&to= — feed cronológico agregando vários módulos */
analyticsRouter.get("/timeline", async (req, res) => {
  const to = (req.query.to as string) || isoDate(new Date());
  const fromDefault = new Date(`${to}T00:00:00Z`);
  fromDefault.setUTCDate(fromDefault.getUTCDate() - 13);
  const from = (req.query.from as string) || isoDate(fromDefault);

  const db = getDb();
  const ownerId = req.user!.id;

  const [tasks, habitEntries, workouts, readingSessions, focusSessions, subjects, sleepEntries, moodEntries, waterEntries, workNotes, experimentsStarted, experimentsEnded] = await Promise.all([
    // LEFT JOIN com projects: deixa claro a que projeto (profissional,
    // acadêmico...) a tarefa concluída pertence, quando houver um.
    db.execute({
      sql: `SELECT t.id, t.title AS label, t.updated_at AS at, p.name AS project_name, p.kind AS project_kind
            FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
            WHERE t.owner_id = ? AND t.status = 'Concluído' AND date(t.updated_at) >= date(?) AND date(t.updated_at) <= date(?)`,
      args: [ownerId, from, to],
    }),
    db.execute({
      sql: `SELECT he.id, h.name AS label, he.count, he.created_at AS at FROM habit_entries he JOIN habits h ON h.id = he.habit_id
            WHERE he.owner_id = ? AND he.entry_date >= ? AND he.entry_date <= ? AND he.count >= h.target_count`,
      args: [ownerId, from, to],
    }),
    db.execute({
      sql: "SELECT id, kind AS label, performed_at AS at, distance_km, duration_minutes FROM workouts WHERE owner_id = ? AND date(performed_at) >= date(?) AND date(performed_at) <= date(?)",
      args: [ownerId, from, to],
    }),
    db.execute({
      sql: `SELECT rs.id, b.title AS label, rs.started_at AS at, rs.pages_read FROM reading_sessions rs JOIN books b ON b.id = rs.book_id
            WHERE rs.owner_id = ? AND date(rs.started_at) >= date(?) AND date(rs.started_at) <= date(?)`,
      args: [ownerId, from, to],
    }),
    db.execute({
      sql: "SELECT id, mode AS label, started_at AS at, actual_minutes FROM focus_sessions WHERE owner_id = ? AND ended_at IS NOT NULL AND date(started_at) >= date(?) AND date(started_at) <= date(?)",
      args: [ownerId, from, to],
    }),
    db.execute({
      sql: "SELECT id, name AS label, created_at AS at FROM subjects WHERE owner_id = ? AND status = 'Concluída' AND date(created_at) >= date(?) AND date(created_at) <= date(?)",
      args: [ownerId, from, to],
    }),
    db.execute({
      sql: "SELECT id, went_to_bed_at AS at, woke_up_at, duration_minutes, quality FROM sleep_entries WHERE owner_id = ? AND date(went_to_bed_at) >= date(?) AND date(went_to_bed_at) <= date(?)",
      args: [ownerId, from, to],
    }),
    db.execute({
      sql: "SELECT id, mood, energy, stress, recorded_at AS at FROM mood_entries WHERE owner_id = ? AND date(recorded_at) >= date(?) AND date(recorded_at) <= date(?)",
      args: [ownerId, from, to],
    }),
    db.execute({
      sql: "SELECT id, amount_ml, recorded_at AS at FROM water_entries WHERE owner_id = ? AND date(recorded_at) >= date(?) AND date(recorded_at) <= date(?)",
      args: [ownerId, from, to],
    }),
    db.execute({
      sql: "SELECT id, title AS label, content, COALESCE(created_at, occurred_at) AS at, occurred_at FROM work_notes WHERE owner_id = ? AND date(occurred_at) >= date(?) AND date(occurred_at) <= date(?)",
      args: [ownerId, from, to],
    }),
    // Experimentos Pessoais: só os marcos (início/conclusão/cancelamento), nunca um evento por
    // check-in diário — isso poluiria a Timeline (ver seção 50 do briefing de Experimentos).
    db.execute({
      sql: `SELECT id, title AS label, created_at AS at FROM personal_experiments
            WHERE owner_id = ? AND date(created_at) >= date(?) AND date(created_at) <= date(?)`,
      args: [ownerId, from, to],
    }),
    db.execute({
      sql: `SELECT id, title AS label, updated_at AS at, status FROM personal_experiments
            WHERE owner_id = ? AND status IN ('completed', 'cancelled') AND date(updated_at) >= date(?) AND date(updated_at) <= date(?)`,
      args: [ownerId, from, to],
    }),
  ]);

  type TimelineRow = Record<string, unknown> & { at: string };
  const asRows = (rows: unknown[]) => rows as unknown as TimelineRow[];

  const events = [
    ...asRows(tasks.rows).map((r) => ({ type: "task", icon: "✅", ...r })),
    ...asRows(habitEntries.rows).map((r) => ({ type: "habit", icon: "🔁", ...r })),
    ...asRows(workouts.rows).map((r) => ({ type: "workout", icon: "🏃", ...r })),
    ...asRows(readingSessions.rows).map((r) => ({ type: "reading", icon: "📚", ...r })),
    ...asRows(focusSessions.rows).map((r) => ({ type: "focus", icon: "🧠", ...r })),
    ...asRows(subjects.rows).map((r) => ({ type: "education", icon: "🎓", ...r })),
    ...asRows(sleepEntries.rows).map((r) => ({ type: "sleep", icon: "🌙", label: "Dormir", ...r })),
    ...asRows(moodEntries.rows).map((r) => ({ type: "mood", icon: "🙂", label: "Humor e energia", ...r })),
    ...asRows(waterEntries.rows).map((r) => ({ type: "water", icon: "💧", label: "Água", ...r })),
    ...asRows(workNotes.rows).map((r) => ({ type: "work_note", icon: "💼", ...r })),
    ...asRows(experimentsStarted.rows).map((r) => ({ type: "experiment", icon: "🧪", label: `Experimento iniciado: ${r.label}`, ...r })),
    ...asRows(experimentsEnded.rows).map((r) => ({
      type: "experiment",
      icon: "🧪",
      label: r.status === "completed" ? `Experimento concluído: ${r.label}` : `Experimento cancelado: ${r.label}`,
      ...r,
    })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at)));

  return res.json({ from, to, events });
});

/**
 * GET /api/analytics/insights?days=90 — correlações e padrões reais
 * (sono x produtividade do dia seguinte, humor x foco, melhor dia da
 * semana, melhor horário de foco). Nunca fabricado: sem amostra
 * mínima, os campos voltam null e o front trata como "sem dados
 * suficientes ainda" em vez de exibir um número inventado.
 */
analyticsRouter.get("/insights", async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 90, 7), 365);
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - days);
  const insights = await computeInsights(req.user!.id, isoDate(from), isoDate(to));
  return res.json(insights);
});
