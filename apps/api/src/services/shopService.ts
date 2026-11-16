import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { coinBalance } from "./gamificationService.js";
import { gemBalance } from "./rewardsService.js";

/**
 * Loja Arcana (Fase 1 — fundação): catálogo real, carrinho persistido e
 * checkout atômico/idempotente pago só com moedas ou gemas já existentes
 * no LifeOS (coin_ledger / gem_ledger — nenhuma carteira nova). Itens
 * comprados entram no inventário já existente (user_inventory_items /
 * inventory_transactions) com a chave prefixada "shop:", lidos por uma
 * visão própria (Inventário do Herói).
 *
 * Fora desta fase: escolha de crédito do Banco, Correio da Guilda (entrega
 * com atraso real — aqui é imediata), equipar em slots, loadouts, consumo
 * de poções com efeito funcional, Mercador Arcano (IA), notificações e
 * cancelamento/estorno. Ver o relatório para o roteiro completo.
 */

export const SHOP_CATEGORIES = ["pocoes", "vestimentas", "artefatos", "personalizacao", "boosters", "decoracao", "reliquias", "materiais", "pacotes"] as const;
export type ShopCategory = (typeof SHOP_CATEGORIES)[number];

export const SHOP_RARITIES = ["comum", "incomum", "raro", "epico", "lendario", "mitico"] as const;
export type ShopRarity = (typeof SHOP_RARITIES)[number];

const RARITY_ORDER: Record<ShopRarity, number> = { comum: 0, incomum: 1, raro: 2, epico: 3, lendario: 4, mitico: 5 };

export interface ShopProduct {
  key: string;
  category: ShopCategory;
  rarity: ShopRarity;
  name: string;
  description: string;
  currency: "coin" | "gem";
  price: number;
  art: string;
  effectText: string | null;
  durationText: string | null;
  stackable: boolean;
  maxStack: number;
  featured: boolean;
  active: boolean;
  stock: number | null;
}

function mapProduct(row: Record<string, unknown>): ShopProduct {
  return {
    key: String(row.key),
    category: row.category as ShopCategory,
    rarity: row.rarity as ShopRarity,
    name: String(row.name),
    description: String(row.description),
    currency: row.currency as "coin" | "gem",
    price: Number(row.price),
    art: String(row.art),
    effectText: row.effect_text == null ? null : String(row.effect_text),
    durationText: row.duration_text == null ? null : String(row.duration_text),
    stackable: Number(row.stackable) === 1,
    maxStack: Number(row.max_stack),
    featured: Number(row.featured) === 1,
    active: Number(row.active) === 1,
    stock: row.stock == null ? null : Number(row.stock),
  };
}

export type ShopSort = "relevancia" | "preco_asc" | "preco_desc" | "raridade";

export interface ShopFilter {
  category?: ShopCategory | "all";
  rarity?: ShopRarity | "all";
  query?: string;
  sort?: ShopSort;
}

/** Catálogo ativo, filtrável — só o servidor decide o que está à venda e por quanto. */
export async function listProducts(db: Client, filter: ShopFilter = {}): Promise<ShopProduct[]> {
  const r = await db.execute({ sql: "SELECT * FROM shop_products WHERE active = 1 ORDER BY sort_order ASC, created_at ASC", args: [] });
  let items = r.rows.map((row) => mapProduct(row as unknown as Record<string, unknown>));
  if (filter.category && filter.category !== "all") items = items.filter((p) => p.category === filter.category);
  if (filter.rarity && filter.rarity !== "all") items = items.filter((p) => p.rarity === filter.rarity);
  if (filter.query?.trim()) {
    const q = filter.query.trim().toLowerCase();
    items = items.filter((p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
  }
  const sort = filter.sort ?? "relevancia";
  if (sort === "preco_asc") items.sort((a, b) => a.price - b.price);
  else if (sort === "preco_desc") items.sort((a, b) => b.price - a.price);
  else if (sort === "raridade") items.sort((a, b) => RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity]);
  else items.sort((a, b) => Number(b.featured) - Number(a.featured) || a.price - b.price);
  return items;
}

export async function getProduct(db: Client, key: string): Promise<ShopProduct | null> {
  const r = await db.execute({ sql: "SELECT * FROM shop_products WHERE key = ? AND active = 1", args: [key] });
  return r.rows[0] ? mapProduct(r.rows[0] as unknown as Record<string, unknown>) : null;
}

/* --------------------------------- Carrinho --------------------------------- */

export interface CartItemView {
  productKey: string;
  name: string;
  rarity: ShopRarity;
  art: string;
  currency: "coin" | "gem";
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  available: boolean;
}

export interface CartView {
  items: CartItemView[];
  subtotalCoins: number;
  subtotalGems: number;
  balance: { coins: number; gems: number };
}

async function ensureCart(db: Client, ownerId: string): Promise<string> {
  const existing = await db.execute({ sql: "SELECT id FROM shop_carts WHERE owner_id = ?", args: [ownerId] });
  if (existing.rows[0]) return String(existing.rows[0].id);
  const id = nanoid();
  await db.execute({ sql: "INSERT INTO shop_carts (id, owner_id) VALUES (?, ?)", args: [id, ownerId] });
  return id;
}

/** Carrinho com preços e disponibilidade RECALCULADOS agora — nunca o que o cliente guardou. */
export async function getCart(db: Client, ownerId: string): Promise<CartView> {
  const cartId = await ensureCart(db, ownerId);
  const [rows, coins, gems] = await Promise.all([
    db.execute({
      sql: `SELECT ci.product_key, ci.quantity, p.name, p.rarity, p.art, p.currency, p.price, p.active
            FROM shop_cart_items ci LEFT JOIN shop_products p ON p.key = ci.product_key
            WHERE ci.cart_id = ? ORDER BY ci.added_at ASC`,
      args: [cartId],
    }),
    coinBalance(db, ownerId),
    gemBalance(db, ownerId),
  ]);
  const items: CartItemView[] = rows.rows.map((r) => {
    const available = r.active != null && Number(r.active) === 1;
    const unitPrice = available ? Number(r.price) : 0;
    const quantity = Number(r.quantity);
    return {
      productKey: String(r.product_key),
      name: r.name == null ? "Item removido da loja" : String(r.name),
      rarity: (r.rarity as ShopRarity) ?? "comum",
      art: r.art == null ? "box" : String(r.art),
      currency: (r.currency as "coin" | "gem") ?? "coin",
      unitPrice,
      quantity,
      lineTotal: unitPrice * quantity,
      available,
    };
  });
  const subtotalCoins = items.filter((i) => i.available && i.currency === "coin").reduce((s, i) => s + i.lineTotal, 0);
  const subtotalGems = items.filter((i) => i.available && i.currency === "gem").reduce((s, i) => s + i.lineTotal, 0);
  return { items, subtotalCoins, subtotalGems, balance: { coins, gems } };
}

export type CartResult = { ok: true; cart: CartView } | { ok: false; status: 400 | 404; message: string };

export async function addToCart(db: Client, ownerId: string, productKey: string, quantity: number): Promise<CartResult> {
  const product = await getProduct(db, productKey);
  if (!product) return { ok: false, status: 404, message: "Item não encontrado ou indisponível na Loja." };
  const max = product.stackable ? product.maxStack : 1;
  const cartId = await ensureCart(db, ownerId);
  await db.execute({
    sql: `INSERT INTO shop_cart_items (id, cart_id, product_key, quantity) VALUES (?, ?, ?, ?)
          ON CONFLICT (cart_id, product_key) DO UPDATE SET quantity = MIN(?, quantity + excluded.quantity)`,
    args: [nanoid(), cartId, productKey, Math.min(Math.max(1, quantity), max), max],
  });
  return { ok: true, cart: await getCart(db, ownerId) };
}

export async function updateCartItem(db: Client, ownerId: string, productKey: string, quantity: number): Promise<CartResult> {
  const cartId = await ensureCart(db, ownerId);
  if (quantity <= 0) {
    await db.execute({ sql: "DELETE FROM shop_cart_items WHERE cart_id = ? AND product_key = ?", args: [cartId, productKey] });
    return { ok: true, cart: await getCart(db, ownerId) };
  }
  const product = await getProduct(db, productKey);
  if (!product) return { ok: false, status: 404, message: "Item não encontrado ou indisponível na Loja." };
  const max = product.stackable ? product.maxStack : 1;
  await db.execute({ sql: "UPDATE shop_cart_items SET quantity = ? WHERE cart_id = ? AND product_key = ?", args: [Math.min(quantity, max), cartId, productKey] });
  return { ok: true, cart: await getCart(db, ownerId) };
}

export async function removeFromCart(db: Client, ownerId: string, productKey: string): Promise<CartView> {
  const cartId = await ensureCart(db, ownerId);
  await db.execute({ sql: "DELETE FROM shop_cart_items WHERE cart_id = ? AND product_key = ?", args: [cartId, productKey] });
  return getCart(db, ownerId);
}

export async function clearCart(db: Client, ownerId: string): Promise<CartView> {
  const cartId = await ensureCart(db, ownerId);
  await db.execute({ sql: "DELETE FROM shop_cart_items WHERE cart_id = ?", args: [cartId] });
  return getCart(db, ownerId);
}

/* --------------------------------- Checkout --------------------------------- */

export type CheckoutResult =
  | { ok: true; orderId: string; totalCoins: number; totalGems: number; replayed: boolean }
  | { ok: false; code: "empty" | "insufficient" | "unavailable"; message: string };

/**
 * Checkout atômico e idempotente (Fase 1 — só moedas/gemas, entrega
 * imediata). O mesmo padrão de `redeemReward`: a mesma `requestId` nunca
 * gera dois pedidos; o INSERT do pedido só acontece se o saldo no momento
 * da escrita ainda cobrir o total recalculado agora (nunca o que veio do
 * carrinho em memória do cliente); o débito e a entrega no inventário só
 * acontecem se o pedido foi mesmo criado.
 */
export async function checkout(db: Client, ownerId: string, requestId: string): Promise<CheckoutResult> {
  const existing = await db.execute({ sql: "SELECT id FROM shop_orders WHERE owner_id = ? AND request_id = ?", args: [ownerId, requestId] });
  if (existing.rows[0]) {
    const orderId = String(existing.rows[0].id);
    const totals = await db.execute({ sql: "SELECT payment_method, total_amount FROM shop_orders WHERE id = ?", args: [orderId] });
    const row = totals.rows[0]!;
    const isGem = row.payment_method === "gems";
    return { ok: true, orderId, totalCoins: isGem ? 0 : Number(row.total_amount), totalGems: isGem ? Number(row.total_amount) : 0, replayed: true };
  }

  const cart = await getCart(db, ownerId);
  const lines = cart.items.filter((i) => i.quantity > 0);
  if (lines.length === 0) return { ok: false, code: "empty", message: "O carrinho está vazio." };
  if (lines.some((i) => !i.available)) return { ok: false, code: "unavailable", message: "Um ou mais itens do carrinho não estão mais disponíveis na Loja. Remova-os para continuar." };

  // Fase 1: um pedido só pode ser pago numa única moeda (moedas OU gemas) — carrinho misto é bloqueado aqui.
  const hasCoins = lines.some((i) => i.currency === "coin");
  const hasGems = lines.some((i) => i.currency === "gem");
  if (hasCoins && hasGems) return { ok: false, code: "unavailable", message: "Por enquanto, finalize em duas compras: itens pagos em moedas e itens pagos em gemas separadamente." };
  const currency: "coin" | "gem" = hasGems ? "gem" : "coin";
  const total = lines.reduce((s, i) => s + i.lineTotal, 0);
  const ledger = currency === "gem" ? "gem_ledger" : "coin_ledger";
  const paymentMethod = currency === "gem" ? "gems" : "coins";

  const orderId = nanoid();
  const guard = "EXISTS (SELECT 1 FROM shop_orders WHERE id = ?)";
  const stmts: Array<{ sql: string; args: Array<string | number | null> }> = [
    {
      sql: `INSERT INTO shop_orders (id, owner_id, request_id, payment_method, total_amount)
            SELECT ?, ?, ?, ?, ? WHERE (SELECT COALESCE(SUM(amount), 0) FROM ${ledger} WHERE owner_id = ?) >= ?`,
      args: [orderId, ownerId, requestId, paymentMethod, total, ownerId, total],
    },
    {
      sql: `INSERT INTO ${ledger} (id, owner_id, amount, source_type, source_id, event_type, label)
            SELECT ?, ?, ?, 'shop_order', ?, 'purchase', ? WHERE ${guard}`,
      args: [nanoid(), ownerId, -total, orderId, `Compra na Loja Arcana (${lines.length} item(ns))`, orderId],
    },
    {
      sql: `INSERT INTO shop_order_events (id, order_id, owner_id, type, message) SELECT ?, ?, ?, 'confirmado', 'Pedido confirmado e entregue ao Inventário do Herói.' WHERE ${guard}`,
      args: [nanoid(), orderId, ownerId, orderId],
    },
  ];
  for (const line of lines) {
    stmts.push({
      sql: `INSERT INTO shop_order_items (id, order_id, product_key, product_name, rarity, quantity, unit_price, line_total)
            SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard}`,
      args: [nanoid(), orderId, line.productKey, line.name, line.rarity, line.quantity, line.unitPrice, line.lineTotal, orderId],
    });
    const itemKey = `shop:${line.productKey}`;
    const txId = nanoid();
    stmts.push({
      sql: `INSERT INTO inventory_transactions (id, owner_id, item_key, type, quantity, source_type, source_id, label)
            SELECT ?, ?, ?, 'acquire', ?, 'shop_order', ?, ? WHERE ${guard}`,
      args: [txId, ownerId, itemKey, line.quantity, orderId, `Comprado na Loja Arcana: ${line.name}`, orderId],
    });
    stmts.push({
      sql: `INSERT INTO user_inventory_items (id, owner_id, item_key, quantity, acquired_at, last_acquired_at, source_type, source_id)
            SELECT ?, ?, ?, ?, datetime('now'), datetime('now'), 'shop_order', ?
            WHERE EXISTS (SELECT 1 FROM inventory_transactions WHERE id = ?)
            ON CONFLICT (owner_id, item_key) DO UPDATE SET
              quantity = quantity + excluded.quantity,
              last_acquired_at = datetime('now'),
              updated_at = datetime('now')`,
      args: [nanoid(), ownerId, itemKey, line.quantity, orderId, txId],
    });
  }
  stmts.push({ sql: "DELETE FROM shop_cart_items WHERE cart_id = (SELECT id FROM shop_carts WHERE owner_id = ?)", args: [ownerId] });

  try {
    const results = await db.batch(stmts, "write");
    if (results[0].rowsAffected === 0) {
      return { ok: false, code: "insufficient", message: currency === "gem" ? "Gemas insuficientes para esta compra." : "Moedas insuficientes para esta compra." };
    }
  } catch (err) {
    const again = await db.execute({ sql: "SELECT id FROM shop_orders WHERE owner_id = ? AND request_id = ?", args: [ownerId, requestId] });
    if (again.rows[0]) return checkout(db, ownerId, requestId);
    throw err;
  }
  return { ok: true, orderId, totalCoins: currency === "coin" ? total : 0, totalGems: currency === "gem" ? total : 0, replayed: false };
}

export interface OrderView {
  id: string;
  status: string;
  paymentMethod: string;
  totalAmount: number;
  createdAt: string;
  items: Array<{ productKey: string; productName: string; rarity: string; quantity: number; unitPrice: number; lineTotal: number }>;
}

export async function listOrders(db: Client, ownerId: string, limit = 30): Promise<OrderView[]> {
  const orders = await db.execute({ sql: "SELECT * FROM shop_orders WHERE owner_id = ? ORDER BY created_at DESC LIMIT ?", args: [ownerId, limit] });
  const ids = orders.rows.map((r) => String(r.id));
  if (ids.length === 0) return [];
  const items = await db.execute({ sql: `SELECT * FROM shop_order_items WHERE order_id IN (${ids.map(() => "?").join(",")})`, args: ids });
  const byOrder = new Map<string, OrderView["items"]>();
  for (const r of items.rows) {
    const orderId = String(r.order_id);
    const list = byOrder.get(orderId) ?? [];
    list.push({ productKey: String(r.product_key), productName: String(r.product_name), rarity: String(r.rarity), quantity: Number(r.quantity), unitPrice: Number(r.unit_price), lineTotal: Number(r.line_total) });
    byOrder.set(orderId, list);
  }
  return orders.rows.map((r) => ({
    id: String(r.id),
    status: String(r.status),
    paymentMethod: String(r.payment_method),
    totalAmount: Number(r.total_amount),
    createdAt: String(r.created_at),
    items: byOrder.get(String(r.id)) ?? [],
  }));
}

/* ----------------------------- Inventário do Herói ----------------------------- */

export interface HeroInventoryItem {
  key: string;
  name: string;
  description: string;
  category: ShopCategory;
  rarity: ShopRarity;
  art: string;
  quantity: number;
  effectText: string | null;
  durationText: string | null;
  acquiredAt: string | null;
}

export interface HeroInventoryView {
  items: HeroInventoryItem[];
  kpis: { totalItems: number; legendaryCount: number; consumables: number; slotsUsed: number; bonusesActive: number };
}

/** Itens comprados na Loja (chave "shop:*"), sem equipar/consumir ainda — isso é Fase 2. */
export async function getHeroInventory(db: Client, ownerId: string): Promise<HeroInventoryView> {
  const rows = await db.execute({
    sql: `SELECT ui.item_key, ui.quantity, ui.acquired_at, p.name, p.description, p.category, p.rarity, p.art, p.effect_text, p.duration_text
          FROM user_inventory_items ui JOIN shop_products p ON p.key = substr(ui.item_key, 6)
          WHERE ui.owner_id = ? AND ui.item_key LIKE 'shop:%' AND ui.quantity > 0
          ORDER BY ui.last_acquired_at DESC`,
    args: [ownerId],
  });
  const items: HeroInventoryItem[] = rows.rows.map((r) => ({
    key: String(r.item_key),
    name: String(r.name),
    description: String(r.description),
    category: r.category as ShopCategory,
    rarity: r.rarity as ShopRarity,
    art: String(r.art),
    quantity: Number(r.quantity),
    effectText: r.effect_text == null ? null : String(r.effect_text),
    durationText: r.duration_text == null ? null : String(r.duration_text),
    acquiredAt: r.acquired_at == null ? null : String(r.acquired_at),
  }));
  return {
    items,
    kpis: {
      totalItems: items.reduce((s, i) => s + i.quantity, 0),
      legendaryCount: items.filter((i) => i.rarity === "lendario" || i.rarity === "mitico").reduce((s, i) => s + i.quantity, 0),
      consumables: items.filter((i) => i.category === "pocoes").reduce((s, i) => s + i.quantity, 0),
      slotsUsed: 0,
      bonusesActive: 0,
    },
  };
}
