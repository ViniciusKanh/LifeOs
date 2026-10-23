import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import {
  SEASON_TIERS,
  daysLeftInSeason,
  previousSeasonKey,
  seasonKeyOf,
  seasonRange,
  seasonRewardKey,
  seasonRewardName,
  seasonTheme,
  tierForXp,
} from "./seasonRules.js";

/**
 * Temporadas mensais. XP da temporada = soma de xp_events do mês (fonte
 * original, nada copiado). Recompensas são cosméticas e entram no ledger
 * do inventário já existente (inventory_transactions, idempotente pela
 * UNIQUE do ledger) — aparecem na Coleção e na Timeline como os demais itens.
 */

export interface SeasonSummary {
  seasonKey: string;
  name: string;
  xp: number;
  tier: number;
  questsCompleted: number;
  closedAt: string;
}

export interface SeasonView {
  seasonKey: string;
  name: string;
  motto: string;
  from: string;
  to: string;
  daysLeft: number;
  xp: number;
  tier: number;
  maxTier: number;
  nextTier: { tier: number; xp: number; missing: number; reward: string } | null;
  tiers: Array<{ tier: number; xp: number; reward: string; rarity: string; unlocked: boolean; unlockedAt: string | null }>;
  questsCompleted: number;
  previous: SeasonSummary | null;
}

async function seasonXp(db: Client, ownerId: string, seasonKey: string): Promise<number> {
  const { from, to } = seasonRange(seasonKey);
  const r = await db.execute({ sql: "SELECT COALESCE(SUM(xp), 0) AS xp FROM xp_events WHERE owner_id = ? AND day_key >= ? AND day_key <= ?", args: [ownerId, from, to] });
  return Number(r.rows[0]?.xp ?? 0);
}

/** Quests resgatadas cujo período começou dentro do mês da temporada. */
async function seasonQuestsCompleted(db: Client, ownerId: string, seasonKey: string): Promise<number> {
  const { from, to } = seasonRange(seasonKey);
  const r = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM quest_assignments WHERE owner_id = ? AND claimed_at IS NOT NULL AND replaced_at IS NULL AND period_key >= ? AND period_key <= ?",
    args: [ownerId, from, to],
  });
  return Number(r.rows[0]?.n ?? 0);
}

/**
 * Concede (idempotente) os cosméticos dos tiers alcançados que ainda não
 * estão no ledger. Só escreve quando falta algo — leitura comum não gera escrita.
 */
async function grantTierRewards(db: Client, ownerId: string, seasonKey: string, tier: number, alreadyUnlocked?: ReadonlyMap<string, string>): Promise<boolean> {
  if (tier <= 0) return false;
  const name = seasonTheme(seasonKey).name;
  const have = alreadyUnlocked ?? (await unlockedAt(db, ownerId, seasonKey));
  const missing = SEASON_TIERS.filter((t) => t.tier <= tier && !have.has(seasonRewardKey(seasonKey, t.tier)));
  if (missing.length === 0) return false;
  await db.batch(
    missing.map((t) => ({
      sql: `INSERT OR IGNORE INTO inventory_transactions (id, owner_id, item_key, type, quantity, source_type, source_id, label)
            VALUES (?, ?, ?, 'acquire', 1, 'season', ?, ?)`,
      args: [nanoid(), ownerId, seasonRewardKey(seasonKey, t.tier), `${seasonKey}:${t.tier}`, `${name} — tier ${t.tier}: ${seasonRewardName(seasonKey, t.tier)}`],
    })),
    "write",
  );
  return true;
}

/** Cosméticos da temporada já no ledger (item_key → data de desbloqueio). */
async function unlockedAt(db: Client, ownerId: string, seasonKey: string): Promise<Map<string, string>> {
  const r = await db.execute({
    sql: "SELECT item_key, created_at FROM inventory_transactions WHERE owner_id = ? AND type = 'acquire' AND source_type = 'season' AND item_key LIKE ?",
    args: [ownerId, `season:${seasonKey}:%`],
  });
  return new Map(r.rows.map((x) => [String(x.item_key), String(x.created_at)]));
}

function toSummary(r: Record<string, unknown>): SeasonSummary {
  return {
    seasonKey: String(r.season_key),
    name: String(r.name),
    xp: Number(r.xp),
    tier: Number(r.tier),
    questsCompleted: Number(r.quests_completed),
    closedAt: String(r.closed_at),
  };
}

/**
 * Fecha a temporada anterior de forma preguiçosa e idempotente: na primeira
 * leitura do mês novo grava o resumo (UNIQUE por usuário+temporada) e
 * garante os cosméticos alcançados. Mês sem nenhuma atividade não gera resumo.
 */
export async function closePreviousSeason(db: Client, ownerId: string, today: string): Promise<SeasonSummary | null> {
  const prev = previousSeasonKey(seasonKeyOf(today));
  const existing = await db.execute({ sql: "SELECT * FROM season_summaries WHERE owner_id = ? AND season_key = ?", args: [ownerId, prev] });
  if (existing.rows[0]) return toSummary(existing.rows[0] as unknown as Record<string, unknown>);
  const [xp, quests] = await Promise.all([seasonXp(db, ownerId, prev), seasonQuestsCompleted(db, ownerId, prev)]);
  if (xp <= 0 && quests <= 0) return null;
  const tier = tierForXp(xp);
  await grantTierRewards(db, ownerId, prev, tier);
  await db.execute({
    sql: `INSERT INTO season_summaries (id, owner_id, season_key, name, xp, tier, quests_completed) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (owner_id, season_key) DO NOTHING`,
    args: [nanoid(), ownerId, prev, seasonTheme(prev).name, xp, tier, quests],
  });
  const saved = await db.execute({ sql: "SELECT * FROM season_summaries WHERE owner_id = ? AND season_key = ?", args: [ownerId, prev] });
  return saved.rows[0] ? toSummary(saved.rows[0] as unknown as Record<string, unknown>) : null;
}

export async function getSeason(db: Client, ownerId: string, today: string): Promise<SeasonView> {
  const seasonKey = seasonKeyOf(today);
  const theme = seasonTheme(seasonKey);
  const { from, to } = seasonRange(seasonKey);
  const previous = await closePreviousSeason(db, ownerId, today);
  const [xp, questsCompleted] = await Promise.all([seasonXp(db, ownerId, seasonKey), seasonQuestsCompleted(db, ownerId, seasonKey)]);
  const tier = tierForXp(xp);
  let at = await unlockedAt(db, ownerId, seasonKey);
  if (await grantTierRewards(db, ownerId, seasonKey, tier, at)) at = await unlockedAt(db, ownerId, seasonKey);
  const next = SEASON_TIERS.find((t) => t.tier === tier + 1) ?? null;
  return {
    seasonKey,
    name: theme.name,
    motto: theme.motto,
    from,
    to,
    daysLeft: daysLeftInSeason(today),
    xp,
    tier,
    maxTier: SEASON_TIERS.length,
    nextTier: next ? { tier: next.tier, xp: next.xp, missing: next.xp - xp, reward: seasonRewardName(seasonKey, next.tier) } : null,
    tiers: SEASON_TIERS.map((t) => {
      const key = seasonRewardKey(seasonKey, t.tier);
      return { tier: t.tier, xp: t.xp, reward: seasonRewardName(seasonKey, t.tier), rarity: t.rarity, unlocked: at.has(key), unlockedAt: at.get(key) ?? null };
    }),
    questsCompleted,
    previous,
  };
}
