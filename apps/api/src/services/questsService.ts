import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { award, todayKeyFor, userTimezone } from "./gamificationService.js";
import { addDays, collectDailyMetrics, sumRange, type DailyMetric } from "./dailyMetricsService.js";
import { weekStartOf } from "./recordsService.js";
import {
  QUEST_RULES,
  QUEST_TEMPLATES,
  drawQuests,
  drawReplacement,
  periodRange,
  templateByKey,
  type QuestPeriod,
  type RecentTotals,
} from "./questRules.js";
import { getSeason, type SeasonView } from "./seasonsService.js";

/**
 * Quadro de Quests. As quests do período são sorteadas uma única vez e
 * persistidas (quest_assignments); o progresso é sempre recalculado das
 * fontes originais dentro do período, no fuso do usuário. O reset é
 * natural: um novo dia/semana local gera um novo period_key.
 */

export interface QuestView {
  id: string;
  period: QuestPeriod;
  periodKey: string;
  templateKey: string;
  title: string;
  module: string;
  unit: string | null;
  target: number;
  progress: number;
  xpReward: number;
  completed: boolean;
  claimed: boolean;
  claimedAt: string | null;
  canReroll: boolean;
}

export interface QuestBoard {
  today: string;
  timezone: string;
  daily: {
    periodKey: string;
    quests: QuestView[];
    rerollsLeft: number;
    bonus: { xp: number; claimed: boolean; completed: number; total: number };
  };
  weekly: { periodKey: string; to: string; daysLeft: number; quests: QuestView[] };
  season: SeasonView;
}

export class QuestError extends Error {
  constructor(
    public status: 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

interface AssignmentRow {
  id: string;
  period: QuestPeriod;
  periodKey: string;
  templateKey: string;
  target: number;
  xpReward: number;
  claimedAt: string | null;
  replacedAt: string | null;
}

const toRow = (r: Record<string, unknown>): AssignmentRow => ({
  id: String(r.id),
  period: r.period === "weekly" ? "weekly" : "daily",
  periodKey: String(r.period_key),
  templateKey: String(r.template_key),
  target: Number(r.target),
  xpReward: Number(r.xp_reward),
  claimedAt: r.claimed_at == null ? null : String(r.claimed_at),
  replacedAt: r.replaced_at == null ? null : String(r.replaced_at),
});

const DAILY_BONUS_SOURCE = (dayKey: string) => `daily:${dayKey}`;

/** Totais das métricas nos 30 dias anteriores ao início do período (base do sorteio). */
async function recentTotals(db: Client, ownerId: string, tz: string, periodStart: string): Promise<RecentTotals> {
  const metrics = [...new Set(QUEST_TEMPLATES.map((t) => t.metric))];
  const from = addDays(periodStart, -QUEST_RULES.lookbackDays);
  const to = addDays(periodStart, -1);
  const series = await collectDailyMetrics(db, ownerId, { from, to, tz, metrics });
  return Object.fromEntries(metrics.map((m) => [m, sumRange(series[m], from, to)])) as RecentTotals;
}

async function loadRows(db: Client, ownerId: string, period: QuestPeriod, periodKey: string): Promise<AssignmentRow[]> {
  const r = await db.execute({
    sql: "SELECT * FROM quest_assignments WHERE owner_id = ? AND period = ? AND period_key = ? ORDER BY created_at ASC, rowid ASC",
    args: [ownerId, period, periodKey],
  });
  return r.rows.map((x) => toRow(x as unknown as Record<string, unknown>));
}

/**
 * Garante as quests do período (sorteio determinístico + INSERT OR IGNORE:
 * duas abas abrindo ao mesmo tempo geram exatamente as mesmas linhas).
 */
async function ensurePeriod(db: Client, ownerId: string, tz: string, period: QuestPeriod, periodKey: string): Promise<AssignmentRow[]> {
  const existing = await loadRows(db, ownerId, period, periodKey);
  if (existing.length > 0) return existing;
  const recent = await recentTotals(db, ownerId, tz, periodKey);
  const planned = drawQuests(ownerId, period, periodKey, recent);
  await db.batch(
    planned.map((p) => ({
      sql: `INSERT OR IGNORE INTO quest_assignments (id, owner_id, period, period_key, template_key, target, xp_reward) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [nanoid(), ownerId, period, periodKey, p.templateKey, p.target, p.xpReward],
    })),
    "write",
  );
  return loadRows(db, ownerId, period, periodKey);
}

const active = (rows: AssignmentRow[]) => rows.filter((r) => !r.replacedAt);

/** Progresso real de cada quest dentro do próprio período (até hoje). */
async function progressFor(db: Client, ownerId: string, tz: string, rows: AssignmentRow[], today: string): Promise<Map<string, number>> {
  const metrics = [...new Set(rows.map((r) => templateByKey(r.templateKey)?.metric).filter((m): m is DailyMetric => !!m))];
  const out = new Map<string, number>();
  if (rows.length === 0 || metrics.length === 0) return out;
  const from = rows.reduce((min, r) => (periodRange(r.period, r.periodKey).from < min ? periodRange(r.period, r.periodKey).from : min), today);
  const series = await collectDailyMetrics(db, ownerId, { from, to: today, tz, metrics });
  for (const r of rows) {
    const t = templateByKey(r.templateKey);
    if (!t) continue;
    const range = periodRange(r.period, r.periodKey);
    out.set(r.id, sumRange(series[t.metric], range.from, range.to < today ? range.to : today));
  }
  return out;
}

function toView(r: AssignmentRow, progress: number, canReroll: boolean): QuestView {
  const t = templateByKey(r.templateKey);
  const completed = progress >= r.target;
  return {
    id: r.id,
    period: r.period,
    periodKey: r.periodKey,
    templateKey: r.templateKey,
    title: t ? t.title(r.target) : "Quest indisponível",
    module: t?.module ?? "missions",
    unit: t?.unit ?? null,
    target: r.target,
    progress,
    xpReward: r.xpReward,
    completed,
    claimed: r.claimedAt !== null,
    claimedAt: r.claimedAt,
    canReroll: canReroll && r.period === "daily" && !completed && r.claimedAt === null,
  };
}

async function dailyBonusClaimed(db: Client, ownerId: string, dayKey: string): Promise<boolean> {
  const r = await db.execute({
    sql: "SELECT 1 FROM xp_events WHERE owner_id = ? AND source_type = 'quest' AND source_id = ? AND event_type = 'all_daily' LIMIT 1",
    args: [ownerId, DAILY_BONUS_SOURCE(dayKey)],
  });
  return r.rows.length > 0;
}

async function context(db: Client, ownerId: string) {
  const [today, tz] = await Promise.all([todayKeyFor(db, ownerId), userTimezone(db, ownerId)]);
  return { today, tz, weekKey: weekStartOf(today) };
}

export async function getQuestBoard(db: Client, ownerId: string): Promise<QuestBoard> {
  const { today, tz, weekKey } = await context(db, ownerId);
  const [dailyRows, weeklyRows] = await Promise.all([ensurePeriod(db, ownerId, tz, "daily", today), ensurePeriod(db, ownerId, tz, "weekly", weekKey)]);
  const dailyActive = active(dailyRows);
  const weeklyActive = active(weeklyRows);
  const [progress, bonusClaimed, season] = await Promise.all([
    progressFor(db, ownerId, tz, [...dailyActive, ...weeklyActive], today),
    dailyBonusClaimed(db, ownerId, today),
    getSeason(db, ownerId, today),
  ]);
  const rerollsLeft = Math.max(0, QUEST_RULES.dailyRerolls - dailyRows.filter((r) => r.replacedAt).length);
  const daily = dailyActive.map((r) => toView(r, progress.get(r.id) ?? 0, rerollsLeft > 0));
  const weekTo = periodRange("weekly", weekKey).to;
  return {
    today,
    timezone: tz,
    daily: {
      periodKey: today,
      quests: daily,
      rerollsLeft,
      bonus: { xp: QUEST_RULES.allDailyBonusXp, claimed: bonusClaimed, completed: daily.filter((q) => q.claimed).length, total: daily.length },
    },
    weekly: {
      periodKey: weekKey,
      to: weekTo,
      daysLeft: Math.round((Date.parse(`${weekTo}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000),
      quests: weeklyActive.map((r) => toView(r, progress.get(r.id) ?? 0, false)),
    },
    season,
  };
}

async function loadOwned(db: Client, ownerId: string, id: string): Promise<AssignmentRow> {
  const r = await db.execute({ sql: "SELECT * FROM quest_assignments WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  if (!r.rows[0]) throw new QuestError(404, "Quest não encontrada.");
  return toRow(r.rows[0] as unknown as Record<string, unknown>);
}

const isCurrent = (row: AssignmentRow, today: string, weekKey: string) => row.periodKey === (row.period === "daily" ? today : weekKey);

export interface ClaimResult {
  questId: string;
  xp: number;
  bonusXp: number;
  replayed: boolean;
}

/**
 * Resgata a recompensa de uma quest concluída. Idempotente: o XP usa a
 * chave (quest, id, claim) do ledger e o claimed_at só é gravado uma vez.
 * Ao resgatar a última das 3 diárias, concede o bônus do dia (também idempotente).
 */
export async function claimQuest(db: Client, ownerId: string, id: string): Promise<ClaimResult> {
  const row = await loadOwned(db, ownerId, id);
  if (row.replacedAt) throw new QuestError(409, "Esta quest foi trocada e não pode mais ser resgatada.");
  if (row.claimedAt) return { questId: id, xp: 0, bonusXp: 0, replayed: true };
  const { today, tz, weekKey } = await context(db, ownerId);
  if (!isCurrent(row, today, weekKey)) throw new QuestError(409, "Esta quest expirou com o fim do período.");
  const progress = (await progressFor(db, ownerId, tz, [row], today)).get(row.id) ?? 0;
  if (progress < row.target) throw new QuestError(409, "A quest ainda não foi concluída.");

  const t = templateByKey(row.templateKey);
  const granted = await award(
    db,
    ownerId,
    { sourceType: "quest", sourceId: row.id, eventType: "claim", xp: row.xpReward, coins: 0, label: `Quest ${row.period === "daily" ? "diária" : "semanal"}: ${t ? t.title(row.target) : row.templateKey}` },
    today,
  );
  await db.execute({ sql: "UPDATE quest_assignments SET claimed_at = datetime('now') WHERE id = ? AND owner_id = ? AND claimed_at IS NULL", args: [row.id, ownerId] });

  let bonusXp = 0;
  if (row.period === "daily") {
    const dailyActive = active(await loadRows(db, ownerId, "daily", today));
    if (dailyActive.length > 0 && dailyActive.every((q) => q.claimedAt !== null)) {
      const bonus = await award(
        db,
        ownerId,
        { sourceType: "quest", sourceId: DAILY_BONUS_SOURCE(today), eventType: "all_daily", xp: QUEST_RULES.allDailyBonusXp, coins: 0, label: "Quadro de Quests: todas as diárias cumpridas" },
        today,
      );
      if (bonus) bonusXp = QUEST_RULES.allDailyBonusXp;
    }
  }
  return { questId: row.id, xp: granted ? row.xpReward : 0, bonusXp, replayed: !granted };
}

/**
 * Troca (reroll) de uma quest diária não concluída — limite de trocas por dia.
 * O limite é verificado na própria escrita (UPDATE condicional), à prova de clique duplo.
 */
export async function rerollQuest(db: Client, ownerId: string, id: string): Promise<QuestView> {
  const row = await loadOwned(db, ownerId, id);
  const { today, tz, weekKey } = await context(db, ownerId);
  if (row.period !== "daily") throw new QuestError(409, "Só quests diárias podem ser trocadas.");
  if (row.replacedAt || row.claimedAt || !isCurrent(row, today, weekKey)) throw new QuestError(409, "Esta quest não pode mais ser trocada.");
  const progress = (await progressFor(db, ownerId, tz, [row], today)).get(row.id) ?? 0;
  if (progress >= row.target) throw new QuestError(409, "Quest já concluída — resgate a recompensa em vez de trocar.");

  const all = await loadRows(db, ownerId, "daily", today);
  const recent = await recentTotals(db, ownerId, tz, today);
  const next = drawReplacement(ownerId, "daily", today, recent, all.map((r) => r.templateKey));
  if (!next) throw new QuestError(409, "Não há outra quest disponível para troca hoje.");

  const upd = await db.execute({
    sql: `UPDATE quest_assignments SET replaced_at = datetime('now')
          WHERE id = ? AND owner_id = ? AND replaced_at IS NULL AND claimed_at IS NULL
            AND (SELECT COUNT(*) FROM quest_assignments WHERE owner_id = ? AND period = 'daily' AND period_key = ? AND replaced_at IS NOT NULL) < ?`,
    args: [row.id, ownerId, ownerId, today, QUEST_RULES.dailyRerolls],
  });
  if (upd.rowsAffected === 0) throw new QuestError(409, "Você já usou a troca de hoje.");
  const newId = nanoid();
  await db.execute({
    sql: "INSERT OR IGNORE INTO quest_assignments (id, owner_id, period, period_key, template_key, target, xp_reward) VALUES (?, ?, 'daily', ?, ?, ?, ?)",
    args: [newId, ownerId, today, next.templateKey, next.target, next.xpReward],
  });
  const created = await loadOwned(db, ownerId, newId);
  const p = (await progressFor(db, ownerId, tz, [created], today)).get(created.id) ?? 0;
  return toView(created, p, false);
}
