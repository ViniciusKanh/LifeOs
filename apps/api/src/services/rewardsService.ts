import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { type LimitPeriod, type RewardArt, type RewardCurrency, type RewardRarity } from "../config/treasure.js";
import { coinBalance, levelForXp, userTimezone } from "./gamificationService.js";
import { getRewardAvailability, periodWindow, toSqliteUtc, type Availability, type AvailabilityWallet } from "./treasureEngine.js";

/**
 * Tesouro & Recompensas (evolução da Loja): o usuário define as próprias
 * recompensas e as troca por moedas (ou gemas) ganhas com ações reais.
 * Sem aleatoriedade, sem dinheiro real. Saldos sempre derivados dos
 * ledgers (coin_ledger / gem_ledger) — o resgate grava o débito na mesma
 * transação, com guardas em SQL contra clique duplo e corrida.
 */

export interface RewardRow {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  category: string;
  rarity: RewardRarity;
  currency: RewardCurrency;
  cost: number;
  requiredLevel: number | null;
  requiredXp: number | null;
  requiredAchievementId: string | null;
  redemptionLimit: number | null;
  cooldownHours: number;
  limitPeriod: LimitPeriod;
  tags: string[];
  art: RewardArt | null;
  isFavorite: boolean;
  isAiGenerated: boolean;
  isActive: boolean;
  timesRedeemed: number;
  lastRedeemedAt: string | null;
  /** Momento em que o cooldown termina (null = sem recarga agora). */
  availableAt: string | null;
  createdAt: string;
}

/** Recompensa + estado calculado no servidor para o usuário atual. */
export type RewardWithAvailability = RewardRow & { availability: Availability };

export interface RewardInput {
  name: string;
  description?: string | null;
  icon?: string | null;
  category?: string;
  rarity?: RewardRarity;
  currency?: RewardCurrency;
  cost: number;
  requiredLevel?: number | null;
  requiredXp?: number | null;
  requiredAchievementId?: string | null;
  redemptionLimit?: number | null;
  cooldownHours?: number;
  limitPeriod?: LimitPeriod;
  tags?: string[];
  art?: RewardArt | null;
  isFavorite?: boolean;
  isAiGenerated?: boolean;
  isActive?: boolean;
}

/** SQLite devolve "YYYY-MM-DD HH:MM:SS" em UTC — normaliza para ISO. */
export function sqliteToIso(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  return value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
}

function parseTags(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((t): t is string => typeof t === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}

function mapReward(row: Record<string, unknown>, now: Date): RewardRow {
  const cooldownHours = Number(row.cooldown_hours ?? 0);
  const last = sqliteToIso(row.last_redeemed_at);
  let availableAt: string | null = null;
  if (last && cooldownHours > 0) {
    const until = new Date(Date.parse(last) + cooldownHours * 3_600_000);
    if (until > now) availableAt = until.toISOString();
  }
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    id: String(row.id),
    name: String(row.name),
    description: row.description == null ? null : String(row.description),
    icon: row.icon == null ? null : String(row.icon),
    category: String(row.category),
    rarity: (row.rarity ?? "comum") as RewardRarity,
    currency: (row.currency ?? "coin") as RewardCurrency,
    cost: Number(row.cost),
    requiredLevel: num(row.required_level),
    requiredXp: num(row.required_xp),
    requiredAchievementId: row.required_achievement_id == null ? null : String(row.required_achievement_id),
    redemptionLimit: num(row.redemption_limit),
    cooldownHours,
    limitPeriod: (row.limit_period ?? "none") as LimitPeriod,
    tags: parseTags(row.tags),
    art: row.art == null ? null : (String(row.art) as RewardArt),
    isFavorite: Number(row.is_favorite ?? 0) === 1,
    isAiGenerated: Number(row.is_ai_generated ?? 0) === 1,
    isActive: Number(row.is_active) === 1,
    timesRedeemed: Number(row.times_redeemed ?? 0),
    lastRedeemedAt: last,
    availableAt,
    createdAt: String(row.created_at),
  };
}

// Resgates cancelados (estornados) não contam para limite, recarga nem histórico de uso.
const REWARD_SELECT = `SELECT r.*,
    (SELECT COUNT(*) FROM reward_redemptions rr WHERE rr.reward_id = r.id AND rr.owner_id = r.owner_id AND rr.status != 'canceled') AS times_redeemed,
    (SELECT MAX(redeemed_at) FROM reward_redemptions rr WHERE rr.reward_id = r.id AND rr.owner_id = r.owner_id AND rr.status != 'canceled') AS last_redeemed_at
  FROM rewards r`;

export async function listRewards(db: Client, ownerId: string, includeInactive: boolean): Promise<RewardRow[]> {
  const r = await db.execute({
    sql: `${REWARD_SELECT} WHERE r.owner_id = ? ${includeInactive ? "" : "AND r.is_active = 1"} ORDER BY r.is_active DESC, r.cost ASC, r.name ASC`,
    args: [ownerId],
  });
  const now = new Date();
  return r.rows.map((row) => mapReward(row as unknown as Record<string, unknown>, now));
}

export async function getReward(db: Client, ownerId: string, id: string): Promise<RewardRow | null> {
  const r = await db.execute({ sql: `${REWARD_SELECT} WHERE r.id = ? AND r.owner_id = ?`, args: [id, ownerId] });
  const row = r.rows[0];
  return row ? mapReward(row as unknown as Record<string, unknown>, new Date()) : null;
}

/* ------------------------------- Carteira ------------------------------- */

export async function gemBalance(db: Client, ownerId: string): Promise<number> {
  const r = await db.execute({ sql: "SELECT COALESCE(SUM(amount), 0) AS total FROM gem_ledger WHERE owner_id = ?", args: [ownerId] });
  return Number(r.rows[0]?.total ?? 0);
}

export interface WalletContext extends AvailabilityWallet {
  timeZone: string;
}

/** Tudo que a regra de disponibilidade precisa, lido dos ledgers reais. */
export async function loadWalletContext(db: Client, ownerId: string): Promise<WalletContext> {
  const [coins, gems, xp, achievements, timeZone] = await Promise.all([
    coinBalance(db, ownerId),
    gemBalance(db, ownerId),
    db.execute({ sql: "SELECT COALESCE(SUM(xp), 0) AS total FROM xp_events WHERE owner_id = ?", args: [ownerId] }),
    db.execute({ sql: "SELECT achievement_id FROM user_achievements WHERE owner_id = ?", args: [ownerId] }),
    userTimezone(db, ownerId),
  ]);
  const totalXp = Number(xp.rows[0]?.total ?? 0);
  return { coins, gems, totalXp, level: levelForXp(totalXp).level, achievementIds: new Set(achievements.rows.map((a) => String(a.achievement_id))), timeZone };
}

/** Resgates (não cancelados) de cada recompensa dentro do período corrente dela. */
async function redeemedInPeriods(db: Client, ownerId: string, rewards: RewardRow[], ctx: WalletContext, now: Date) {
  const out = new Map<string, { count: number; end: Date | null }>();
  const limited = rewards.filter((r) => r.limitPeriod !== "none");
  if (limited.length === 0) return out;
  const windows = { day: periodWindow("day", now, ctx.timeZone), week: periodWindow("week", now, ctx.timeZone), month: periodWindow("month", now, ctx.timeZone) };
  const since = toSqliteUtc(windows.month.start < windows.week.start ? windows.month.start : windows.week.start);
  const rows = await db.execute({
    sql: "SELECT reward_id, redeemed_at FROM reward_redemptions WHERE owner_id = ? AND status != 'canceled' AND redeemed_at >= ?",
    args: [ownerId, since],
  });
  for (const r of limited) {
    const w = windows[r.limitPeriod as "day" | "week" | "month"];
    const startSql = toSqliteUtc(w.start);
    const count = rows.rows.filter((x) => String(x.reward_id) === r.id && String(x.redeemed_at) >= startSql).length;
    out.set(r.id, { count, end: w.end });
  }
  return out;
}

/** Lista com o estado calculado no servidor (getRewardAvailability). */
export async function listRewardsWithAvailability(db: Client, ownerId: string, includeInactive: boolean): Promise<RewardWithAvailability[]> {
  const now = new Date();
  const [rewards, ctx] = await Promise.all([listRewards(db, ownerId, includeInactive), loadWalletContext(db, ownerId)]);
  const periods = await redeemedInPeriods(db, ownerId, rewards, ctx, now);
  return rewards.map((r) => {
    const p = periods.get(r.id);
    return { ...r, availability: getRewardAvailability({ ...r, redeemedInPeriod: p?.count ?? 0 }, ctx, now, p?.end ?? null) };
  });
}

/* --------------------------------- CRUD --------------------------------- */

export async function createReward(db: Client, ownerId: string, input: RewardInput): Promise<RewardRow> {
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO rewards (id, owner_id, name, description, icon, category, rarity, currency, cost, required_level, required_xp,
            required_achievement_id, redemption_limit, cooldown_hours, limit_period, tags, art, is_favorite, is_ai_generated, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      ownerId,
      input.name,
      input.description ?? null,
      input.icon ?? null,
      input.category ?? "diversao",
      input.rarity ?? "comum",
      input.currency ?? "coin",
      input.cost,
      input.requiredLevel ?? null,
      input.requiredXp ?? null,
      input.requiredAchievementId ?? null,
      input.redemptionLimit ?? null,
      input.cooldownHours ?? 0,
      input.limitPeriod ?? "none",
      input.tags && input.tags.length > 0 ? JSON.stringify(input.tags) : null,
      input.art ?? null,
      input.isFavorite ? 1 : 0,
      input.isAiGenerated ? 1 : 0,
      input.isActive === false ? 0 : 1,
    ],
  });
  return (await getReward(db, ownerId, id))!;
}

const COLUMN: Record<string, string> = {
  name: "name",
  description: "description",
  icon: "icon",
  category: "category",
  rarity: "rarity",
  currency: "currency",
  cost: "cost",
  requiredLevel: "required_level",
  requiredXp: "required_xp",
  requiredAchievementId: "required_achievement_id",
  redemptionLimit: "redemption_limit",
  cooldownHours: "cooldown_hours",
  limitPeriod: "limit_period",
  art: "art",
};

export async function updateReward(db: Client, ownerId: string, id: string, input: Partial<RewardInput>): Promise<RewardRow | null> {
  const sets: string[] = [];
  const args: Array<string | number | null> = [];
  for (const [key, column] of Object.entries(COLUMN)) {
    const value = (input as Record<string, unknown>)[key];
    if (value !== undefined) {
      sets.push(`${column} = ?`);
      args.push(value as string | number | null);
    }
  }
  if (input.tags !== undefined) {
    sets.push("tags = ?");
    args.push(input.tags.length > 0 ? JSON.stringify(input.tags) : null);
  }
  for (const [key, column] of [["isActive", "is_active"], ["isFavorite", "is_favorite"]] as const) {
    if (input[key] !== undefined) {
      sets.push(`${column} = ?`);
      args.push(input[key] ? 1 : 0);
    }
  }
  sets.push("updated_at = datetime('now')");
  args.push(id, ownerId);
  const res = await db.execute({ sql: `UPDATE rewards SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`, args });
  if (res.rowsAffected === 0) return null;
  return getReward(db, ownerId, id);
}

export async function deleteReward(db: Client, ownerId: string, id: string): Promise<boolean> {
  // Recompensa já resgatada é só desativada (o histórico de resgates fica).
  const used = await db.execute({ sql: "SELECT 1 FROM reward_redemptions WHERE reward_id = ? AND owner_id = ? LIMIT 1", args: [id, ownerId] });
  if (used.rows.length > 0) {
    const r = await db.execute({ sql: "UPDATE rewards SET is_active = 0, updated_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
    return r.rowsAffected > 0;
  }
  const r = await db.execute({ sql: "DELETE FROM rewards WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  return r.rowsAffected > 0;
}

/* -------------------------------- Resgate -------------------------------- */

export type RedeemErrorCode = "not_found" | "inactive" | "insufficient" | "cooldown" | "limit" | "period_limit" | "requirement";

export type RedeemResult =
  | { ok: true; redemptionId: string; balance: number; gems: number; reward: RewardRow; replayed: boolean }
  | { ok: false; code: RedeemErrorCode; message: string; balance?: number; availableAt?: string | null };

const CODE_MAP: Record<string, RedeemErrorCode> = {
  inactive: "inactive",
  sold_out: "limit",
  cooldown: "cooldown",
  period_limit: "period_limit",
  level: "requirement",
  xp: "requirement",
  achievement: "requirement",
  insufficient: "insufficient",
};

async function existingByRequest(db: Client, ownerId: string, requestId: string) {
  const r = await db.execute({ sql: "SELECT id, reward_id FROM reward_redemptions WHERE owner_id = ? AND request_id = ?", args: [ownerId, requestId] });
  return r.rows[0] ? { id: String(r.rows[0].id), rewardId: String(r.rows[0].reward_id) } : null;
}

async function replay(db: Client, ownerId: string, hit: { id: string; rewardId: string }): Promise<RedeemResult> {
  const [reward, balance, gems] = await Promise.all([getReward(db, ownerId, hit.rewardId), coinBalance(db, ownerId), gemBalance(db, ownerId)]);
  return { ok: true, redemptionId: hit.id, balance, gems, reward: reward!, replayed: true };
}

/**
 * Resgate atômico e idempotente:
 * 1. mesma `requestId` devolve o resgate já feito (clique duplo/refresh);
 * 2. as regras são verificadas (getRewardAvailability);
 * 3. resgate + débito vão num único batch "write" e o INSERT só acontece se,
 *    no momento da escrita, saldo, limite total, recarga e período ainda
 *    permitirem — duas requisições simultâneas nunca deixam saldo negativo.
 */
export async function redeemReward(db: Client, ownerId: string, rewardId: string, requestId?: string): Promise<RedeemResult> {
  if (requestId) {
    const hit = await existingByRequest(db, ownerId, requestId);
    if (hit) return replay(db, ownerId, hit);
  }
  const reward = await getReward(db, ownerId, rewardId);
  if (!reward) return { ok: false, code: "not_found", message: "Recompensa não encontrada." };

  const now = new Date();
  const ctx = await loadWalletContext(db, ownerId);
  const period = await redeemedInPeriods(db, ownerId, [reward], ctx, now);
  const p = period.get(reward.id);
  const availability = getRewardAvailability({ ...reward, redeemedInPeriod: p?.count ?? 0 }, ctx, now, p?.end ?? null);
  if (!availability.available) {
    return {
      ok: false,
      code: CODE_MAP[availability.code] ?? "requirement",
      message: availability.reason ?? "Recompensa indisponível.",
      balance: reward.currency === "gem" ? ctx.gems : ctx.coins,
      availableAt: availability.nextAvailableAt,
    };
  }

  const ledger = reward.currency === "gem" ? "gem_ledger" : "coin_ledger";
  const periodStart = reward.limitPeriod === "none" ? "" : toSqliteUtc(periodWindow(reward.limitPeriod, now, ctx.timeZone).start);
  const redemptionId = nanoid();
  try {
    const results = await db.batch(
      [
        {
          sql: `INSERT INTO reward_redemptions (id, owner_id, reward_id, reward_name, cost, currency, status, request_id)
                SELECT ?, ?, ?, ?, ?, ?, 'available', ?
                WHERE (SELECT COALESCE(SUM(amount), 0) FROM ${ledger} WHERE owner_id = ?) >= ?
                  AND (? IS NULL OR (SELECT COUNT(*) FROM reward_redemptions WHERE reward_id = ? AND owner_id = ? AND status != 'canceled') < ?)
                  AND (? = 0 OR NOT EXISTS (
                    SELECT 1 FROM reward_redemptions WHERE reward_id = ? AND owner_id = ? AND status != 'canceled'
                      AND redeemed_at > datetime('now', ?)))
                  AND (? = '' OR NOT EXISTS (
                    SELECT 1 FROM reward_redemptions WHERE reward_id = ? AND owner_id = ? AND status != 'canceled' AND redeemed_at >= ?))`,
          args: [
            redemptionId, ownerId, reward.id, reward.name, reward.cost, reward.currency, requestId ?? null,
            ownerId, reward.cost,
            reward.redemptionLimit, reward.id, ownerId, reward.redemptionLimit,
            reward.cooldownHours, reward.id, ownerId, `-${reward.cooldownHours} hours`,
            periodStart, reward.id, ownerId, periodStart,
          ],
        },
        {
          sql: `INSERT INTO ${ledger} (id, owner_id, amount, source_type, source_id, event_type, label)
                SELECT ?, ?, ?, 'redemption', ?, 'spent', ?
                WHERE EXISTS (SELECT 1 FROM reward_redemptions WHERE id = ?)`,
          args: [nanoid(), ownerId, -reward.cost, redemptionId, `Resgate: ${reward.name}`, redemptionId],
        },
      ],
      "write",
    );
    if (results[0].rowsAffected === 0) {
      // Outra requisição venceu a corrida: devolve o motivo atual.
      const again = await loadWalletContext(db, ownerId);
      const bal = reward.currency === "gem" ? again.gems : again.coins;
      return bal < reward.cost
        ? { ok: false, code: "insufficient", message: reward.currency === "gem" ? "Gemas insuficientes para este resgate." : "Moedas insuficientes para este resgate.", balance: bal }
        : { ok: false, code: "cooldown", message: "Esta recompensa acabou de ser resgatada. Tente novamente mais tarde." };
    }
  } catch (err) {
    // Mesma requestId em paralelo: a UNIQUE barrou o segundo — devolve o primeiro.
    if (requestId) {
      const hit = await existingByRequest(db, ownerId, requestId);
      if (hit) return replay(db, ownerId, hit);
    }
    throw err;
  }
  const [balance, gems, updated] = await Promise.all([coinBalance(db, ownerId), gemBalance(db, ownerId), getReward(db, ownerId, reward.id)]);
  return { ok: true, redemptionId, balance, gems, reward: updated!, replayed: false };
}

/* ------------------------- Inventário e histórico ------------------------- */

export type RedemptionStatus = "available" | "used" | "canceled" | "expired";

export interface RedemptionView {
  id: string;
  rewardId: string;
  rewardName: string;
  cost: number;
  currency: RewardCurrency;
  status: RedemptionStatus;
  icon: string | null;
  art: string | null;
  rarity: string | null;
  redeemedAt: string;
  usedAt: string | null;
  canceledAt: string | null;
}

export async function listRedemptions(db: Client, ownerId: string, opts: { status?: RedemptionStatus; limit?: number } = {}): Promise<RedemptionView[]> {
  const r = await db.execute({
    sql: `SELECT rr.id, rr.reward_id, rr.reward_name, rr.cost, rr.currency, rr.status, rr.redeemed_at, rr.used_at, rr.canceled_at, rw.icon, rw.art, rw.rarity
          FROM reward_redemptions rr LEFT JOIN rewards rw ON rw.id = rr.reward_id AND rw.owner_id = rr.owner_id
          WHERE rr.owner_id = ? ${opts.status ? "AND rr.status = ?" : ""}
          ORDER BY rr.redeemed_at DESC, rr.rowid DESC LIMIT ?`,
    args: opts.status ? [ownerId, opts.status, opts.limit ?? 30] : [ownerId, opts.limit ?? 30],
  });
  return r.rows.map((row) => ({
    id: String(row.id),
    rewardId: String(row.reward_id),
    rewardName: String(row.reward_name),
    cost: Number(row.cost),
    currency: (row.currency ?? "coin") as RewardCurrency,
    status: (row.status ?? "used") as RedemptionStatus,
    icon: row.icon == null ? null : String(row.icon),
    art: row.art == null ? null : String(row.art),
    rarity: row.rarity == null ? null : String(row.rarity),
    redeemedAt: sqliteToIso(row.redeemed_at)!,
    usedAt: sqliteToIso(row.used_at),
    canceledAt: sqliteToIso(row.canceled_at),
  }));
}

export interface InventoryItem {
  rewardId: string;
  name: string;
  icon: string | null;
  art: string | null;
  rarity: string | null;
  quantity: number;
  /** Unidade mais antiga — é ela que "Usar" consome (FIFO). */
  nextRedemptionId: string;
  lastRedeemedAt: string;
}

/** Itens resgatados ainda não usados, agrupados por recompensa. */
export async function getInventory(db: Client, ownerId: string): Promise<InventoryItem[]> {
  const items = await listRedemptions(db, ownerId, { status: "available", limit: 500 });
  const map = new Map<string, InventoryItem>();
  for (const it of items) {
    const cur = map.get(it.rewardId);
    if (cur) {
      cur.quantity += 1;
      cur.nextRedemptionId = it.id; // lista vem do mais novo ao mais antigo
    } else {
      map.set(it.rewardId, { rewardId: it.rewardId, name: it.rewardName, icon: it.icon, art: it.art, rarity: it.rarity, quantity: 1, nextRedemptionId: it.id, lastRedeemedAt: it.redeemedAt });
    }
  }
  return [...map.values()].sort((a, b) => b.lastRedeemedAt.localeCompare(a.lastRedeemedAt));
}

/** Consome uma unidade do inventário (só se ainda estiver disponível). Não dá XP. */
export async function useRedemption(db: Client, ownerId: string, redemptionId: string): Promise<boolean> {
  const r = await db.execute({
    sql: "UPDATE reward_redemptions SET status = 'used', used_at = datetime('now') WHERE id = ? AND owner_id = ? AND status = 'available'",
    args: [redemptionId, ownerId],
  });
  return r.rowsAffected > 0;
}

/**
 * Cancela um item ainda não usado e estorna o valor no ledger. A chave
 * única do ledger (redemption:<id>:refund) impede estorno duplicado.
 */
export async function cancelRedemption(db: Client, ownerId: string, redemptionId: string): Promise<{ ok: boolean; balance: number; gems: number }> {
  const row = await db.execute({ sql: "SELECT cost, currency, reward_name FROM reward_redemptions WHERE id = ? AND owner_id = ? AND status = 'available'", args: [redemptionId, ownerId] });
  const hit = row.rows[0];
  if (!hit) return { ok: false, balance: await coinBalance(db, ownerId), gems: await gemBalance(db, ownerId) };
  const ledger = String(hit.currency) === "gem" ? "gem_ledger" : "coin_ledger";
  const results = await db.batch(
    [
      { sql: "UPDATE reward_redemptions SET status = 'canceled', canceled_at = datetime('now') WHERE id = ? AND owner_id = ? AND status = 'available'", args: [redemptionId, ownerId] },
      {
        sql: `INSERT OR IGNORE INTO ${ledger} (id, owner_id, amount, source_type, source_id, event_type, label)
              SELECT ?, ?, ?, 'redemption', ?, 'refund', ?
              WHERE EXISTS (SELECT 1 FROM reward_redemptions WHERE id = ? AND owner_id = ? AND status = 'canceled')`,
        args: [nanoid(), ownerId, Number(hit.cost), redemptionId, `Estorno: ${String(hit.reward_name)}`, redemptionId, ownerId],
      },
    ],
    "write",
  );
  return { ok: results[0].rowsAffected > 0, balance: await coinBalance(db, ownerId), gems: await gemBalance(db, ownerId) };
}
