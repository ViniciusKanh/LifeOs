import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { listAchievements, type AchievementView } from "./achievementsService.js";
import { getLevelHistory, getPlayerProfile, todayKeyFor } from "./gamificationService.js";
import { shiftDayKey, userDayContext } from "./localDayService.js";
import { bestStreak } from "./planningHubService.js";
import { getSeason } from "./seasonsService.js";
import { getCodex } from "./codexService.js";
import { getInventory } from "./inventoryService.js";
import { listRewardsWithAvailability } from "./rewardsService.js";
import { getTreasureSummary } from "./treasureService.js";
import { getBuildOverview } from "./characterBuildService.js";
import { mondayKey, notifyFromAutomation, readAutomationState, writeAutomationState } from "./automationService.js";
import { evaluateAchievements } from "./achievementsService.js";
import { extractJson, str } from "./aiJson.js";
import { generateText, getGeminiConfig } from "./geminiService.js";

/**
 * Perfil do Herói 3.0 (Conquistas, Tesouro, Coleção, Build) + Crônica 2.0.
 *
 * Camada DERIVADA: XP vem de xp_events, moedas de coin_ledger, conquistas de
 * user_achievements e itens do inventário oficial. Nada aqui concede XP ou
 * moedas — as tabelas novas (0092) guardam só preferências do usuário
 * (metas, favoritos, fotos autorizadas) e fotografias da build.
 */

type Row = Record<string, unknown>;
type Outcome = { status: "ok" | "skipped" | "error"; summary: string };

export class HeroError extends Error {
  constructor(
    message: string,
    public status: 400 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

/* ═══════════════════════════════ Conquistas ═══════════════════════════════ */

export type HeroRarity = "comum" | "incomum" | "rara" | "epica" | "lendaria" | "mitica";
export const RARITY_ORDER: HeroRarity[] = ["comum", "incomum", "rara", "epica", "lendaria", "mitica"];
export const MASTERY_METRIC = "achievements_unlocked_total";

/** Regras públicas da raridade — derivadas do tier oficial (bronze…platina) + posição na cadeia. */
export const RARITY_RULES: Array<{ rarity: HeroRarity; label: string; rule: string }> = [
  { rarity: "comum", label: "Comum", rule: "Conquistas de tier Bronze." },
  { rarity: "incomum", label: "Incomum", rule: "Conquistas de tier Prata." },
  { rarity: "rara", label: "Rara", rule: "Conquistas de tier Ouro." },
  { rarity: "epica", label: "Épica", rule: "Conquistas de tier Platina." },
  { rarity: "lendaria", label: "Lendária", rule: "Platina que fecha uma cadeia de 3 ou mais etapas (etapa Maestria)." },
  { rarity: "mitica", label: "Mítica", rule: "Platina de maestria: exige um número de conquistas oficiais desbloqueadas." },
];

export function achievementRarity(a: { tier: string; metric: string | null }, chain: { index: number; length: number } | null): HeroRarity {
  if (a.metric === MASTERY_METRIC && a.tier === "platinum") return "mitica";
  if (a.tier === "platinum") return chain && chain.length >= 3 && chain.index === chain.length - 1 ? "lendaria" : "epica";
  if (a.tier === "gold") return "rara";
  if (a.tier === "silver") return "incomum";
  return "comum";
}

export const CHAIN_STAGES = ["Fundamentos", "Consistência", "Disciplina", "Maestria"] as const;
export type ChainStage = (typeof CHAIN_STAGES)[number];

/** Etapa da cadeia: distribui os elos (mesma métrica, limiar crescente) entre as 4 etapas. */
export function chainStage(index: number, length: number): ChainStage {
  if (length <= 1) return "Fundamentos";
  return CHAIN_STAGES[Math.min(3, Math.round((index * 3) / (length - 1)))]!;
}

export type HeroAchievementState = "bloqueada" | "nao_iniciada" | "em_progresso" | "desbloqueada" | "resgatada";

/**
 * Estado: "resgatada" quando a recompensa já foi paga (xp_events), "bloqueada"
 * quando o elo anterior da cadeia ainda não foi desbloqueado.
 */
export function achievementState(a: { unlockedAt: string | null; currentValue?: number }, paid: boolean, previousUnlocked: boolean): HeroAchievementState {
  if (a.unlockedAt) return paid ? "resgatada" : "desbloqueada";
  if (!previousUnlocked) return "bloqueada";
  return (a.currentValue ?? 0) > 0 ? "em_progresso" : "nao_iniciada";
}

/** De onde vem cada métrica (eventos contados e módulo de origem). */
const METRIC_SOURCES: Array<{ prefix: string; events: string; module: string; link: string }> = [
  { prefix: "tasks_", events: "Missões com status Concluído", module: "Missões", link: "/tarefas" },
  { prefix: "subtasks_", events: "Subtarefas concluídas", module: "Missões", link: "/tarefas" },
  { prefix: "habit_", events: "Check-ins de hábito que atingiram o alvo do dia", module: "Hábitos", link: "/habitos" },
  { prefix: "books_", events: "Livros marcados como concluídos", module: "Biblioteca", link: "/biblioteca" },
  { prefix: "pages_", events: "Páginas registradas em sessões de leitura", module: "Biblioteca", link: "/biblioteca" },
  { prefix: "water_", events: "Registros de água", module: "Saúde", link: "/saude" },
  { prefix: "workouts_", events: "Treinos registrados", module: "Saúde", link: "/saude" },
  { prefix: "sleep_", events: "Noites de sono registradas", module: "Saúde", link: "/saude" },
  { prefix: "mood_", events: "Check-ins de humor e energia", module: "Saúde", link: "/saude" },
  { prefix: "focus_", events: "Minutos de sessões de foco", module: "Foco", link: "/tarefas" },
  { prefix: "weekly_reviews", events: "Revisões semanais fechadas", module: "Revisões", link: "/weekly-review" },
  { prefix: "weekly_plans", events: "Planos semanais selados no Conselho", module: "Conselho de Guerra", link: "/conselho" },
  { prefix: "goal", events: "Metas concluídas / planos aplicados", module: "Metas", link: "/metas" },
  { prefix: "study_", events: "Minutos de estudo registrados", module: "Educação", link: "/educacao" },
  { prefix: "education", events: "Formações e etapas acadêmicas", module: "Educação", link: "/educacao" },
  { prefix: "academic_", events: "Prazos acadêmicos cumpridos", module: "Educação", link: "/educacao" },
  { prefix: "experiment", events: "Experimentos e observações registradas", module: "Laboratório", link: "/experimentos" },
  { prefix: "bank_", events: "Movimentos concluídos no Banco", module: "Banco", link: "/banco" },
  { prefix: "flashcard", events: "Revisões de cartas do Grimório", module: "Grimório", link: "/grimorio" },
  { prefix: "grimoire_", events: "Dias de estudo no Grimório", module: "Grimório", link: "/grimorio" },
  { prefix: "journal_", events: "Registros do Diário (só contagens, nunca o texto)", module: "Diário", link: "/diario" },
  { prefix: "quests_", events: "Quests resgatadas no Quadro de Avisos", module: "Quadro de Avisos", link: "/quests" },
  { prefix: MASTERY_METRIC, events: "Conquistas oficiais desbloqueadas", module: "Conquistas", link: "/conquistas" },
];

export function metricInfo(metric: string | null): { events: string; module: string; link: string; scope: string } {
  const m = metric ?? "";
  const src = METRIC_SOURCES.find((s) => m.startsWith(s.prefix)) ?? { events: "Registros do módulo de origem", module: "LifeOS", link: "/hoje" };
  const scope = m.endsWith("_in_day") ? "Melhor dia já registrado" : m.includes("streak") ? "Maior sequência já alcançada" : m.includes("peak") ? "Maior valor já alcançado" : "Total acumulado desde o início";
  return { ...src, scope };
}

export interface HeroAchievement extends AchievementView {
  rarity: HeroRarity;
  state: HeroAchievementState;
  chain: { metric: string; stage: ChainStage; index: number; length: number } | null;
  info: { events: string; module: string; link: string; scope: string };
  remaining: number;
  paidAt: string | null;
}

/** Agrupa por métrica (cadeia) e enriquece cada conquista com raridade, estado e origem. */
export function enrichAchievements(list: AchievementView[], paid: Map<string, string>): HeroAchievement[] {
  const byMetric = new Map<string, AchievementView[]>();
  for (const a of list) if (a.metric) byMetric.set(a.metric, [...(byMetric.get(a.metric) ?? []), a]);
  for (const arr of byMetric.values()) arr.sort((x, y) => (x.threshold ?? 0) - (y.threshold ?? 0));
  return list.map((a) => {
    const arr = a.metric ? (byMetric.get(a.metric) ?? []) : [];
    const index = arr.findIndex((x) => x.id === a.id);
    const chain = a.metric && arr.length > 1 ? { metric: a.metric, stage: chainStage(index, arr.length), index, length: arr.length } : null;
    const previousUnlocked = index <= 0 || !!arr[index - 1]?.unlockedAt;
    return {
      ...a,
      rarity: achievementRarity(a, chain),
      state: achievementState(a, paid.has(a.id), previousUnlocked),
      chain,
      info: metricInfo(a.metric),
      remaining: a.threshold ? Math.max(0, a.threshold - (a.currentValue ?? 0)) : 0,
      paidAt: paid.get(a.id) ?? null,
    };
  });
}

export async function getAchievementsHub(db: Client, ownerId: string) {
  const today = await todayKeyFor(db, ownerId);
  const [list, paidRows, coinRows, days, profile, season, codex] = await Promise.all([
    listAchievements(ownerId),
    db.execute({ sql: "SELECT source_id, xp, created_at FROM xp_events WHERE owner_id = ? AND source_type = 'achievement'", args: [ownerId] }),
    db.execute({ sql: "SELECT COALESCE(SUM(amount), 0) AS c FROM coin_ledger WHERE owner_id = ? AND source_type = 'achievement' AND amount > 0", args: [ownerId] }),
    db.execute({ sql: "SELECT DISTINCT day_key FROM xp_events WHERE owner_id = ?", args: [ownerId] }),
    getPlayerProfile(db, ownerId),
    getSeason(db, ownerId, today),
    getCodex(db, ownerId),
  ]);
  const paid = new Map(paidRows.rows.map((r) => [String(r.source_id), String(r.created_at)]));
  const achievements = enrichAchievements(list, paid);
  const count = (s: HeroAchievementState[]) => achievements.filter((a) => s.includes(a.state)).length;
  const unlocked = count(["desbloqueada", "resgatada"]);
  const byRarity = RARITY_ORDER.map((r) => ({
    rarity: r,
    total: achievements.filter((a) => a.rarity === r).length,
    unlocked: achievements.filter((a) => a.rarity === r && a.unlockedAt).length,
  }));
  // Cadeias com 2+ elos: progresso = elos desbloqueados / total.
  const chains = [...new Set(achievements.filter((a) => a.chain).map((a) => a.chain!.metric))].map((metric) => {
    const links = achievements.filter((a) => a.chain?.metric === metric).sort((x, y) => x.chain!.index - y.chain!.index);
    const done = links.filter((l) => l.unlockedAt).length;
    return {
      metric,
      module: links[0]!.info.module,
      link: links[0]!.info.link,
      category: links[0]!.category,
      currentValue: links[0]!.currentValue ?? 0,
      done,
      total: links.length,
      pct: Math.round((done / links.length) * 100),
      next: links.find((l) => !l.unlockedAt)?.id ?? null,
      links: links.map((l) => ({ id: l.id, title: l.title, threshold: l.threshold, stage: l.chain!.stage, state: l.state, rarity: l.rarity })),
    };
  });
  const daySet = new Set(days.rows.map((d) => String(d.day_key)));
  return {
    mastery: {
      total: achievements.length,
      unlocked,
      inProgress: count(["em_progresso"]),
      notStarted: count(["nao_iniciada", "bloqueada"]),
      locked: count(["bloqueada"]),
      pct: achievements.length ? Math.round((unlocked / achievements.length) * 100) : 0,
      // Recompensas realmente pagas (ledgers oficiais), não estimadas.
      xp: paidRows.rows.reduce((s, r) => s + Number(r.xp), 0),
      coins: Number(coinRows.rows[0]?.c ?? 0),
      byRarity,
      streak: { current: profile.streakDays, best: Math.max(profile.streakDays, bestStreak(daySet)) },
    },
    rarityRules: RARITY_RULES,
    achievements,
    chains: chains.sort((a, b) => b.pct - a.pct || a.metric.localeCompare(b.metric)),
    titles: codex.titles.map((t) => ({ id: t.id, name: t.name, description: t.description, rarity: t.rarity, unlocked: t.unlocked, unlockedAt: t.unlockedAt, equipped: t.equipped, progress: Math.round(t.progress * 100) })),
    season: {
      name: season.name,
      motto: season.motto,
      from: season.from,
      to: season.to,
      daysLeft: season.daysLeft,
      xp: season.xp,
      tier: season.tier,
      maxTier: season.maxTier,
      nextTier: season.nextTier,
      tiers: season.tiers,
    },
  };
}

/** Automação: verifica e desbloqueia conquistas (pagamento idempotente) e avisa as novas. */
export async function runUnlockPipeline(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const fresh = await evaluateAchievements(ownerId);
  if (!fresh.length) return { status: "ok", summary: "Nenhuma conquista nova — progresso conferido com os seus registros." };
  const names = fresh.map((a) => a.title).slice(0, 3).join(", ");
  await notifyFromAutomation(db, ownerId, {
    eventType: "hero_unlock",
    title: fresh.length === 1 ? "🏆 Conquista desbloqueada" : `🏆 ${fresh.length} conquistas desbloqueadas`,
    body: `${names}. Recompensa entregue uma única vez e registrada na Crônica.`,
    url: "/conquistas",
    inApp: config.inApp !== false,
    push: config.push === true,
  });
  return { status: "ok", summary: `${fresh.length} conquista(s) desbloqueada(s): ${names}.` };
}

/** Automação semanal: conquistas a partir de X% do caminho. */
export async function runNearAchievements(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const min = Math.min(99, Math.max(50, Number(config.minPct ?? 80)));
  const list = (await listAchievements(ownerId)).filter((a) => !a.unlockedAt && a.progress >= min).sort((a, b) => b.progress - a.progress);
  if (!list.length) return { status: "skipped", summary: `Nenhuma conquista com ${min}% ou mais do caminho.` };
  await notifyFromAutomation(db, ownerId, {
    eventType: "hero_near",
    title: "⭐ Conquistas quase lá",
    body: list.slice(0, 3).map((a) => `${a.title} (${a.progress}%)`).join(" · "),
    url: "/conquistas?aba=salao",
    inApp: config.inApp !== false,
    push: config.push === true,
  });
  return { status: "ok", summary: `${list.length} conquista(s) próximas avisadas.` };
}

/* ═══════════════════════════════ Tesouro ═══════════════════════════════ */

export type GoalKind = "reward" | "title" | "relic" | "set";

/** Dias estimados até juntar o saldo, pelo ritmo real dos últimos 30 dias (null = sem ritmo). */
export function etaDays(missing: number, earned30: number): number | null {
  if (missing <= 0) return 0;
  const perDay = earned30 / 30;
  return perDay > 0 ? Math.ceil(missing / perDay) : null;
}

/** Semanas consecutivas (terminando nesta ou na anterior) com ao menos um resgate. */
export function weeklyStreak(weeks: Set<string>, thisMonday: string): number {
  let cur = weeks.has(thisMonday) ? thisMonday : shiftDayKey(thisMonday, -7);
  let n = 0;
  while (weeks.has(cur)) {
    n++;
    cur = shiftDayKey(cur, -7);
  }
  return n;
}

export async function getTreasureHub(db: Client, ownerId: string) {
  const { today } = await userDayContext(db, ownerId);
  const rewards = await listRewardsWithAvailability(db, ownerId, false);
  const [summary, goalsRows, ledger, redemptions, codex, inventory] = await Promise.all([
    getTreasureSummary(db, ownerId, rewards),
    db.execute({ sql: "SELECT id, kind, target_id, created_at FROM hero_reward_goals WHERE owner_id = ? ORDER BY created_at", args: [ownerId] }),
    db.execute({
      sql: "SELECT amount, source_type, date(created_at) AS d FROM coin_ledger WHERE owner_id = ? AND created_at >= date(?, '-63 days')",
      args: [ownerId, today],
    }),
    db.execute({ sql: "SELECT date(redeemed_at) AS d FROM reward_redemptions WHERE owner_id = ? AND status != 'canceled'", args: [ownerId] }),
    getCodex(db, ownerId),
    getInventory(db, ownerId),
  ]);
  const earned30 = summary.wallet.earned30;
  const goals = goalsRows.rows.map((g) => {
    const kind = String(g.kind) as GoalKind;
    const targetId = String(g.target_id);
    const base = { id: String(g.id), kind, targetId, createdAt: String(g.created_at) };
    if (kind === "reward") {
      const r = rewards.find((x) => x.id === targetId);
      if (!r) return { ...base, title: "Recompensa removida", current: 0, target: 1, unit: "", reached: false, eta: null as number | null, missingText: "Esta recompensa não existe mais.", link: "/tesouro" };
      const have = r.currency === "gem" ? summary.gems : summary.coins;
      const missing = Math.max(0, r.cost - have);
      return {
        ...base,
        title: r.name,
        current: Math.min(have, r.cost),
        target: r.cost,
        unit: r.currency === "gem" ? "gemas" : "moedas",
        reached: r.availability.available,
        eta: r.currency === "gem" ? null : etaDays(missing, earned30),
        missingText: r.availability.available ? "Disponível para resgate." : (r.availability.reason ?? `Faltam ${missing} ${r.currency === "gem" ? "gemas" : "moedas"}.`),
        link: "/tesouro",
      };
    }
    if (kind === "set") {
      const s = inventory.sets.find((x) => x.id === targetId);
      return { ...base, title: s?.name ?? "Conjunto", current: s?.owned ?? 0, target: s?.total ?? 1, unit: "itens", reached: !!s?.complete, eta: null, missingText: s ? `${s.total - s.owned} item(ns) faltando · ${s.bonus}` : "Conjunto indisponível.", link: "/inventario?aba=conjuntos" };
    }
    const pool = kind === "title" ? codex.titles : codex.relics;
    const t = pool.find((x) => x.id === targetId);
    const hint = t && "obtainedBy" in t ? String((t as { obtainedBy?: string }).obtainedBy ?? "") : (t?.description ?? "");
    return { ...base, title: t?.name ?? "Item do Códex", current: Math.round((t?.progress ?? 0) * 100), target: 100, unit: "%", reached: !!t?.unlocked, eta: null, missingText: t?.unlocked ? "Já conquistado." : hint, link: "/codex" };
  });

  // Histórico econômico: 8 semanas (segunda a domingo) com ganhos e gastos reais do ledger.
  const thisMonday = mondayKey(today);
  const weeks = Array.from({ length: 8 }, (_, i) => shiftDayKey(thisMonday, -7 * (7 - i)));
  const economy = weeks.map((w) => ({ week: w, earned: 0, spent: 0 }));
  const bySource: Record<string, { earned: number; spent: number }> = {};
  for (const r of ledger.rows) {
    const amt = Number(r.amount);
    const wk = mondayKey(String(r.d));
    const row = economy.find((e) => e.week === wk);
    if (row) amt > 0 ? (row.earned += amt) : (row.spent += -amt);
    if (String(r.d) >= shiftDayKey(today, -29)) {
      const src = String(r.source_type);
      const cur = bySource[src] ?? { earned: 0, spent: 0 };
      amt > 0 ? (cur.earned += amt) : (cur.spent += -amt);
      bySource[src] = cur;
    }
  }
  const redeemWeeks = new Set(redemptions.rows.map((r) => mondayKey(String(r.d))));

  // Recomendações determinísticas (a IA é opcional e só reescreve).
  const tips: Array<{ kind: "dado" | "inferencia" | "sugestao"; text: string; rewardId?: string }> = [];
  const affordableFav = rewards.filter((r) => r.isFavorite && r.availability.available);
  for (const r of affordableFav.slice(0, 2)) tips.push({ kind: "dado", text: `${r.name} (favorita) já está disponível: custa ${r.cost} ${r.currency === "gem" ? "gemas" : "moedas"}.`, rewardId: r.id });
  const reachedGoals = goals.filter((g) => g.reached && g.kind === "reward");
  for (const g of reachedGoals.slice(0, 2)) tips.push({ kind: "sugestao", text: `Meta atingida: ${g.title}. O resgate continua sendo uma decisão sua.` });
  const lastRedeem = [...redemptions.rows].map((r) => String(r.d)).sort().pop();
  if (rewards.length && (!lastRedeem || lastRedeem < shiftDayKey(today, -14)) && summary.availableCount > 0)
    tips.push({ kind: "inferencia", text: `Nenhum resgate nos últimos 14 dias e ${summary.availableCount} recompensa(s) disponível(is) — descanso também faz parte do progresso.` });
  if (earned30 > 0 && summary.wallet.spent30 > earned30) tips.push({ kind: "inferencia", text: `Nos últimos 30 dias você gastou ${summary.wallet.spent30} e ganhou ${earned30} moedas.` });
  if (!rewards.length) tips.push({ kind: "sugestao", text: "Crie suas primeiras recompensas (ou use o pacote inicial) para dar destino às moedas." });

  return {
    indicators: {
      coins: summary.coins,
      gems: summary.gems,
      totalXp: summary.totalXp,
      available: summary.availableCount,
      redemptions: redemptions.rows.length,
      redeemStreakWeeks: weeklyStreak(redeemWeeks, thisMonday),
      earned30,
      spent30: summary.wallet.spent30,
    },
    goals,
    economy,
    sources: Object.entries(bySource)
      .map(([source, v]) => ({ source, ...v }))
      .sort((a, b) => b.earned + b.spent - (a.earned + a.spent))
      .slice(0, 8),
    tips,
    goalOptions: {
      rewards: rewards.map((r) => ({ id: r.id, name: r.name, cost: r.cost, currency: r.currency })),
      titles: codex.titles.filter((t) => !t.unlocked).map((t) => ({ id: t.id, name: t.name })),
      relics: codex.relics.filter((t) => !t.unlocked).map((t) => ({ id: t.id, name: t.name })),
      sets: inventory.sets.filter((s) => !s.complete).map((s) => ({ id: s.id, name: s.name })),
    },
  };
}

export async function addRewardGoal(db: Client, ownerId: string, kind: GoalKind, targetId: string) {
  // O alvo precisa existir para o próprio usuário (recompensa) ou no catálogo oficial.
  if (kind === "reward") {
    const r = await db.execute({ sql: "SELECT 1 FROM rewards WHERE id = ? AND owner_id = ?", args: [targetId, ownerId] });
    if (!r.rows.length) throw new HeroError("Recompensa não encontrada.", 404);
  } else {
    const opts = (await getTreasureHub(db, ownerId)).goalOptions;
    const pool = kind === "title" ? opts.titles : kind === "relic" ? opts.relics : opts.sets;
    if (!pool.some((p) => p.id === targetId)) throw new HeroError("Alvo inválido ou já conquistado.", 400);
  }
  const count = await db.execute({ sql: "SELECT COUNT(*) AS n FROM hero_reward_goals WHERE owner_id = ?", args: [ownerId] });
  if (Number(count.rows[0]?.n ?? 0) >= 12) throw new HeroError("Limite de 12 metas de recompensa.", 409);
  await db.execute({
    sql: "INSERT OR IGNORE INTO hero_reward_goals (id, owner_id, kind, target_id) VALUES (?, ?, ?, ?)",
    args: [nanoid(), ownerId, kind, targetId],
  });
}

export async function removeRewardGoal(db: Client, ownerId: string, id: string) {
  const r = await db.execute({ sql: "DELETE FROM hero_reward_goals WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  if (!r.rowsAffected) throw new HeroError("Meta não encontrada.", 404);
}

/** Automação diária: avisa (uma vez) quando uma meta de recompensa fica disponível. */
export async function runRewardGoalReady(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const hub = await getTreasureHub(db, ownerId);
  const notified = await db.execute({ sql: "SELECT id FROM hero_reward_goals WHERE owner_id = ? AND notified_at IS NOT NULL", args: [ownerId] });
  const done = new Set(notified.rows.map((r) => String(r.id)));
  const fresh = hub.goals.filter((g) => g.reached && !done.has(g.id));
  if (!fresh.length) return { status: "skipped", summary: "Nenhuma meta nova atingida." };
  for (const g of fresh) await db.execute({ sql: "UPDATE hero_reward_goals SET notified_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [g.id, ownerId] });
  await notifyFromAutomation(db, ownerId, {
    eventType: "hero_goal",
    title: "🎯 Meta de recompensa atingida",
    body: `${fresh.map((g) => g.title).join(", ")} — nada é resgatado sem a sua confirmação.`,
    url: "/tesouro?aba=metas",
    inApp: config.inApp !== false,
    push: config.push === true,
  });
  return { status: "ok", summary: `${fresh.length} meta(s) atingida(s) avisada(s).` };
}

/** Automação semanal: uma sugestão de recompensa com base no saldo real. */
export async function runWeeklyRewardSuggestion(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const hub = await getTreasureHub(db, ownerId);
  const tip = hub.tips.find((t) => t.kind !== "dado") ?? hub.tips[0];
  if (!tip) return { status: "skipped", summary: "Sem sugestão nesta semana." };
  await notifyFromAutomation(db, ownerId, { eventType: "hero_reward_tip", title: "🎁 Sugestão do Tesouro", body: tip.text, url: "/tesouro", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: tip.text };
}

/* ═══════════════════════════════ Build ═══════════════════════════════ */

export interface BuildSnapshot {
  id: string;
  periodKey: string;
  origin: "auto" | "manual";
  archetypeId: string | null;
  archetypeName: string | null;
  affinity: number | null;
  scores: Record<string, number>;
  createdAt: string;
}

const toSnapshot = (r: Row): BuildSnapshot => ({
  id: String(r.id),
  periodKey: String(r.period_key),
  origin: String(r.origin) === "manual" ? "manual" : "auto",
  archetypeId: r.archetype_id == null ? null : String(r.archetype_id),
  archetypeName: r.archetype_name == null ? null : String(r.archetype_name),
  affinity: r.affinity == null ? null : Number(r.affinity),
  scores: (() => {
    try {
      return JSON.parse(String(r.scores)) as Record<string, number>;
    } catch {
      return {};
    }
  })(),
  createdAt: String(r.created_at),
});

/** Mudanças de arquétipo entre fotografias consecutivas (marcos da build). */
export function archetypeChanges(snaps: BuildSnapshot[]) {
  const sorted = [...snaps].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const out: Array<{ from: string | null; to: string; at: string; snapshotId: string }> = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (cur.archetypeId && prev.archetypeId && cur.archetypeId !== prev.archetypeId) out.push({ from: prev.archetypeName, to: cur.archetypeName ?? cur.archetypeId, at: cur.createdAt, snapshotId: cur.id });
  }
  return out;
}

export async function listBuildSnapshots(db: Client, ownerId: string) {
  const r = await db.execute({ sql: "SELECT * FROM build_snapshots WHERE owner_id = ? ORDER BY created_at DESC LIMIT 60", args: [ownerId] });
  const snapshots = r.rows.map((x) => toSnapshot(x as Row));
  return { snapshots, changes: archetypeChanges(snapshots).reverse() };
}

/**
 * Grava uma fotografia da build. Automática = 1 por semana; manual = 1 por dia.
 * INSERT OR IGNORE: o histórico nunca é sobrescrito.
 */
export async function recordBuildSnapshot(db: Client, ownerId: string, origin: "auto" | "manual") {
  const overview = await getBuildOverview(db, ownerId);
  if (!overview.sufficiency.enough || !overview.archetype) throw new HeroError("Ainda não há XP suficiente na janela para registrar a build.", 409);
  const periodKey = origin === "auto" ? `week:${mondayKey(overview.today)}` : `manual:${overview.today}`;
  const scores = Object.fromEntries(overview.attributes.map((a) => [a.key, a.score]));
  const r = await db.execute({
    sql: `INSERT OR IGNORE INTO build_snapshots (id, owner_id, period_key, origin, archetype_id, archetype_name, affinity, scores)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [nanoid(), ownerId, periodKey, origin, overview.archetype.id, overview.archetype.name, overview.archetype.affinity, JSON.stringify(scores)],
  });
  return { created: r.rowsAffected > 0, periodKey, archetype: overview.archetype.name };
}

/** Automação semanal: fotografa a build e avisa se o arquétipo mudou. */
export async function runBuildSnapshot(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  let res: Awaited<ReturnType<typeof recordBuildSnapshot>>;
  try {
    res = await recordBuildSnapshot(db, ownerId, "auto");
  } catch (e) {
    if (e instanceof HeroError) return { status: "skipped", summary: e.message };
    throw e;
  }
  if (!res.created) return { status: "skipped", summary: "A fotografia desta semana já existe." };
  const { snapshots, changes } = await listBuildSnapshots(db, ownerId);
  const last = changes[0];
  // Só avisa quando a fotografia recém-criada é a que marcou a troca.
  if (last && last.snapshotId === snapshots[0]?.id) {
    await notifyFromAutomation(db, ownerId, {
      eventType: "hero_archetype",
      title: "🧭 Seu arquétipo mudou",
      body: `${last.from ?? "Antes"} → ${last.to}. Veja a linha do tempo da build.`,
      url: "/build?aba=marcos",
      inApp: config.inApp !== false,
      push: config.push === true,
    });
  }
  return { status: "ok", summary: `Build registrada (${res.archetype}).` };
}

/** Eventos de mudança de arquétipo para a Crônica (lidos das fotografias reais). */
export async function buildTimelineEvents(db: Client, ownerId: string, fromDay: string, toDay: string) {
  const { snapshots } = await listBuildSnapshots(db, ownerId);
  return archetypeChanges(snapshots)
    .filter((c) => c.at.slice(0, 10) >= fromDay && c.at.slice(0, 10) <= toDay)
    .map((c) => ({ type: "archetype", icon: "🧭", id: `archetype-${c.snapshotId}`, label: `Novo arquétipo: ${c.to}${c.from ? ` (antes ${c.from})` : ""}`, at: c.at }));
}

/* ═══════════════════════════════ Crônica 2.0 ═══════════════════════════════ */

const SOURCE_LABEL: Record<string, string> = {
  task: "Missões",
  day: "Bônus do dia",
  habit_entry: "Hábitos",
  habit_streak: "Sequências de hábito",
  focus: "Foco",
  project: "Projetos",
  journal: "Diário",
  review: "Revisões",
  life_admin: "Administração",
  achievement: "Conquistas",
  contract: "Contratos",
  experiment: "Laboratório",
  campaign: "Campanhas",
  grimoire: "Grimório",
  quest: "Quadro de Avisos",
  bank: "Banco",
};
export const sourceLabel = (s: string) => SOURCE_LABEL[s] ?? s;

interface XpRow {
  source_type: string;
  day_key: string;
  xp: number;
}

/** Soma XP/atividades por origem num recorte de dias (entrada já filtrada pelo dono). */
export function summarize(rows: XpRow[], from: string, to: string) {
  const inRange = rows.filter((r) => r.day_key >= from && r.day_key <= to);
  const bySource: Record<string, { xp: number; count: number }> = {};
  for (const r of inRange) {
    const cur = bySource[r.source_type] ?? { xp: 0, count: 0 };
    cur.xp += r.xp;
    cur.count += 1;
    bySource[r.source_type] = cur;
  }
  return {
    from,
    to,
    xp: inRange.reduce((s, r) => s + r.xp, 0),
    activities: inRange.length,
    activeDays: new Set(inRange.map((r) => r.day_key)).size,
    top: Object.entries(bySource)
      .map(([source, v]) => ({ source, label: sourceLabel(source), ...v }))
      .sort((a, b) => b.xp - a.xp)
      .slice(0, 4),
  };
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;

export async function getJourneyHub(db: Client, ownerId: string, fromQ?: string, toQ?: string) {
  const { today } = await userDayContext(db, ownerId);
  const to = toQ && toQ <= today ? toQ : today;
  const from = fromQ && fromQ <= to ? fromQ : shiftDayKey(to, -29);
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const minDay = [from, yearStart, shiftDayKey(mondayKey(today), -56)].sort()[0]!;
  const [xpRows, coins, achievementsN, levelUps, marks, moments, profile] = await Promise.all([
    db.execute({ sql: "SELECT source_type, day_key, xp FROM xp_events WHERE owner_id = ? AND day_key >= ? AND day_key <= ?", args: [ownerId, minDay, today] }),
    db.execute({
      sql: `SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS earned, COALESCE(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END), 0) AS spent
            FROM coin_ledger WHERE owner_id = ? AND date(created_at) >= ? AND date(created_at) <= ?`,
      args: [ownerId, from, to],
    }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM user_achievements WHERE owner_id = ? AND date(unlocked_at) >= ? AND date(unlocked_at) <= ?", args: [ownerId, from, to] }),
    getLevelHistory(db, ownerId),
    db.execute({ sql: "SELECT event_key, label, event_at, created_at FROM chronicle_marks WHERE owner_id = ? ORDER BY event_at DESC LIMIT 100", args: [ownerId] }),
    db.execute({
      sql: `SELECT m.id, m.data_uri, m.caption, e.entry_date FROM chronicle_moments cm
            JOIN journal_entry_media m ON m.id = cm.media_id AND m.owner_id = cm.owner_id
            JOIN journal_entries e ON e.id = m.entry_id
            WHERE cm.owner_id = ? AND m.kind = 'photo' ORDER BY e.entry_date DESC LIMIT 24`,
      args: [ownerId],
    }),
    getPlayerProfile(db, ownerId),
  ]);
  const rows = xpRows.rows.map((r) => ({ source_type: String(r.source_type), day_key: String(r.day_key), xp: Number(r.xp) }));
  const period = summarize(rows, from, to);
  const span = Math.max(1, daysBetween(from, to));
  const thisMonday = mondayKey(today);
  const weekly = Array.from({ length: 8 }, (_, i) => {
    const w = shiftDayKey(thisMonday, -7 * (7 - i));
    const s = summarize(rows, w, shiftDayKey(w, 6));
    return { week: w, xp: s.xp, activities: s.activities };
  });
  const lastW = weekly[7]!;
  const prevW = weekly[6]!;
  return {
    from,
    to,
    today,
    indicators: {
      xp: period.xp,
      activities: period.activities,
      coinsEarned: Number(coins.rows[0]?.earned ?? 0),
      coinsSpent: Number(coins.rows[0]?.spent ?? 0),
      // Saldo é a carteira atual — não é a soma do período.
      balance: profile.coins,
      achievements: Number(achievementsN.rows[0]?.n ?? 0),
      missions: rows.filter((r) => r.source_type === "task" && r.day_key >= from && r.day_key <= to).length,
      quests: rows.filter((r) => r.source_type === "quest" && r.day_key >= from && r.day_key <= to).length,
      levelUps: levelUps.filter((l) => l.dayKey >= from && l.dayKey <= to).length,
      consistencyPct: Math.round((period.activeDays / span) * 100),
      activeDays: period.activeDays,
      spanDays: span,
      weekDeltaPct: prevW.xp > 0 ? Math.round(((lastW.xp - prevW.xp) / prevW.xp) * 100) : null,
      level: profile.level,
      totalXp: profile.totalXp,
    },
    weekly,
    summaries: {
      day: summarize(rows, today, today),
      week: summarize(rows, thisMonday, today),
      month: summarize(rows, `${today.slice(0, 7)}-01`, today),
      year: summarize(rows, yearStart, today),
      period,
    },
    levels: levelUps.slice(-12).reverse(),
    marks: marks.rows.map((m) => ({ eventKey: String(m.event_key), label: String(m.label), at: String(m.event_at), createdAt: String(m.created_at) })),
    moments: moments.rows.map((m) => ({ id: String(m.id), dataUri: String(m.data_uri), caption: m.caption == null ? null : String(m.caption), date: String(m.entry_date) })),
  };
}

const EVENT_KEY = /^[a-z_]{2,20}:[A-Za-z0-9_:.-]{1,120}$/;

/** Alterna um marco favorito (referência estável "tipo:id" do evento original). */
export async function toggleMark(db: Client, ownerId: string, input: { eventKey: string; label: string; at: string }) {
  if (!EVENT_KEY.test(input.eventKey)) throw new HeroError("Evento inválido.");
  const del = await db.execute({ sql: "DELETE FROM chronicle_marks WHERE owner_id = ? AND event_key = ?", args: [ownerId, input.eventKey] });
  if (del.rowsAffected) return { favorite: false };
  const n = await db.execute({ sql: "SELECT COUNT(*) AS n FROM chronicle_marks WHERE owner_id = ?", args: [ownerId] });
  if (Number(n.rows[0]?.n ?? 0) >= 100) throw new HeroError("Limite de 100 marcos favoritos.", 409);
  await db.execute({
    sql: "INSERT INTO chronicle_marks (owner_id, event_key, label, event_at) VALUES (?, ?, ?, ?)",
    args: [ownerId, input.eventKey, input.label.slice(0, 200), input.at.slice(0, 40)],
  });
  return { favorite: true };
}

/** Fotos do Diário que PODEM ser autorizadas (só miniaturas das próprias entradas, últimos 180 dias). */
export async function momentCandidates(db: Client, ownerId: string) {
  const r = await db.execute({
    sql: `SELECT m.id, m.data_uri, m.caption, e.entry_date,
                 EXISTS (SELECT 1 FROM chronicle_moments cm WHERE cm.owner_id = m.owner_id AND cm.media_id = m.id) AS authorized
          FROM journal_entry_media m JOIN journal_entries e ON e.id = m.entry_id
          WHERE m.owner_id = ? AND m.kind = 'photo' AND e.entry_date >= date('now', '-180 days')
          ORDER BY e.entry_date DESC LIMIT 30`,
    args: [ownerId],
  });
  return r.rows.map((m) => ({ id: String(m.id), dataUri: String(m.data_uri), caption: m.caption == null ? null : String(m.caption), date: String(m.entry_date), authorized: Number(m.authorized) === 1 }));
}

export async function setMoment(db: Client, ownerId: string, mediaId: string, authorized: boolean) {
  const own = await db.execute({ sql: "SELECT 1 FROM journal_entry_media WHERE id = ? AND owner_id = ? AND kind = 'photo'", args: [mediaId, ownerId] });
  if (!own.rows.length) throw new HeroError("Foto não encontrada.", 404);
  if (authorized) await db.execute({ sql: "INSERT OR IGNORE INTO chronicle_moments (owner_id, media_id) VALUES (?, ?)", args: [ownerId, mediaId] });
  else await db.execute({ sql: "DELETE FROM chronicle_moments WHERE owner_id = ? AND media_id = ?", args: [ownerId, mediaId] });
}

export type NarratorMode = "rpg" | "objetivo" | "analitico";

/**
 * Fatos do Narrador: só números do ledger e rótulos de eventos que NÃO vêm do
 * Diário (o texto das crônicas nunca entra; entradas do Diário só são contadas).
 */
export async function narratorFacts(db: Client, ownerId: string, from: string, to: string) {
  const hub = await getJourneyHub(db, ownerId, from, to);
  const labels = await db.execute({
    sql: `SELECT label, source_type FROM xp_events WHERE owner_id = ? AND day_key >= ? AND day_key <= ?
          AND source_type IN ('achievement', 'project', 'campaign', 'contract', 'review', 'experiment', 'quest') AND label IS NOT NULL
          ORDER BY xp DESC LIMIT 8`,
    args: [ownerId, hub.from, hub.to],
  });
  const i = hub.indicators;
  const facts = [
    `Período: ${hub.from} a ${hub.to} (${i.spanDays} dias).`,
    `${i.xp} XP recebidos em ${i.activities} atividades, em ${i.activeDays} dia(s) ativos (${i.consistencyPct}% de consistência).`,
    `${i.coinsEarned} moedas ganhas e ${i.coinsSpent} gastas no período; saldo atual ${i.balance}.`,
    `${i.achievements} conquista(s) desbloqueada(s), ${i.levelUps} subida(s) de nível, ${i.quests} quest(s) resgatada(s).`,
    ...hub.summaries.period.top.map((t) => `${t.label}: ${t.count} registro(s), ${t.xp} XP.`),
    ...labels.rows.map((l) => `Marco: ${String(l.label)}.`),
  ];
  return { hub, facts, insufficient: i.activities < 3 };
}

/** Texto determinístico (sem IA) para cada modo — usa apenas os fatos. */
export function deterministicNarration(mode: NarratorMode, facts: string[], insufficient: boolean): string[] {
  if (insufficient) return ["Ainda há poucos registros neste período para contar uma história. Cada missão, hábito ou leitura registrada vira um capítulo."];
  if (mode === "objetivo") return facts.slice(1, 5);
  if (mode === "analitico") return facts;
  return [`Nesta etapa da jornada: ${facts[1]?.toLowerCase() ?? ""}`, facts[3] ?? "", ...facts.filter((f) => f.startsWith("Marco:")).slice(0, 3)].filter(Boolean);
}

export async function narrateJourney(db: Client, ownerId: string, opts: { from?: string; to?: string; mode: NarratorMode; useAi: boolean }) {
  const { hub, facts, insufficient } = await narratorFacts(db, ownerId, opts.from ?? "", opts.to ?? "");
  const base = { mode: opts.mode, facts, insufficient, from: hub.from, to: hub.to, disclaimer: "Gerado a partir dos eventos registrados. O texto do Diário não é usado." };
  const fallback = { ...base, ai: false, paragraphs: deterministicNarration(opts.mode, facts, insufficient) };
  if (!opts.useAi || insufficient) return fallback;
  const config = await getGeminiConfig();
  if (!config) return fallback;
  const style = {
    rpg: "Narre como um cronista de RPG, em tom épico mas sóbrio, 2 a 4 parágrafos curtos.",
    objetivo: "Faça um resumo objetivo em 3 a 5 frases diretas.",
    analitico: "Faça um relatório analítico em até 6 itens curtos, citando os números.",
  }[opts.mode];
  const prompt = `Você é o Narrador da Jornada do LifeOS. Escreva em português do Brasil. ${style}
Use SOMENTE os fatos abaixo. NÃO invente eventos, números, pessoas, lugares ou sentimentos. Se algo não estiver nos fatos, não mencione.
FATOS:
${facts.map((f) => `- ${f}`).join("\n")}
Responda em JSON: {"paragraphs": ["..."]}`;
  const r = await generateText(prompt, config, { timeoutMs: 20_000, retries: 1, maxOutputTokens: 900 });
  if (!r.ok) return fallback;
  const parsed = extractJson(r.text) as { paragraphs?: unknown[] } | null;
  const paragraphs = (parsed?.paragraphs ?? []).filter((p): p is string => typeof p === "string").map((p) => str(p, 700) ?? "").filter(Boolean).slice(0, 6);
  return paragraphs.length ? { ...base, ai: true, paragraphs } : fallback;
}

/** Automação semanal: retrospectiva da semana anterior (números reais do ledger). */
export async function runJourneyWeeklyRetro(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const today = await todayKeyFor(db, ownerId);
  const lastMonday = shiftDayKey(mondayKey(today), -7);
  const hub = await getJourneyHub(db, ownerId, lastMonday, shiftDayKey(lastMonday, 6));
  const i = hub.indicators;
  if (!i.activities) return { status: "skipped", summary: "Semana passada sem registros." };
  const body = `${i.xp} XP em ${i.activities} atividades · ${i.activeDays}/7 dias ativos · ${i.achievements} conquista(s).`;
  await notifyFromAutomation(db, ownerId, { eventType: "journey_retro", title: "📜 Sua semana na Crônica", body, url: "/timeline?aba=resumos", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: body };
}

/** Automação diária: avisa subidas de nível e conquistas Ouro/Platina novas (uma vez cada). */
export async function runJourneyBigMoments(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const state = await readAutomationState(db, ownerId, "journey", "big_moments");
  const lastLevel = Number(state.level ?? 0);
  const since = typeof state.since === "string" ? state.since : null;
  const [levels, big] = await Promise.all([
    getLevelHistory(db, ownerId),
    db.execute({
      sql: `SELECT a.title, ua.unlocked_at FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id
            WHERE ua.owner_id = ? AND a.tier IN ('gold', 'platinum') AND ua.unlocked_at > ? ORDER BY ua.unlocked_at`,
      args: [ownerId, since ?? "9999"],
    }),
  ]);
  const top = levels.at(-1)?.level ?? 1;
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  // Primeira execução só registra o ponto de partida (não notifica o passado).
  if (!since) {
    await writeAutomationState(db, ownerId, "journey", "big_moments", { level: top, since: now });
    return { status: "ok", summary: "Ponto de partida registrado; próximos grandes momentos serão avisados." };
  }
  const parts: string[] = [];
  if (top > lastLevel && lastLevel > 0) parts.push(`Nível ${top} alcançado`);
  for (const r of big.rows.slice(0, 3)) parts.push(`Conquista: ${String(r.title)}`);
  await writeAutomationState(db, ownerId, "journey", "big_moments", { level: Math.max(top, lastLevel), since: now });
  if (!parts.length) return { status: "skipped", summary: "Nenhum grande momento novo." };
  await notifyFromAutomation(db, ownerId, { eventType: "journey_big", title: "👑 Grande momento na jornada", body: parts.join(" · "), url: "/timeline", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: parts.join(" · ") };
}
