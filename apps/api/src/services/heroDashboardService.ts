import type { Client } from "@libsql/client";
import { TITLES, KNOWLEDGE, ATTRIBUTE_META, type AttributeKey } from "../config/codex.js";
import { ATTRIBUTE_GUIDES, BUILD_ATTRIBUTES } from "../config/build.js";
import { getPlayerProfile, xpToReachLevel } from "./gamificationService.js";
import { shiftDayKey, userDayContext } from "./localDayService.js";
import { computeLifeScore } from "./metricsService.js";
import { getBuildOverview } from "./characterBuildService.js";
import { getCodex } from "./codexService.js";
import { listAchievements } from "./achievementsService.js";
import { loadCampaigns } from "./campaignsService.js";
import { getFocusTasks } from "./priorityService.js";
import { getInventory } from "./inventoryService.js";
import { getTreasureSummary } from "./treasureService.js";
import { notifyFromAutomation } from "./automationService.js";

/**
 * Painel do Herói — dashboard central de evolução (camada derivada).
 *
 * Duas famílias de números, nunca misturadas:
 * - Indicadores de desempenho = dimensões do Life Score (metodologia oficial, histórico em life_scores).
 * - Atributos de progressão = Build/Códex (XP por origem).
 * Nível, XP, moedas, gemas, títulos e conquistas vêm dos ledgers e catálogos oficiais.
 */

type Outcome = { status: "ok" | "skipped" | "error"; summary: string };
const DIMS = ["productivity", "health", "habits", "goals", "reading", "education", "professional"] as const;
type Dim = (typeof DIMS)[number];
const DIM_LABEL: Record<Dim, string> = { productivity: "Produtividade", health: "Saúde", habits: "Hábitos", goals: "Metas", reading: "Leitura", education: "Educação", professional: "Profissional" };
const DIM_SOURCE: Record<Dim, string> = {
  productivity: "% das tarefas concluídas (Missões)",
  health: "Água, sono e exercício do dia (Saúde)",
  habits: "% dos hábitos cumpridos hoje (Hábitos)",
  goals: "Progresso das metas ativas (Metas)",
  reading: "Leitura recente (Biblioteca)",
  education: "Progresso das formações (Educação)",
  professional: "Tarefas de projetos profissionais (Profissional)",
};

export const PERIODS = { "7d": 7, "30d": 30, "90d": 90, "365d": 365 } as const;
export type Period = keyof typeof PERIODS;

/** Média por dimensão num recorte de snapshots; dimensão sem snapshot = null (não vira zero). */
export function averageDims(rows: Array<Record<Dim, number | null>>): Record<Dim, number | null> {
  const out = {} as Record<Dim, number | null>;
  for (const d of DIMS) {
    const vals = rows.map((r) => r[d]).filter((v): v is number => v != null);
    out[d] = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  }
  return out;
}

/** Marcos da jornada = títulos oficiais por nível (regra global_level), em ordem. */
export function levelMilestones(level: number, unlocked: Set<string>) {
  return TITLES.filter((t) => t.rule.type === "global_level")
    .map((t) => ({ id: t.id, name: t.name, rarity: t.rarity, minLevel: (t.rule as { min: number }).min, description: t.description }))
    .sort((a, b) => a.minLevel - b.minLevel)
    .map((t) => ({ ...t, unlocked: unlocked.has(t.id) || level >= t.minLevel, current: false }));
}

export async function getHeroDashboard(db: Client, ownerId: string, period: Period = "30d", range?: { from: string; to: string }) {
  const { today } = await userDayContext(db, ownerId);
  const days = PERIODS[period] ?? 30;
  const to = range?.to && range.to <= today ? range.to : today;
  const from = range?.from && range.from <= to ? range.from : shiftDayKey(to, -(days - 1));
  const span = Math.max(1, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1);
  const prevFrom = shiftDayKey(from, -span);
  const prevTo = shiftDayKey(from, -1);

  const [profile, life, history, build, codex, achievements, campaigns, focus, inventory, treasure, xpDays, missionsDays, goalsDone, goalsNear, gems, habitsActive, missionsOpen, userRow] = await Promise.all([
    getPlayerProfile(db, ownerId),
    computeLifeScore(ownerId, today),
    db.execute({ sql: "SELECT score_date, overall_score, productivity, health, habits, goals, reading, education, professional FROM life_scores WHERE owner_id = ? AND score_date >= ? AND score_date <= ? ORDER BY score_date", args: [ownerId, prevFrom, to] }),
    getBuildOverview(db, ownerId),
    getCodex(db, ownerId),
    listAchievements(ownerId),
    loadCampaigns(db, ownerId),
    getFocusTasks(db, ownerId, 1),
    getInventory(db, ownerId),
    getTreasureSummary(db, ownerId),
    db.execute({ sql: "SELECT day_key AS d, SUM(xp) AS v FROM xp_events WHERE owner_id = ? AND day_key >= ? AND day_key <= ? GROUP BY day_key", args: [ownerId, from, to] }),
    db.execute({ sql: "SELECT date(completed_at) AS d, COUNT(*) AS v FROM tasks WHERE owner_id = ? AND status = 'Concluído' AND completed_at IS NOT NULL AND date(completed_at) >= ? AND date(completed_at) <= ? GROUP BY date(completed_at)", args: [ownerId, from, to] }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM goals WHERE owner_id = ? AND status = 'done' AND date(updated_at) >= ? AND date(updated_at) <= ?", args: [ownerId, from, to] }),
    db.execute({
      sql: `SELECT id, title, current_value, target_value FROM goals WHERE owner_id = ? AND status = 'active' AND target_value IS NOT NULL AND target_value > 0
            AND current_value / target_value >= 0.6 AND current_value < target_value ORDER BY current_value / target_value DESC LIMIT 3`,
      args: [ownerId],
    }),
    db.execute({ sql: "SELECT COALESCE(SUM(amount), 0) AS v FROM gem_ledger WHERE owner_id = ?", args: [ownerId] }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM habits WHERE owner_id = ? AND archived_at IS NULL AND paused_at IS NULL", args: [ownerId] }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM tasks WHERE owner_id = ? AND status != 'Concluído' AND parent_task_id IS NULL", args: [ownerId] }),
    db.execute({ sql: "SELECT name, avatar_url FROM users WHERE id = ?", args: [ownerId] }),
  ]);

  const snaps = history.rows.map((r) => ({
    day: String(r.score_date),
    overall: Number(r.overall_score),
    ...(Object.fromEntries(DIMS.map((d) => [d, r[d] == null ? null : Number(r[d])])) as Record<Dim, number | null>),
  }));
  const cur = snaps.filter((s) => s.day >= from);
  const prev = snaps.filter((s) => s.day < from);
  const avgCur = averageDims(cur);
  const avgPrev = averageDims(prev);
  const attributes = DIMS.map((d) => ({
    key: d,
    label: DIM_LABEL[d],
    value: Math.round(life[d]),
    periodAvg: avgCur[d],
    previousAvg: avgPrev[d],
    delta: avgCur[d] != null && avgPrev[d] != null ? avgCur[d]! - avgPrev[d]! : null,
    source: DIM_SOURCE[d],
    series: cur.map((s) => ({ day: s.day, value: s[d] })),
  }));

  const unlockedTitles = new Set(codex.titles.filter((t) => t.unlocked).map((t) => t.id));
  const milestones = levelMilestones(profile.level, unlockedTitles);
  const currentIdx = milestones.reduce((acc, m, i) => (m.unlocked ? i : acc), -1);
  if (currentIdx >= 0) milestones[currentIdx]!.current = true;
  const nextMilestone = milestones.find((m) => !m.unlocked) ?? null;
  const equipped = codex.titles.find((t) => t.equipped) ?? null;
  const nextTitle = codex.titles.filter((t) => !t.unlocked).sort((a, b) => b.progress - a.progress)[0] ?? null;
  const nearAch = achievements.filter((a) => !a.unlockedAt && a.threshold).sort((a, b) => b.progress - a.progress)[0] ?? null;
  const recentAch = achievements.filter((a) => a.unlockedAt).sort((a, b) => String(b.unlockedAt).localeCompare(String(a.unlockedAt))).slice(0, 4);
  const activeCampaigns = campaigns.filter((c) => c.status === "active");
  const nextCampaignMilestone = activeCampaigns
    .flatMap((c) => c.milestones.filter((m) => m.status !== "completed").map((m) => ({ campaignId: c.id, campaign: c.title, title: m.title, dueDate: m.dueDate })))
    .sort((a, b) => String(a.dueDate ?? "9999").localeCompare(String(b.dueDate ?? "9999")))[0] ?? null;
  const weakest = build.gaps.filter((g) => g.status === "below").sort((a, b) => b.gap - a.gap)[0] ?? null;

  // Árvore de evolução: caminhos = atributos da Build; nós = conhecimentos do Códex (XP do atributo, nunca gasto).
  const tree = BUILD_ATTRIBUTES.map((k: AttributeKey) => {
    const attr = build.attributes.find((a) => a.key === k);
    const xpTotal = codex.attributes.find((a) => a.key === k);
    const nodes = KNOWLEDGE.filter((kn) => kn.attribute === k).map((kn) => {
      const c = codex.knowledge.find((x) => x.id === kn.id);
      return { id: kn.id, title: kn.title, unlocked: !!c?.unlocked, progress: Math.round((c?.progress ?? 0) * 100), requirement: kn.unlock.type === "attribute_xp" ? `${kn.unlock.min} XP de ${ATTRIBUTE_META[k].label}` : `${kn.unlock.cost} moedas` };
    });
    return {
      key: k,
      label: ATTRIBUTE_META[k].label,
      description: ATTRIBUTE_META[k].description,
      score: attr?.score ?? 0,
      xpTotal: xpTotal?.xp ?? 0,
      attrLevel: xpTotal?.level ?? 1,
      sources: ATTRIBUTE_GUIDES[k].sources,
      recommendation: ATTRIBUTE_GUIDES[k].recommendation,
      habits: ATTRIBUTE_GUIDES[k].actions.filter((a) => a.item.kind === "habit").map((a) => a.label),
      nodes,
      done: nodes.filter((n) => n.unlocked).length,
    };
  });

  const xpMap = new Map(xpDays.rows.map((r) => [String(r.d), Number(r.v)]));
  const mMap = new Map(missionsDays.rows.map((r) => [String(r.d), Number(r.v)]));
  const timeline = Array.from({ length: span }, (_, i) => shiftDayKey(from, i)).map((d) => ({ day: d, xp: xpMap.get(d) ?? 0, missions: mMap.get(d) ?? 0, lifeScore: snaps.find((s) => s.day === d)?.overall ?? null }));
  const activeDays = timeline.filter((t) => t.xp > 0).length;
  const achInPeriod = achievements.filter((a) => a.unlockedAt && String(a.unlockedAt).slice(0, 10) >= from && String(a.unlockedAt).slice(0, 10) <= to).length;

  return {
    today,
    period: { key: period, from, to, span },
    hero: {
      name: String(userRow.rows[0]?.name ?? "Herói"),
      avatarUrl: userRow.rows[0]?.avatar_url == null ? null : String(userRow.rows[0].avatar_url),
      level: profile.level,
      totalXp: profile.totalXp,
      xpIntoLevel: profile.xpIntoLevel,
      xpForNextLevel: profile.xpForNextLevel,
      progressPct: profile.progressPct,
      nextLevelAt: xpToReachLevel(profile.level + 1),
      title: equipped ? { id: equipped.id, name: equipped.name } : null,
      archetype: build.archetype ? { id: build.archetype.id, name: build.archetype.name, avatar: build.archetype.avatar, affinity: build.archetype.affinity, tags: build.archetype.tags, description: build.archetype.description, secondary: build.archetype.secondary } : null,
      buildReady: build.sufficiency.enough,
    },
    status: {
      xpToday: profile.xpToday,
      coins: profile.coins,
      gems: Number(gems.rows[0]?.v ?? 0),
      achievements: { unlocked: achievements.filter((a) => a.unlockedAt).length, total: achievements.length },
      habitsActive: Number(habitsActive.rows[0]?.n ?? 0),
      missionsOpen: Number(missionsOpen.rows[0]?.n ?? 0),
      lifeScore: Math.round(life.overall),
      streakDays: profile.streakDays,
    },
    attributes,
    radar: { current: avgCur, previous: avgPrev, today: Object.fromEntries(DIMS.map((d) => [d, Math.round(life[d])])) as Record<Dim, number>, snapshots: cur.length },
    featured: focus[0] ?? null,
    nextEvolutions: [
      { key: "level", title: `Alcançar o nível ${profile.level + 1}`, current: profile.xpIntoLevel, target: profile.xpForNextLevel, unit: "XP", link: "/perfil" },
      ...(nextTitle ? [{ key: "title", title: `Título: ${nextTitle.name}`, current: Math.round(nextTitle.progress * 100), target: 100, unit: "%", link: "/codex" }] : []),
      ...(nearAch && nearAch.threshold ? [{ key: "achievement", title: `Conquista: ${nearAch.title}`, current: Math.min(nearAch.currentValue ?? 0, nearAch.threshold), target: nearAch.threshold, unit: "", link: "/conquistas" }] : []),
      ...(nextCampaignMilestone ? [{ key: "campaign", title: `Marco: ${nextCampaignMilestone.title} (${nextCampaignMilestone.campaign})`, current: 0, target: 1, unit: "", link: `/forja-campanhas/${nextCampaignMilestone.campaignId}` }] : []),
      ...(weakest ? [{ key: "attribute", title: `${weakest.label} até a build desejada`, current: weakest.current, target: weakest.target, unit: "pts", link: "/build" }] : []),
      ...goalsNear.rows.map((g) => ({ key: `goal-${String(g.id)}`, title: `Meta: ${String(g.title)}`, current: Number(g.current_value), target: Number(g.target_value), unit: "", link: "/metas" })),
      { key: "streak", title: `Sequência de ${Math.max(7, Math.ceil((profile.streakDays + 1) / 7) * 7)} dias`, current: profile.streakDays, target: Math.max(7, Math.ceil((profile.streakDays + 1) / 7) * 7), unit: "dias", link: "/timeline" },
    ],
    journey: { milestones, next: nextMilestone },
    campaigns: activeCampaigns.slice(0, 6).map((c) => ({ id: c.id, title: c.title, lifeArea: c.lifeArea, priority: c.priority, endDate: c.endDate, pct: c.progress.pct, missions: c.counts.missions, missionsDone: c.counts.missionsDone, nextMilestone: c.milestones.find((m) => m.status !== "completed")?.title ?? null, icon: c.icon })),
    recentAchievements: recentAch.map((a) => ({ id: a.id, title: a.title, tier: a.tier, unlockedAt: a.unlockedAt, reward: a.reward, icon: a.icon })),
    treasure: {
      coins: treasure.coins,
      gems: treasure.gems,
      available: treasure.availableCount,
      recentItems: inventory.recent.slice(0, 4),
      equipped: inventory.equipped,
      titlesUnlocked: unlockedTitles.size,
      relics: codex.relics.filter((r) => r.unlocked).length,
    },
    evolution: {
      timeline,
      totals: { xp: timeline.reduce((s, t) => s + t.xp, 0), missions: timeline.reduce((s, t) => s + t.missions, 0), activeDays, consistencyPct: Math.round((activeDays / span) * 100), achievements: achInPeriod, goals: Number(goalsDone.rows[0]?.n ?? 0) },
      lifeScoreSnapshots: cur.length,
    },
    tree,
  };
}

/* ─────────────────────────────── Automações ─────────────────────────────── */

/** D · Evolução semanal: semana passada x anterior (XP, missões, conquistas). */
export async function runWeeklyEvolution(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const { today } = await userDayContext(db, ownerId);
  const q = async (a: string, b: string) =>
    Number((await db.execute({ sql: "SELECT COALESCE(SUM(xp), 0) AS v FROM xp_events WHERE owner_id = ? AND day_key >= ? AND day_key <= ?", args: [ownerId, a, b] })).rows[0]?.v ?? 0);
  const last = await q(shiftDayKey(today, -7), shiftDayKey(today, -1));
  const prev = await q(shiftDayKey(today, -14), shiftDayKey(today, -8));
  if (!last && !prev) return { status: "skipped", summary: "Sem XP nas últimas duas semanas." };
  const p = await getPlayerProfile(db, ownerId);
  const delta = prev ? Math.round(((last - prev) / prev) * 100) : null;
  const body = `Últimos 7 dias: ${last} XP${delta == null ? "" : ` (${delta >= 0 ? "+" : ""}${delta}% vs. semana anterior)`}. Nível ${p.level}, ${p.progressPct}% para o próximo.`;
  await notifyFromAutomation(db, ownerId, { eventType: "hero_weekly", title: "🧙 Evolução semanal", body, url: "/dashboard", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: body };
}

/** E · Alertas de desempenho: queda de 10+ pontos na média do Life Score (7 dias x 7 anteriores). */
export async function runPerformanceAlerts(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const { today } = await userDayContext(db, ownerId);
  const r = await db.execute({ sql: "SELECT score_date, overall_score FROM life_scores WHERE owner_id = ? AND score_date >= ?", args: [ownerId, shiftDayKey(today, -14)] });
  const avg = (a: string, b: string) => {
    const v = r.rows.filter((x) => String(x.score_date) >= a && String(x.score_date) <= b).map((x) => Number(x.overall_score));
    return v.length >= 3 ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };
  const last = avg(shiftDayKey(today, -6), today);
  const prev = avg(shiftDayKey(today, -13), shiftDayKey(today, -7));
  if (last == null || prev == null) return { status: "skipped", summary: "Histórico de Life Score insuficiente (mínimo 3 dias em cada semana)." };
  const diff = Math.round(last - prev);
  const min = Number(config.minDrop ?? 10);
  if (Math.abs(diff) < min) return { status: "skipped", summary: `Variação de ${diff} ponto(s) — abaixo do limite.` };
  const body = `Life Score médio ${diff > 0 ? "subiu" : "caiu"} ${Math.abs(diff)} ponto(s) em relação à semana anterior (${Math.round(prev)} → ${Math.round(last)}).`;
  await notifyFromAutomation(db, ownerId, { eventType: "hero_performance", title: diff > 0 ? "📈 Desempenho em alta" : "📉 Atenção ao desempenho", body, url: "/dashboard?aba=evolucao", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: body };
}
