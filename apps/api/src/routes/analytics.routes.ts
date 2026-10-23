import { itemDef } from "../config/items.js";
import { Router } from "express";
import { KNOWLEDGE, RELICS, TITLES } from "../config/codex.js";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { changePct, computeInsights, computeLifeScore, computeRangeMetrics, saveLifeScoreSnapshot } from "../services/metricsService.js";
import { getLevelHistory, getXpIndex } from "../services/gamificationService.js";
import { groupRowsByLocalDay, localDayOfStored, localDayRangeUtc, shiftDayKey, userDayContext } from "../services/localDayService.js";
import { utcRangeFilter } from "../services/healthService.js";
import { guildTimelineEvents } from "../services/guildService.js";
import { warCouncilTimelineEvents } from "../services/warCouncilService.js";

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * GET /api/analytics/life-score?date=YYYY-MM-DD
 * Quando é o score de HOJE, grava um snapshot diário em life_scores
 * (upsert — só o último cálculo do dia fica). É daí que sai a evolução
 * real do Life Score: parte das dimensões (produtividade, educação,
 * profissional) não pode ser recalculada para datas passadas, então o
 * histórico só existe a partir dos dias em que o score foi de fato visto.
 */
analyticsRouter.get("/life-score", async (req, res) => {
  const { today } = await userDayContext(getDb(), req.user!.id);
  const date = (req.query.date as string) || today;
  const score = await computeLifeScore(req.user!.id, date);
  if (date === today) {
    await saveLifeScoreSnapshot(req.user!.id, score).catch((err) => console.error("[life-score] falha ao salvar snapshot:", err));
  }
  return res.json(score);
});

/** GET /api/analytics/life-score/history?days=30 — snapshots diários reais (nunca interpolados). */
analyticsRouter.get("/life-score/history", async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 2), 180);
  const { today } = await userDayContext(getDb(), req.user!.id);
  const from = shiftDayKey(today, -(days - 1));
  const result = await getDb().execute({
    sql: `SELECT score_date, overall_score, productivity, health, education, reading, habits, professional, goals
          FROM life_scores WHERE owner_id = ? AND score_date >= ? ORDER BY score_date ASC`,
    args: [req.user!.id, from],
  });
  return res.json(
    (result.rows as unknown as Array<Record<string, number | string>>).map((r) => ({
      date: String(r.score_date),
      overall: Number(r.overall_score),
      productivity: Number(r.productivity ?? 0),
      health: Number(r.health ?? 0),
      education: Number(r.education ?? 0),
      reading: Number(r.reading ?? 0),
      habits: Number(r.habits ?? 0),
      professional: Number(r.professional ?? 0),
      goals: Number(r.goals ?? 0),
    }))
  );
});

/** Média diária real de sono/água num intervalo de dias locais [from, to). */
async function sleepWaterAverages(ownerId: string, from: string, to: string, tz: string) {
  const db = getDb();
  const start = localDayRangeUtc(from, tz).start;
  const end = localDayRangeUtc(to, tz).start;
  const sleepF = utcRangeFilter("went_to_bed_at", start, end);
  const waterF = utcRangeFilter("recorded_at", start, end);
  const [sleepAvg, waterRows] = await Promise.all([
    db.execute({
      sql: `SELECT AVG(duration_minutes) AS avg_minutes FROM sleep_entries WHERE owner_id = ? AND ${sleepF.sql}`,
      args: [ownerId, ...sleepF.args],
    }),
    db.execute({ sql: `SELECT recorded_at AS at, amount_ml AS v FROM water_entries WHERE owner_id = ? AND ${waterF.sql}`, args: [ownerId, ...waterF.args] }),
  ]);
  // Média por dia local com registro (mesma regra de antes, agora no fuso do usuário).
  const waterByDay = groupRowsByLocalDay(waterRows.rows, tz, "sum");
  const totals = [...waterByDay.values()];
  return {
    avgSleepMinutes: Math.round(Number(sleepAvg.rows[0]?.avg_minutes ?? 0)),
    avgWaterMl: totals.length > 0 ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0,
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
  const db = getDb();
  // Período em dias locais do usuário (o "hoje" UTC já virou às 21h em São Paulo).
  const { tz, today } = await userDayContext(db, ownerId);
  const toStr = today;
  const fromStr = shiftDayKey(today, -days);
  // Limite exclusivo das consultas: precisa ser "amanhã" para o dia de HOJE
  // entrar no período — senão "últimos 30 dias" silenciosamente excluiria
  // tudo que aconteceu hoje.
  const toBoundaryStr = shiftDayKey(today, 1);
  const prevFromStr = shiftDayKey(fromStr, -days);
  const prevToStr = fromStr;
  // Pré-filtro com 1 dia de folga; o agrupamento por dia local é feito em JS.
  const coarseFrom = shiftDayKey(fromStr, -1);

  const [metrics, previous, current, prevWater, tasksRows, pagesRows, workoutsRows, habitsByDay, sleepRows, waterRows] = await Promise.all([
    computeRangeMetrics(ownerId, fromStr, toBoundaryStr),
    computeRangeMetrics(ownerId, prevFromStr, prevToStr),
    sleepWaterAverages(ownerId, fromStr, toBoundaryStr, tz),
    sleepWaterAverages(ownerId, prevFromStr, prevToStr, tz),
    db.execute({
      // Data real da conclusão (completed_at); updated_at só como fallback de tarefas antigas —
      // editar uma tarefa concluída não pode "movê-la" para o dia da edição.
      sql: `SELECT COALESCE(completed_at, updated_at) AS at FROM tasks
            WHERE owner_id = ? AND status = 'Concluído' AND COALESCE(completed_at, updated_at) >= ?`,
      args: [ownerId, coarseFrom],
    }),
    db.execute({ sql: "SELECT started_at AS at, pages_read AS v FROM reading_sessions WHERE owner_id = ? AND started_at >= ?", args: [ownerId, coarseFrom] }),
    db.execute({ sql: "SELECT performed_at AS at FROM workouts WHERE owner_id = ? AND performed_at >= ?", args: [ownerId, coarseFrom] }),
    db.execute({
      sql: `SELECT he.entry_date AS day, COUNT(*) AS total FROM habit_entries he JOIN habits h ON h.id = he.habit_id
            WHERE he.owner_id = ? AND h.archived_at IS NULL AND he.count >= h.target_count AND he.entry_date >= ?
            GROUP BY day ORDER BY day ASC`,
      args: [ownerId, fromStr],
    }),
    db.execute({
      sql: "SELECT went_to_bed_at AS at, duration_minutes AS v FROM sleep_entries WHERE owner_id = ? AND duration_minutes IS NOT NULL AND went_to_bed_at >= ?",
      args: [ownerId, coarseFrom],
    }),
    db.execute({ sql: "SELECT recorded_at AS at, amount_ml AS v FROM water_entries WHERE owner_id = ? AND recorded_at >= ?", args: [ownerId, coarseFrom] }),
  ]);
  const inPeriod = (map: Map<string, number>) => new Map([...map].filter(([d]) => d >= fromStr));
  const tasksByDayMap = inPeriod(groupRowsByLocalDay(tasksRows.rows, tz, "count"));
  const tasksByDay = [...tasksByDayMap].sort(([a], [b]) => a.localeCompare(b)).map(([day, total]) => ({ day, total }));

  // Preenche todos os dias do período (não só os que têm dado) para os
  // gráficos de linha ficarem contínuos — cada série vira um mapa por
  // data e depois é lida dia a dia, nunca um valor inventado (0 quando
  // não há registro naquele dia).
  const toMap = (rows: unknown[]) => new Map((rows as Array<{ day: string; total: number }>).map((r) => [r.day, Number(r.total)]));
  const tasksMap = tasksByDayMap;
  const pagesMap = inPeriod(groupRowsByLocalDay(pagesRows.rows, tz, "sum"));
  const workoutsMap = inPeriod(groupRowsByLocalDay(workoutsRows.rows, tz, "count"));
  const habitsMap = toMap(habitsByDay.rows as unknown[]);
  const sleepMap = inPeriod(groupRowsByLocalDay(sleepRows.rows, tz, "avg"));
  const waterMap = inPeriod(groupRowsByLocalDay(waterRows.rows, tz, "sum"));

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
  // a distribuição entre leitura/exercício, que é o que este card se
  // propõe a mostrar — o sono já tem seu próprio card acima.
  const timeDistribution = {
    leitura: Math.round(metrics.readingMinutes / days),
    exercicio: Math.round(metrics.workoutMinutes / days),
  };

  return res.json({
    ...metrics,
    ...current,
    to: toStr,
    tasksCompletedByDay: tasksByDay,
    dailySeries,
    timeDistribution,
    changePct: {
      tasksCompleted: changePct(metrics.tasksCompleted, previous.tasksCompleted),
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

/**
 * Dia local de um evento da Timeline: check-ins de hábito, anotações de trabalho
 * e dias de recuperação pertencem ao dia registrado (não ao instante da gravação).
 */
function timelineDayOf(e: { at: string; type?: unknown; id?: unknown; entry_date?: unknown; occurred_at?: unknown }, tz: string): string {
  if (e.type === "habit" && typeof e.entry_date === "string") return e.entry_date;
  if (e.type === "work_note" && typeof e.occurred_at === "string") return localDayOfStored(e.occurred_at, tz);
  if (e.type === "recovery" && typeof e.id === "string" && e.id.startsWith("recovery-")) return e.id.slice("recovery-".length);
  return localDayOfStored(String(e.at ?? ""), tz);
}

/** GET /api/analytics/timeline?from=&to= — feed cronológico agregando vários módulos */
analyticsRouter.get("/timeline", async (req, res) => {
  const db = getDb();
  const ownerId = req.user!.id;
  // Dias locais do usuário; as consultas usam 1 dia de folga em cada ponta
  // (timestamps são UTC) e o recorte exato é feito depois, no fuso do perfil.
  const { tz, today } = await userDayContext(db, ownerId);
  const to = (req.query.to as string) || today;
  const from = (req.query.from as string) || shiftDayKey(to, -13);
  const qFrom = shiftDayKey(from, -1);
  const qTo = shiftDayKey(to, 1);

  const [tasks, habitEntries, workouts, readingSessions, subjects, sleepEntries, moodEntries, waterEntries, workNotes, experimentsStarted, experimentsEnded, journalEntries, lifeAdminDone, periodicReviews] = await Promise.all([
    // LEFT JOIN com projects: deixa claro a que projeto (profissional,
    // acadêmico...) a tarefa concluída pertence, quando houver um.
    db.execute({
      sql: `SELECT t.id, t.title AS label, t.updated_at AS at, p.name AS project_name, p.kind AS project_kind
            FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
            WHERE t.owner_id = ? AND t.status = 'Concluído' AND t.updated_at >= date(?) AND t.updated_at < date(?, '+1 day')`,
      args: [ownerId, qFrom, qTo],
    }),
    db.execute({
      sql: `SELECT he.id, he.habit_id, he.entry_date, h.name AS label, he.count, he.created_at AS at FROM habit_entries he JOIN habits h ON h.id = he.habit_id
            WHERE he.owner_id = ? AND he.entry_date >= ? AND he.entry_date <= ? AND he.count >= h.target_count`,
      args: [ownerId, qFrom, qTo],
    }),
    db.execute({
      sql: "SELECT id, kind AS label, performed_at AS at, distance_km, duration_minutes FROM workouts WHERE owner_id = ? AND performed_at >= date(?) AND performed_at < date(?, '+1 day')",
      args: [ownerId, qFrom, qTo],
    }),
    db.execute({
      sql: `SELECT rs.id, b.title AS label, rs.started_at AS at, rs.pages_read FROM reading_sessions rs JOIN books b ON b.id = rs.book_id
            WHERE rs.owner_id = ? AND rs.started_at >= date(?) AND rs.started_at < date(?, '+1 day')`,
      args: [ownerId, qFrom, qTo],
    }),
    db.execute({
      sql: "SELECT id, name AS label, created_at AS at FROM subjects WHERE owner_id = ? AND status = 'Concluída' AND created_at >= date(?) AND created_at < date(?, '+1 day')",
      args: [ownerId, qFrom, qTo],
    }),
    db.execute({
      sql: "SELECT id, went_to_bed_at AS at, woke_up_at, duration_minutes, quality FROM sleep_entries WHERE owner_id = ? AND went_to_bed_at >= date(?) AND went_to_bed_at < date(?, '+1 day')",
      args: [ownerId, qFrom, qTo],
    }),
    db.execute({
      sql: "SELECT id, mood, energy, stress, recorded_at AS at FROM mood_entries WHERE owner_id = ? AND recorded_at >= date(?) AND recorded_at < date(?, '+1 day')",
      args: [ownerId, qFrom, qTo],
    }),
    db.execute({
      sql: "SELECT id, amount_ml, recorded_at AS at FROM water_entries WHERE owner_id = ? AND recorded_at >= date(?) AND recorded_at < date(?, '+1 day')",
      args: [ownerId, qFrom, qTo],
    }),
    db.execute({
      sql: "SELECT id, title AS label, content, COALESCE(created_at, occurred_at) AS at, occurred_at FROM work_notes WHERE owner_id = ? AND occurred_at >= date(?) AND occurred_at < date(?, '+1 day')",
      args: [ownerId, qFrom, qTo],
    }),
    // Experimentos Pessoais: só os marcos (início/conclusão/cancelamento), nunca um evento por
    // check-in diário — isso poluiria a Timeline (ver seção 50 do briefing de Experimentos).
    db.execute({
      sql: `SELECT id, title AS label, created_at AS at FROM personal_experiments
            WHERE owner_id = ? AND created_at >= date(?) AND created_at < date(?, '+1 day')`,
      args: [ownerId, qFrom, qTo],
    }),
    db.execute({
      sql: `SELECT id, title AS label, updated_at AS at, status FROM personal_experiments
            WHERE owner_id = ? AND status IN ('completed', 'cancelled') AND updated_at >= date(?) AND updated_at < date(?, '+1 day')`,
      args: [ownerId, qFrom, qTo],
    }),
    db.execute({
      sql: `SELECT id, entry_date AS at FROM journal_entries
            WHERE owner_id = ? AND entry_date >= date(?) AND entry_date < date(?, '+1 day')
            AND (COALESCE(thoughts, '') != '' OR COALESCE(intention, '') != '')`,
      args: [ownerId, qFrom, qTo],
    }),
    db.execute({
      sql: `SELECT h.id, h.item_id, h.due_date, i.title AS label, i.kind, h.done_at AS at FROM life_admin_history h JOIN life_admin_items i ON i.id = h.item_id
            WHERE h.owner_id = ? AND h.done_at >= ? AND h.done_at <= ?`,
      args: [ownerId, qFrom, qTo],
    }),
    db.execute({
      sql: "SELECT id, kind, period_key, updated_at AS at FROM periodic_reviews WHERE owner_id = ? AND updated_at >= date(?) AND updated_at < date(?, '+1 day')",
      args: [ownerId, qFrom, qTo],
    }),
  ]);

  // Crônica da jornada: marcos do motor de gamificação e sessões de foco,
  // todos lidos de registros reais (nunca derivados de suposição).
  const [focusEntries, projectsDone, achievementsUnlocked, customUnlocked, redemptions, levelUps, xpIndex, contractsDone, campaignEvents, codexUnlocks, codexDiscoveries] = await Promise.all([
    db.execute({
      sql: `SELECT te.id, te.ended_at AS at, te.duration_minutes, t.title AS label FROM time_entries te LEFT JOIN tasks t ON t.id = te.task_id
            WHERE te.owner_id = ? AND te.ended_at IS NOT NULL AND COALESCE(te.duration_minutes, 0) > 0
              AND te.ended_at >= date(?) AND te.ended_at < date(?, '+1 day')`,
      args: [ownerId, qFrom, qTo],
    }),
    db.execute({
      sql: "SELECT id, name AS label, completed_at AS at FROM projects WHERE owner_id = ? AND status = 'completed' AND completed_at IS NOT NULL AND completed_at >= date(?) AND completed_at < date(?, '+1 day')",
      args: [ownerId, qFrom, qTo],
    }),
    db.execute({
      sql: `SELECT ua.id, ua.achievement_id, a.title AS label, a.description, a.tier, ua.unlocked_at AS at FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id
            WHERE ua.owner_id = ? AND ua.unlocked_at >= date(?) AND ua.unlocked_at < date(?, '+1 day')`,
      args: [ownerId, qFrom, qTo],
    }),
    db.execute({
      sql: "SELECT id, title AS label, description, icon AS emoji, unlocked_at AS at FROM custom_achievements WHERE owner_id = ? AND unlocked_at IS NOT NULL AND unlocked_at >= date(?) AND unlocked_at < date(?, '+1 day')",
      args: [ownerId, qFrom, qTo],
    }),
    db.execute({
      sql: "SELECT id, reward_name AS label, cost, redeemed_at AS at FROM reward_redemptions WHERE owner_id = ? AND redeemed_at >= date(?) AND redeemed_at < date(?, '+1 day')",
      args: [ownerId, qFrom, qTo],
    }),
    getLevelHistory(db, ownerId),
    getXpIndex(db, ownerId, from, to),
    db.execute({
      sql: "SELECT id, title AS label, completed_at AS at FROM contracts WHERE owner_id = ? AND status = 'concluido' AND completed_at IS NOT NULL AND completed_at >= date(?) AND completed_at < date(?, '+1 day')",
      args: [ownerId, qFrom, qTo],
    }),
    db.execute({
      sql: "SELECT id, campaign_id, kind, ref_id, label, created_at AS at FROM campaign_events WHERE owner_id = ? AND kind != 'archived' AND created_at >= date(?) AND created_at < date(?, '+1 day')",
      args: [ownerId, qFrom, qTo],
    }),
    db.execute({
      sql: "SELECT kind, item_id, unlocked_at AS at FROM codex_unlocks WHERE owner_id = ? AND unlocked_at >= date(?) AND unlocked_at < date(?, '+1 day')",
      args: [ownerId, qFrom, qTo],
    }),
    db.execute({
      sql: "SELECT id, title, discovered_at AS at FROM codex_discoveries WHERE owner_id = ? AND status = 'active' AND discovered_at >= date(?) AND discovered_at < date(?, '+1 day')",
      args: [ownerId, qFrom, qTo],
    }),
  ]);
  // Tesouro: recompensa criada, recompensa usada e gemas obtidas (sugestões recusadas da IA nunca entram).
  const [rewardsCreated, rewardsUsed, gemsEarned] = await Promise.all([
    db.execute({
      sql: "SELECT id, name AS label, created_at AS at FROM rewards WHERE owner_id = ? AND created_at >= date(?) AND created_at < date(?, '+1 day')",
      args: [ownerId, qFrom, qTo],
    }),
    db.execute({
      sql: "SELECT id, reward_name AS label, used_at AS at FROM reward_redemptions WHERE owner_id = ? AND status = 'used' AND used_at IS NOT NULL AND used_at >= date(?) AND used_at < date(?, '+1 day')",
      args: [ownerId, qFrom, qTo],
    }),
    db.execute({
      sql: "SELECT id, label, amount, created_at AS at FROM gem_ledger WHERE owner_id = ? AND amount > 0 AND created_at >= date(?) AND created_at < date(?, '+1 day')",
      args: [ownerId, qFrom, qTo],
    }),
  ]);
  // Protocolos (execuções reais, nunca simples visualização) e dias de recuperação.
  const [protocolRuns, recoveryDays] = await Promise.all([
    db.execute({
      sql: "SELECT id, protocol_name AS label, status, COALESCE(completed_at, started_at) AS at FROM protocol_runs WHERE owner_id = ? AND status != 'canceled' AND started_at >= date(?) AND started_at < date(?, '+1 day')",
      args: [ownerId, qFrom, qTo],
    }),
    db.execute({ sql: "SELECT day_key, created_at AS at FROM recovery_days WHERE owner_id = ? AND day_key >= ? AND day_key <= ?", args: [ownerId, qFrom, qTo] }),
  ]);
  // Inventário: aquisições de itens próprios, usos, cosméticos equipados e conjuntos completos.
  // Relíquias/títulos (Códex) e cupons (Tesouro) já aparecem pela fonte original.
  const inventoryTx = await db.execute({
    sql: `SELECT id, item_key, type, source_type, label, created_at AS at FROM inventory_transactions
          WHERE owner_id = ? AND type IN ('acquire', 'use', 'equip')
            AND item_key NOT LIKE 'relic:%' AND item_key NOT LIKE 'title:%' AND NOT (type = 'acquire' AND item_key LIKE 'voucher:%')
            AND NOT (type = 'use' AND item_key LIKE 'voucher:%')
            AND created_at >= date(?) AND created_at < date(?, '+1 day')`,
    args: [ownerId, qFrom, qTo],
  });
  // Temporadas mensais: só o fechamento (resumo gravado de forma preguiçosa no mês seguinte).
  const seasonsClosed = await db.execute({
    sql: "SELECT id, name AS label, xp, tier, quests_completed, closed_at AS at FROM season_summaries WHERE owner_id = ? AND closed_at >= date(?) AND closed_at < date(?, '+1 day')",
    args: [ownerId, qFrom, qTo],
  });
  const codexName = (kind: string, id: string) =>
    (kind === "relic" ? RELICS.find((r) => r.id === id)?.name : kind === "title" ? TITLES.find((t) => t.id === id)?.name : KNOWLEDGE.find((k) => k.id === id)?.title) ?? id;
  const CODEX_KIND: Record<string, string> = { relic: "Relíquia descoberta", title: "Novo título", knowledge: "Conhecimento desbloqueado" };

  // Grimório: só o marco "estudo do dia concluído" (um por dia), nunca cada revisão.
  const grimoireDays = await db.execute({
    sql: "SELECT source_id, label, xp, created_at AS at FROM xp_events WHERE owner_id = ? AND source_type = 'grimoire' AND event_type = 'queue_cleared' AND day_key >= ? AND day_key <= ?",
    args: [ownerId, qFrom, qTo],
  });

  type TimelineRow = Record<string, unknown> & { at: string };
  const asRows = (rows: unknown[]) => rows as unknown as TimelineRow[];
  // Guilda: parceiro aceitou (1 evento) e testemunhos agrupados por dia (sem spam).
  const guildEvents = await guildTimelineEvents(db, ownerId, qFrom, qTo);
  // Conselho de Guerra: um evento por plano semanal selado.
  const warCouncilEvents = await warCouncilTimelineEvents(db, ownerId, qFrom, qTo);

  const events = [
    ...guildEvents,
    ...warCouncilEvents,
    ...asRows(tasks.rows).map((r) => ({ type: "task", icon: "✅", ...r })),
    ...asRows(habitEntries.rows).map((r) => ({ type: "habit", icon: "🔁", ...r })),
    ...asRows(workouts.rows).map((r) => ({ type: "workout", icon: "🏃", ...r })),
    ...asRows(readingSessions.rows).map((r) => ({ type: "reading", icon: "📚", ...r })),
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
    ...asRows(journalEntries.rows).map((r) => ({ type: "journal", icon: "📔", label: "Entrada do diário", ...r })),
    ...asRows(lifeAdminDone.rows).map((r) => ({
      type: "life_admin",
      icon: r.kind === "conta" ? "🧾" : r.kind === "manutencao" ? "🔧" : "📄",
      ...r,
      label: `${r.kind === "conta" ? "Conta paga" : r.kind === "manutencao" ? "Manutenção feita" : "Renovado"}: ${r.label}`,
    })),
    ...asRows(periodicReviews.rows).map((r) => ({
      type: "review",
      icon: "🧭",
      ...r,
      label: `Revisão ${r.kind === "monthly" ? "mensal" : r.kind === "quarterly" ? "trimestral" : "anual"} (${r.period_key})`,
    })),
    ...asRows(focusEntries.rows).map((r) => ({ type: "focus", icon: "⏱️", ...r, label: r.label ? String(r.label) : "Sessão de trabalho" })),
    ...asRows(projectsDone.rows).map((r) => ({ type: "project", icon: "🏰", ...r })),
    ...asRows(achievementsUnlocked.rows).map((r) => ({ type: "achievement", icon: "🏆", ...r })),
    ...asRows(customUnlocked.rows).map((r) => ({ type: "achievement", icon: "🏆", ...r, id: `custom-${r.id}` })),
    ...asRows(redemptions.rows).map((r) => ({ type: "reward", icon: "🎁", ...r, label: `Recompensa resgatada: ${String(r.label)}` })),
    ...asRows(rewardsCreated.rows).map((r) => ({ type: "reward", icon: "🪙", ...r, id: `reward-new-${String(r.id)}`, label: `Recompensa criada: ${String(r.label)}` })),
    ...asRows(rewardsUsed.rows).map((r) => ({ type: "reward", icon: "✨", ...r, id: `reward-used-${String(r.id)}`, label: `Recompensa utilizada: ${String(r.label)}` })),
    ...asRows(gemsEarned.rows).map((r) => ({ type: "reward", icon: "💎", ...r, id: `gem-${String(r.id)}`, label: `+${String(r.amount)} gema${Number(r.amount) > 1 ? "s" : ""}: ${String(r.label ?? "marco especial")}` })),
    ...asRows(campaignEvents.rows).map((r) => ({ type: "campaign", icon: "⚒️", ...r })),
    ...asRows(codexUnlocks.rows).map((r) => ({
      type: "codex",
      icon: "📜",
      id: `codex-${String(r.kind)}-${String(r.item_id)}`,
      kind: r.kind,
      label: `${CODEX_KIND[String(r.kind)] ?? "Códex"}: ${codexName(String(r.kind), String(r.item_id))}`,
      at: r.at,
    })),
    ...asRows(codexDiscoveries.rows).map((r) => ({ type: "codex", icon: "📜", id: `codex-disc-${String(r.id)}`, kind: "discovery", label: `Nova descoberta: ${String(r.title)}`, at: r.at })),
    ...asRows(inventoryTx.rows).map((r) => {
      const key = String(r.item_key);
      const name = itemDef(key)?.name ?? (String(r.label ?? "").split(": ").slice(1).join(": ") || key);
      const label =
        r.source_type === "set" ? String(r.label) : r.type === "use" ? `Item usado: ${name}` : r.type === "equip" ? `Cosmético equipado: ${key.startsWith("frame:") ? "moldura" : key.startsWith("title:") ? "título" : key.startsWith("emblem:") ? "emblema" : name}` : `Item adquirido: ${name}`;
      return { type: "inventory", icon: r.source_type === "set" ? "🏅" : r.type === "use" ? "🧪" : r.type === "equip" ? "🎽" : "🎒", id: `inv-${String(r.id)}`, label, at: r.at };
    }),
    ...asRows(protocolRuns.rows).map((r) => ({
      type: "protocol",
      icon: "📜",
      id: `protocol-${String(r.id)}`,
      label: `${r.status === "completed" ? "Protocolo concluído" : r.status === "partial" ? "Protocolo parcialmente executado" : "Protocolo iniciado"}: ${String(r.label)}`,
      at: r.at,
    })),
    ...asRows(seasonsClosed.rows).map((r) => ({
      type: "season",
      icon: "🏆",
      id: `season-${String(r.id)}`,
      label: `${String(r.label)} encerrada: ${Number(r.xp)} XP, tier ${Number(r.tier)}, ${Number(r.quests_completed)} quests`,
      at: r.at,
    })),
    ...asRows(recoveryDays.rows).map((r) => ({ type: "recovery", icon: "🌙", id: `recovery-${String(r.day_key)}`, label: "Modo recuperação ativado", at: r.at })),
    ...asRows(grimoireDays.rows).map((r) => ({ type: "grimoire", icon: "📖", id: `grimoire-${String(r.source_id)}`, label: String(r.label), xp: Number(r.xp), at: r.at })),
    ...asRows(contractsDone.rows).map((r) => ({ type: "contract", icon: "📜", ...r, label: `Contrato cumprido: ${String(r.label)}` })),
    ...levelUps
      .filter((l) => l.dayKey >= from && l.dayKey <= to)
      .map((l) => ({ type: "level_up", icon: "👑", id: `level-${l.level}`, label: `Nível ${l.level}`, level: l.level, at: l.reachedAt })),
  ]
    .filter((e) => {
      const day = timelineDayOf(e as unknown as TimelineRow & { type?: unknown; id?: unknown; entry_date?: unknown; occurred_at?: unknown }, tz);
      return day >= from && day <= to;
    })
    .map((e) => ({ ...e, ...xpFor(e as unknown as TimelineRow & { type: string; id: unknown }) }))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));

  // XP/moedas reais de cada evento: casa a origem do evento com a chave do ledger.
  function xpFor(e: TimelineRow & { type: string; id: unknown }): { xp?: number; coins?: number } {
    const key =
      e.type === "task" ? `task:${e.id}`
      : e.type === "habit" ? `habit_entry:${e.habit_id}:${e.entry_date}`
      : e.type === "focus" ? `focus:${e.id}`
      : e.type === "project" ? `project:${e.id}`
      : e.type === "journal" ? `journal:${String(e.at).slice(0, 10)}`
      : e.type === "review" ? `review:${e.kind}:${e.period_key}`
      : e.type === "life_admin" ? `life_admin:${e.item_id}:${e.due_date}`
      : e.type === "achievement" && e.achievement_id ? `achievement:${e.achievement_id}`
      : e.type === "contract" ? `contract:${e.id}`
      : e.type === "campaign" && e.kind === "milestone" ? `campaign:${e.campaign_id}:${e.ref_id}`
      : e.type === "campaign" && e.kind === "completed" ? `campaign:${e.campaign_id}`
      : null;
    const hit = key ? xpIndex.bySource[key] : undefined;
    return hit && hit.xp > 0 ? { xp: hit.xp, coins: hit.coins } : {};
  }

  // XP por dia inclui os bônus do dia (primeira missão, dia completo).
  return res.json({ from, to, events, xpByDay: xpIndex.byDay });
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
  const { today } = await userDayContext(getDb(), req.user!.id);
  const insights = await computeInsights(req.user!.id, shiftDayKey(today, -days), today);
  return res.json(insights);
});
