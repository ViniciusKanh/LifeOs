import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { COSMETIC_PRODUCTS, getProduct, type ShopCategory } from "./shopService.js";
import { sqlTime } from "./itemEffectService.js";
import { todayKeyFor } from "./gamificationService.js";

/**
 * Efeitos reais dos itens da Loja Arcana — fecha a lacuna dos itens que só
 * tinham texto "Fase 3" e não faziam nada quando comprados. Reaproveita o
 * motor de efeitos temporários já existente (active_item_effects, o mesmo
 * da Coleção/Inventário) e a coluna de preferências RPG já existente
 * (users.rpg_prefs_json) em vez de criar mecanismos paralelos.
 */

export type ActionResult = { ok: true; message: string } | { ok: false; status: 400 | 403 | 404 | 409; message: string };

export interface ShopCosmeticsState {
  avatarAura: boolean;
  accentTheme: "noite-astral" | "castelo-dourado" | null;
  cursor: boolean;
  wallpaperGlow: boolean;
  sparkleTrail: boolean;
  iconTint: boolean;
}

const EMPTY_COSMETICS: ShopCosmeticsState = { avatarAura: false, accentTheme: null, cursor: false, wallpaperGlow: false, sparkleTrail: false, iconTint: false };

async function readCosmetics(db: Client, ownerId: string): Promise<ShopCosmeticsState> {
  const r = await db.execute({ sql: "SELECT rpg_prefs_json FROM users WHERE id = ?", args: [ownerId] });
  try {
    const prefs = JSON.parse(String(r.rows[0]?.rpg_prefs_json ?? "{}"));
    const sc = prefs?.shopCosmetics;
    return sc && typeof sc === "object" ? { ...EMPTY_COSMETICS, ...sc } : EMPTY_COSMETICS;
  } catch {
    return EMPTY_COSMETICS;
  }
}

async function ownsProduct(db: Client, ownerId: string, productKey: string): Promise<number> {
  const r = await db.execute({ sql: "SELECT quantity FROM user_inventory_items WHERE owner_id = ? AND item_key = ?", args: [ownerId, `shop:${productKey}`] });
  return Number(r.rows[0]?.quantity ?? 0);
}

/**
 * Liga/desliga um cosmético comprado. Dois itens do mesmo slot (os dois
 * temas) nunca ficam ativos ao mesmo tempo — ligar um desliga o outro.
 * Validação de posse sempre no servidor (nunca confia no que a tela manda).
 */
export async function toggleCosmetic(db: Client, ownerId: string, productKey: string, enabled: boolean): Promise<ActionResult> {
  const def = COSMETIC_PRODUCTS[productKey];
  if (!def) return { ok: false, status: 400, message: "Este item não é um cosmético equipável." };
  if (enabled && (await ownsProduct(db, ownerId, productKey)) <= 0) {
    return { ok: false, status: 403, message: "Compre este item na Loja Arcana antes de ativar." };
  }
  const current = await readCosmetics(db, ownerId);
  const next: ShopCosmeticsState = { ...current };
  if (def.slot === "accentTheme") {
    next.accentTheme = enabled ? (def.value as ShopCosmeticsState["accentTheme"]) : current.accentTheme === def.value ? null : current.accentTheme;
  } else {
    (next[def.slot] as boolean) = enabled;
  }
  const row = await db.execute({ sql: "SELECT rpg_prefs_json FROM users WHERE id = ?", args: [ownerId] });
  let prefs: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(String(row.rows[0]?.rpg_prefs_json ?? "{}"));
    if (parsed && typeof parsed === "object") prefs = parsed;
  } catch {
    prefs = {};
  }
  await db.execute({
    sql: "UPDATE users SET rpg_prefs_json = ?, updated_at = datetime('now') WHERE id = ?",
    args: [JSON.stringify({ ...prefs, shopCosmetics: next }), ownerId],
  });
  return { ok: true, message: enabled ? "Cosmético ativado." : "Cosmético desativado." };
}

export interface ShopEffectsState {
  cosmetics: ShopCosmeticsState;
  activeBoosts: Array<{ effectType: string; label: string; expiresAt: string }>;
}

const BOOST_LABEL: Record<string, string> = {
  XP_MULTIPLIER_TASK: "XP em dobro na próxima missão",
  COIN_MULTIPLIER_TASK: "+50% moedas nas próximas missões",
  REVIEW_GRACE_WEEKLY: "Janela extra para selar a revisão semanal",
};

/** Estado atual: cosméticos ligados + bônus temporários (da Loja) ainda ativos. */
export async function getShopEffectsState(db: Client, ownerId: string): Promise<ShopEffectsState> {
  const now = sqlTime(new Date());
  await db.execute({
    sql: "UPDATE active_item_effects SET status = 'expired' WHERE owner_id = ? AND status = 'active' AND expires_at <= ?",
    args: [ownerId, now],
  });
  const [cosmetics, boosts] = await Promise.all([
    readCosmetics(db, ownerId),
    db.execute({
      sql: `SELECT effect_type, expires_at FROM active_item_effects WHERE owner_id = ? AND status = 'active'
            AND effect_type IN ('XP_MULTIPLIER_TASK', 'COIN_MULTIPLIER_TASK', 'REVIEW_GRACE_WEEKLY') ORDER BY expires_at ASC`,
      args: [ownerId],
    }),
  ]);
  return {
    cosmetics,
    activeBoosts: boosts.rows.map((r) => ({
      effectType: String(r.effect_type),
      label: BOOST_LABEL[String(r.effect_type)] ?? String(r.effect_type),
      expiresAt: String(r.expires_at).replace(" ", "T") + "Z",
    })),
  };
}

/** Consome 1 unidade do item (idempotente por requestId) — mesmo padrão de useItem (Coleção). */
async function consumeOne(db: Client, ownerId: string, productKey: string, requestId: string, label: string): Promise<{ txId: string } | { already: true } | { insufficient: true }> {
  const itemKey = `shop:${productKey}`;
  const done = await db.execute({
    sql: "SELECT 1 FROM inventory_transactions WHERE owner_id = ? AND item_key = ? AND type = 'use' AND source_type = 'request' AND source_id = ?",
    args: [ownerId, itemKey, requestId],
  });
  if (done.rows.length) return { already: true };
  const stack = await db.execute({ sql: "SELECT quantity FROM user_inventory_items WHERE owner_id = ? AND item_key = ?", args: [ownerId, itemKey] });
  if (Number(stack.rows[0]?.quantity ?? 0) <= 0) return { insufficient: true };
  const txId = nanoid();
  const guard = "EXISTS (SELECT 1 FROM inventory_transactions WHERE id = ?)";
  await db.batch(
    [
      {
        sql: `INSERT OR IGNORE INTO inventory_transactions (id, owner_id, item_key, type, quantity, source_type, source_id, label)
              SELECT ?, ?, ?, 'use', 1, 'request', ?, ? WHERE EXISTS (SELECT 1 FROM user_inventory_items WHERE owner_id = ? AND item_key = ? AND quantity > 0)`,
        args: [txId, ownerId, itemKey, requestId, label, ownerId, itemKey],
      },
      {
        sql: `UPDATE user_inventory_items SET quantity = quantity - 1, use_count = use_count + 1, updated_at = datetime('now')
              WHERE owner_id = ? AND item_key = ? AND quantity > 0 AND ${guard}`,
        args: [ownerId, itemKey, txId],
      },
    ],
    "write",
  );
  const ok = await db.execute({ sql: "SELECT 1 FROM inventory_transactions WHERE id = ?", args: [txId] });
  return ok.rows.length ? { txId } : { insufficient: true };
}

/** Já existe um bônus deste tipo ativo (as regras atuais nunca somam — ou estende, ou bloqueia; aqui bloqueia). */
async function hasActiveEffect(db: Client, ownerId: string, effectType: string): Promise<boolean> {
  const now = sqlTime(new Date());
  const r = await db.execute({
    sql: "SELECT 1 FROM active_item_effects WHERE owner_id = ? AND effect_type = ? AND status = 'active' AND expires_at > ? LIMIT 1",
    args: [ownerId, effectType, now],
  });
  return r.rows.length > 0;
}

async function grantEffect(db: Client, ownerId: string, itemKey: string, effectType: string, value: number, durationMs: number, txId: string): Promise<void> {
  const now = new Date();
  await db.execute({
    sql: "INSERT INTO active_item_effects (id, owner_id, item_key, effect_type, value, started_at, expires_at, use_tx_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    args: [nanoid(), ownerId, itemKey, effectType, value, sqlTime(now), sqlTime(new Date(now.getTime() + durationMs)), txId],
  });
}

/**
 * "Usar" um item da Loja que tem efeito funcional (boosters, passe de
 * revisão, ticket de reset de hábito). Cosméticos passam por
 * toggleCosmetic, não por aqui.
 */
export async function useShopItem(db: Client, ownerId: string, productKey: string, requestId: string, opts: { habitId?: string } = {}): Promise<ActionResult> {
  const product = await getProduct(db, productKey);
  if (!product) return { ok: false, status: 404, message: "Produto não encontrado." };

  if (productKey === "multiplicador-xp-2x") {
    if (await hasActiveEffect(db, ownerId, "XP_MULTIPLIER_TASK")) return { ok: false, status: 409, message: "Já existe um bônus de XP ativo. Aguarde ele ser consumido." };
    const r = await consumeOne(db, ownerId, productKey, requestId, `Item usado: ${product.name}`);
    if ("already" in r) return { ok: true, message: "Item já usado." };
    if ("insufficient" in r) return { ok: false, status: 404, message: "Você não possui este item." };
    await grantEffect(db, ownerId, `shop:${productKey}`, "XP_MULTIPLIER_TASK", 100, 24 * 60 * 60_000, r.txId);
    return { ok: true, message: "Multiplicador de XP ativado: a próxima missão concluída vale XP em dobro." };
  }

  if (productKey === "bonus-moedas") {
    if (await hasActiveEffect(db, ownerId, "COIN_MULTIPLIER_TASK")) return { ok: false, status: 409, message: "Já existe um bônus de moedas ativo. Aguarde ele ser consumido." };
    const r = await consumeOne(db, ownerId, productKey, requestId, `Item usado: ${product.name}`);
    if ("already" in r) return { ok: true, message: "Item já usado." };
    if ("insufficient" in r) return { ok: false, status: 404, message: "Você não possui este item." };
    await grantEffect(db, ownerId, `shop:${productKey}`, "COIN_MULTIPLIER_TASK", 50, 24 * 60 * 60_000, r.txId);
    return { ok: true, message: "Bônus de moedas ativado: +50% de moedas nas missões concluídas nas próximas 24h." };
  }

  if (productKey === "passe-revisao-semanal") {
    if (await hasActiveEffect(db, ownerId, "REVIEW_GRACE_WEEKLY")) return { ok: false, status: 409, message: "Já existe um passe de revisão ativo." };
    const r = await consumeOne(db, ownerId, productKey, requestId, `Item usado: ${product.name}`);
    if ("already" in r) return { ok: true, message: "Item já usado." };
    if ("insufficient" in r) return { ok: false, status: 404, message: "Você não possui este item." };
    await grantEffect(db, ownerId, `shop:${productKey}`, "REVIEW_GRACE_WEEKLY", 7, 7 * 24 * 60 * 60_000, r.txId);
    return { ok: true, message: "Passe ativado: por 7 dias, você pode selar e resgatar uma revisão semanal que já teria perdido o prazo." };
  }

  if (productKey === "ticket-reset-habito") {
    const habitId = opts.habitId?.trim();
    if (!habitId) return { ok: false, status: 400, message: "Escolha o hábito para reiniciar a sequência." };
    const habit = await db.execute({ sql: "SELECT id FROM habits WHERE id = ? AND owner_id = ? AND archived_at IS NULL", args: [habitId, ownerId] });
    if (!habit.rows.length) return { ok: false, status: 404, message: "Hábito não encontrado." };
    const r = await consumeOne(db, ownerId, productKey, requestId, `Item usado: ${product.name}`);
    if ("already" in r) return { ok: true, message: "Item já usado." };
    if ("insufficient" in r) return { ok: false, status: 404, message: "Você não possui este item." };
    const today = await todayKeyFor(db, ownerId);
    await db.execute({
      sql: "INSERT INTO habit_streak_resets (id, owner_id, habit_id, reset_at, source_type, source_id) VALUES (?, ?, ?, ?, 'shop_item', ?)",
      args: [nanoid(), ownerId, habitId, today, r.txId],
    });
    return { ok: true, message: "Sequência reiniciada — o histórico de check-ins continua intacto." };
  }

  return { ok: false, status: 400, message: "Este item não tem uma ação de uso." };
}

/** Categorias cujos itens têm, hoje, algum efeito funcional de verdade (ligado aqui ou em outro serviço). */
export const FUNCTIONAL_CATEGORIES: ShopCategory[] = ["personalizacao", "boosters"];
