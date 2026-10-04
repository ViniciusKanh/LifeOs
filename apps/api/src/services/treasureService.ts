import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { TREASURE_CONFIG } from "../config/treasure.js";
import { loadCampaigns } from "./campaignsService.js";
import { getLevelHistory, getPlayerProfile, getWalletSummary, xpToReachLevel } from "./gamificationService.js";
import { gemBalance, listRewardsWithAvailability, type RewardWithAvailability } from "./rewardsService.js";
import { toSqliteUtc } from "./treasureEngine.js";

/**
 * Tesouro & Recompensas — leituras agregadas (KPIs, metas raras) e a
 * concessão de gemas. Gemas só nascem de marcos especiais reais e são
 * creditadas de forma idempotente (UNIQUE no gem_ledger), então chamar
 * syncGems várias vezes nunca duplica nada.
 */

const isoToSqlite = (iso: string) => (iso.includes("T") ? toSqliteUtc(new Date(iso)) : iso);

export async function syncGems(db: Client, ownerId: string): Promise<void> {
  const G = TREASURE_CONFIG.gems;
  const [levels, campaigns, achievements] = await Promise.all([
    getLevelHistory(db, ownerId),
    db.execute({ sql: "SELECT id, title, completed_at FROM campaigns WHERE owner_id = ? AND status = 'completed' AND completed_at IS NOT NULL", args: [ownerId] }),
    db.execute({
      sql: `SELECT a.id, a.title, a.tier, ua.unlocked_at FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id
            WHERE ua.owner_id = ? AND a.tier IN ('gold', 'platinum')`,
      args: [ownerId],
    }),
  ]);
  const grants: Array<{ source: string; id: string; event: string; amount: number; label: string; at: string }> = [
    ...levels.map((l) => ({ source: "level", id: String(l.level), event: "level_up", amount: G.perLevel, label: `Nível ${l.level} alcançado`, at: isoToSqlite(l.reachedAt) })),
    ...campaigns.rows.map((c) => ({ source: "campaign", id: String(c.id), event: "completed", amount: G.campaignCompleted, label: `Campanha concluída: ${String(c.title)}`, at: isoToSqlite(String(c.completed_at)) })),
    ...achievements.rows.map((a) => ({
      source: "achievement",
      id: String(a.id),
      event: "unlocked",
      amount: G.achievementTier[String(a.tier)] ?? 0,
      label: `Conquista rara: ${String(a.title)}`,
      at: isoToSqlite(String(a.unlocked_at)),
    })),
  ].filter((g) => g.amount > 0);
  if (grants.length === 0) return;
  await db.batch(
    grants.map((g) => ({
      sql: `INSERT OR IGNORE INTO gem_ledger (id, owner_id, amount, source_type, source_id, event_type, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [nanoid(), ownerId, g.amount, g.source, g.id, g.event, g.label, g.at],
    })),
    "write",
  );
}

export interface TreasureSummary {
  totalXp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progressPct: number;
  coins: number;
  gems: number;
  gemsEarned: number;
  streak: { days: number; bonusPct: number; campaignTitle: string | null };
  availableCount: number;
  wallet: { earned30: number; spent30: number; earned: number; spent: number };
}

export async function getTreasureSummary(db: Client, ownerId: string, rewards?: RewardWithAvailability[]): Promise<TreasureSummary> {
  await syncGems(db, ownerId);
  const [profile, wallet, gems, gemsEarned, campaigns, list] = await Promise.all([
    getPlayerProfile(db, ownerId),
    getWalletSummary(db, ownerId),
    gemBalance(db, ownerId),
    db.execute({ sql: "SELECT COALESCE(SUM(amount), 0) AS total FROM gem_ledger WHERE owner_id = ? AND amount > 0 AND event_type != 'refund'", args: [ownerId] }),
    loadCampaigns(db, ownerId),
    rewards ? Promise.resolve(rewards) : listRewardsWithAvailability(db, ownerId, false),
  ]);
  // Bônus de sequência real: o maior bônus de moedas entre as campanhas ativas.
  const best = campaigns.filter((c) => c.status === "active" && c.streak.coinsPct > 0).sort((a, b) => b.streak.coinsPct - a.streak.coinsPct)[0];
  return {
    totalXp: profile.totalXp,
    level: profile.level,
    xpIntoLevel: profile.xpIntoLevel,
    xpForNextLevel: profile.xpForNextLevel,
    progressPct: profile.progressPct,
    coins: profile.coins,
    gems,
    gemsEarned: Number(gemsEarned.rows[0]?.total ?? 0),
    streak: { days: profile.streakDays, bonusPct: best?.streak.coinsPct ?? 0, campaignTitle: best?.title ?? null },
    availableCount: list.filter((r) => r.availability.available).length,
    wallet: { earned30: wallet.earned30, spent30: wallet.spent30, earned: wallet.earned, spent: wallet.spent },
  };
}

export interface RareGoal {
  id: string;
  kind: "level" | "xp" | "achievement" | "campaign";
  title: string;
  current: number;
  target: number;
  /** O que o marco libera (recompensa bloqueada ou gemas). */
  unlocks: string;
  rarity: string | null;
}

/**
 * Metas para itens raros — derivadas de dados reais: requisitos das
 * recompensas ainda bloqueadas e os próximos marcos que rendem gemas.
 */
export async function getRareGoals(db: Client, ownerId: string, rewards?: RewardWithAvailability[]): Promise<RareGoal[]> {
  const [profile, campaigns, list, achievements] = await Promise.all([
    getPlayerProfile(db, ownerId),
    loadCampaigns(db, ownerId),
    rewards ? Promise.resolve(rewards) : listRewardsWithAvailability(db, ownerId, false),
    db.execute({ sql: "SELECT id, title FROM achievements", args: [] }),
  ]);
  const achievementTitle = new Map(achievements.rows.map((a) => [String(a.id), String(a.title)]));
  const goals: RareGoal[] = [];
  const seen = new Set<string>();

  for (const r of list) {
    const a = r.availability;
    let goal: RareGoal | null = null;
    if (a.missingLevel > 0 && r.requiredLevel) {
      goal = { id: `level-${r.requiredLevel}`, kind: "level", title: `Alcançar Nível ${r.requiredLevel}`, current: profile.level, target: r.requiredLevel, unlocks: r.name, rarity: r.rarity };
    } else if (a.missingXp > 0 && r.requiredXp) {
      goal = { id: `xp-${r.requiredXp}`, kind: "xp", title: `Acumular ${r.requiredXp.toLocaleString("pt-BR")} XP`, current: profile.totalXp, target: r.requiredXp, unlocks: r.name, rarity: r.rarity };
    } else if (a.code === "achievement" && r.requiredAchievementId) {
      goal = { id: `ach-${r.requiredAchievementId}`, kind: "achievement", title: `Conquista: ${achievementTitle.get(r.requiredAchievementId) ?? "requerida"}`, current: 0, target: 1, unlocks: r.name, rarity: r.rarity };
    }
    if (goal && !seen.has(goal.id)) {
      seen.add(goal.id);
      goals.push(goal);
    }
  }

  const nextLevel = profile.level + 1;
  if (!seen.has(`level-${nextLevel}`)) {
    goals.push({
      id: `level-${nextLevel}`,
      kind: "level",
      title: `Alcançar Nível ${nextLevel}`,
      current: profile.totalXp - xpToReachLevel(profile.level),
      target: xpToReachLevel(nextLevel) - xpToReachLevel(profile.level),
      unlocks: `+${TREASURE_CONFIG.gems.perLevel} gema`,
      rarity: null,
    });
  }
  const campaign = campaigns.filter((c) => c.status === "active").sort((a, b) => b.progress.pct - a.progress.pct)[0];
  if (campaign) {
    goals.push({ id: `campaign-${campaign.id}`, kind: "campaign", title: `Concluir “${campaign.title}”`, current: campaign.progress.pct, target: 100, unlocks: `+${TREASURE_CONFIG.gems.campaignCompleted} gemas`, rarity: null });
  }
  // Mais perto de concluir primeiro (determinístico).
  return goals.sort((a, b) => b.current / Math.max(1, b.target) - a.current / Math.max(1, a.target) || a.id.localeCompare(b.id)).slice(0, 4);
}
