import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { coinBalance } from "./gamificationService.js";

/**
 * Loja de recompensas: o usuário define as próprias recompensas (lazer,
 * descanso, pequenos prazeres) e as troca por moedas ganhas com ações
 * reais. Sem aleatoriedade, sem dinheiro real. Saldo sempre derivado do
 * ledger (coin_ledger) — o resgate grava o débito na mesma transação.
 */

export interface RewardRow {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  category: string;
  cost: number;
  redemptionLimit: number | null;
  cooldownHours: number;
  isActive: boolean;
  timesRedeemed: number;
  lastRedeemedAt: string | null;
  /** Momento em que o cooldown termina (null = disponível agora). */
  availableAt: string | null;
  createdAt: string;
}

export interface RewardInput {
  name: string;
  description?: string | null;
  icon?: string | null;
  category?: string;
  cost: number;
  redemptionLimit?: number | null;
  cooldownHours?: number;
  isActive?: boolean;
}

/** SQLite devolve "YYYY-MM-DD HH:MM:SS" em UTC — normaliza para ISO. */
function sqliteToIso(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  return value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
}

function mapReward(row: Record<string, unknown>, now: Date): RewardRow {
  const cooldownHours = Number(row.cooldown_hours ?? 0);
  const last = sqliteToIso(row.last_redeemed_at);
  let availableAt: string | null = null;
  if (last && cooldownHours > 0) {
    const until = new Date(Date.parse(last) + cooldownHours * 3_600_000);
    if (until > now) availableAt = until.toISOString();
  }
  return {
    id: String(row.id),
    name: String(row.name),
    description: row.description == null ? null : String(row.description),
    icon: row.icon == null ? null : String(row.icon),
    category: String(row.category),
    cost: Number(row.cost),
    redemptionLimit: row.redemption_limit == null ? null : Number(row.redemption_limit),
    cooldownHours,
    isActive: Number(row.is_active) === 1,
    timesRedeemed: Number(row.times_redeemed ?? 0),
    lastRedeemedAt: last,
    availableAt,
    createdAt: String(row.created_at),
  };
}

const REWARD_SELECT = `SELECT r.*,
    (SELECT COUNT(*) FROM reward_redemptions rr WHERE rr.reward_id = r.id AND rr.owner_id = r.owner_id) AS times_redeemed,
    (SELECT MAX(redeemed_at) FROM reward_redemptions rr WHERE rr.reward_id = r.id AND rr.owner_id = r.owner_id) AS last_redeemed_at
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

export async function createReward(db: Client, ownerId: string, input: RewardInput): Promise<RewardRow> {
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO rewards (id, owner_id, name, description, icon, category, cost, redemption_limit, cooldown_hours, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      ownerId,
      input.name,
      input.description ?? null,
      input.icon ?? null,
      input.category ?? "lazer",
      input.cost,
      input.redemptionLimit ?? null,
      input.cooldownHours ?? 0,
      input.isActive === false ? 0 : 1,
    ],
  });
  return (await getReward(db, ownerId, id))!;
}

export async function updateReward(db: Client, ownerId: string, id: string, input: Partial<RewardInput>): Promise<RewardRow | null> {
  const map: Record<string, string> = {
    name: "name",
    description: "description",
    icon: "icon",
    category: "category",
    cost: "cost",
    redemptionLimit: "redemption_limit",
    cooldownHours: "cooldown_hours",
  };
  const sets: string[] = [];
  const args: Array<string | number | null> = [];
  for (const [key, column] of Object.entries(map)) {
    const value = (input as Record<string, unknown>)[key];
    if (value !== undefined) {
      sets.push(`${column} = ?`);
      args.push(value as string | number | null);
    }
  }
  if (input.isActive !== undefined) {
    sets.push("is_active = ?");
    args.push(input.isActive ? 1 : 0);
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

export type RedeemResult =
  | { ok: true; redemptionId: string; balance: number; reward: RewardRow }
  | { ok: false; code: "not_found" | "inactive" | "insufficient" | "cooldown" | "limit"; message: string; balance?: number; availableAt?: string | null };

/**
 * Resgate atômico: insere o resgate e o débito na MESMA transação, e o
 * INSERT do resgate só acontece se o saldo do ledger cobrir o custo no
 * momento da escrita (protege contra duplo clique/corrida).
 */
export async function redeemReward(db: Client, ownerId: string, rewardId: string): Promise<RedeemResult> {
  const reward = await getReward(db, ownerId, rewardId);
  if (!reward) return { ok: false, code: "not_found", message: "Recompensa não encontrada." };
  if (!reward.isActive) return { ok: false, code: "inactive", message: "Esta recompensa está desativada." };
  if (reward.redemptionLimit != null && reward.timesRedeemed >= reward.redemptionLimit) {
    return { ok: false, code: "limit", message: "Limite de resgates desta recompensa atingido." };
  }
  if (reward.availableAt) {
    return { ok: false, code: "cooldown", message: "Recompensa em recarga. Tente novamente mais tarde.", availableAt: reward.availableAt };
  }
  const balance = await coinBalance(db, ownerId);
  if (balance < reward.cost) {
    return { ok: false, code: "insufficient", message: "Moedas insuficientes para este resgate.", balance };
  }

  const redemptionId = nanoid();
  const results = await db.batch(
    [
      {
        sql: `INSERT INTO reward_redemptions (id, owner_id, reward_id, reward_name, cost)
              SELECT ?, ?, ?, ?, ?
              WHERE (SELECT COALESCE(SUM(amount), 0) FROM coin_ledger WHERE owner_id = ?) >= ?
                AND (? = 0 OR NOT EXISTS (
                  SELECT 1 FROM reward_redemptions WHERE reward_id = ? AND owner_id = ?
                    AND redeemed_at > datetime('now', ?)))`,
        args: [
          redemptionId,
          ownerId,
          reward.id,
          reward.name,
          reward.cost,
          ownerId,
          reward.cost,
          reward.cooldownHours,
          reward.id,
          ownerId,
          `-${reward.cooldownHours} hours`,
        ],
      },
      {
        sql: `INSERT INTO coin_ledger (id, owner_id, amount, source_type, source_id, event_type, label)
              SELECT ?, ?, ?, 'redemption', ?, 'spent', ?
              WHERE EXISTS (SELECT 1 FROM reward_redemptions WHERE id = ?)`,
        args: [nanoid(), ownerId, -reward.cost, redemptionId, `Resgate: ${reward.name}`, redemptionId],
      },
    ],
    "write",
  );
  if (results[0].rowsAffected === 0) {
    const now = await coinBalance(db, ownerId);
    return now < reward.cost
      ? { ok: false, code: "insufficient", message: "Moedas insuficientes para este resgate.", balance: now }
      : { ok: false, code: "cooldown", message: "Recompensa em recarga. Tente novamente mais tarde." };
  }
  return { ok: true, redemptionId, balance: await coinBalance(db, ownerId), reward: (await getReward(db, ownerId, reward.id))! };
}

export async function listRedemptions(db: Client, ownerId: string, limit = 30) {
  const r = await db.execute({
    sql: `SELECT rr.id, rr.reward_id, rr.reward_name, rr.cost, rr.redeemed_at, rw.icon
          FROM reward_redemptions rr LEFT JOIN rewards rw ON rw.id = rr.reward_id AND rw.owner_id = rr.owner_id
          WHERE rr.owner_id = ? ORDER BY rr.redeemed_at DESC, rr.rowid DESC LIMIT ?`,
    args: [ownerId, limit],
  });
  return r.rows.map((row) => ({
    id: String(row.id),
    rewardId: String(row.reward_id),
    rewardName: String(row.reward_name),
    cost: Number(row.cost),
    icon: row.icon == null ? null : String(row.icon),
    redeemedAt: sqliteToIso(row.redeemed_at)!,
  }));
}
