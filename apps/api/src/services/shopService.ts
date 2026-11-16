import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { coinBalance } from "./gamificationService.js";
import { gemBalance } from "./rewardsService.js";
import { requestLoan } from "./bankService.js";

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

export type CosmeticSlot = "avatarAura" | "accentTheme" | "cursor" | "wallpaperGlow" | "sparkleTrail" | "iconTint";

/** Cosméticos de verdade (Personalização): chave do produto → slot que ele ocupa, ligado/desligado em users.rpg_prefs_json. */
export const COSMETIC_PRODUCTS: Record<string, { slot: CosmeticSlot; value: string | boolean }> = {
  "moldura-epica-avatar": { slot: "avatarAura", value: true },
  "trilhas-brilho": { slot: "sparkleTrail", value: true },
  "tema-noite-astral": { slot: "accentTheme", value: "noite-astral" },
  "tema-castelo-dourado": { slot: "accentTheme", value: "castelo-dourado" },
  "pack-icones-misticos": { slot: "iconTint", value: true },
  "cursor-arcano": { slot: "cursor", value: true },
  "fundo-biblioteca-arcana": { slot: "wallpaperGlow", value: true },
};

/** Itens com uma ação de "Usar" de verdade (boosters, passe de revisão, ticket de hábito) — ver shopEffectsService. */
export const USABLE_PRODUCT_KEYS = ["multiplicador-xp-2x", "bonus-moedas", "passe-revisao-semanal", "ticket-reset-habito"];

const RARITY_ORDER: Record<ShopRarity, number> = { comum: 0, incomum: 1, raro: 2, epico: 3, lendario: 4, mitico: 5 };

/** Correio da Guilda: minutos até a entrega, por raridade (Fase 2). Calculado no checkout, cumprido só pelo servidor. */
const DELIVERY_DELAY_MIN: Record<ShopRarity, number> = { comum: 0, incomum: 1, raro: 3, epico: 5, lendario: 10, mitico: 15 };

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

export type CheckoutPaymentMethod = "coins" | "credit";
export type OrderPaymentMethod = "coins" | "gems" | "credit";

export type CheckoutResult =
  | { ok: true; orderId: string; totalCoins: number; totalGems: number; paymentMethod: OrderPaymentMethod; replayed: boolean }
  | { ok: false; code: "empty" | "insufficient" | "unavailable" | "credit_unavailable"; message: string };

/**
 * Checkout atômico e idempotente. O mesmo padrão de `redeemReward`: a
 * mesma `requestId` nunca gera dois pedidos; o INSERT do pedido só
 * acontece se o saldo no momento da escrita ainda cobrir o total
 * recalculado agora (nunca o que veio do carrinho em memória do
 * cliente). A partir da Fase 2 a entrega NÃO é mais imediata: cada item
 * vira uma linha em `shop_deliveries` com `ready_at` já calculado
 * (Correio da Guilda — ver `syncDeliveries`).
 *
 * "Crédito do Banco" nunca cria uma carteira paralela: é pedir um
 * empréstimo real (`requestLoan`, as mesmas regras de score/limite/juros
 * do Banco) no valor exato da compra e gastá-lo na hora — por isso só
 * funciona se o Banco liberar o empréstimo (score, limite do nível, não
 * ter outro empréstimo ativo) e nunca cobre itens pagos em gemas.
 *
 * Limite conhecido desta fase: se o processo cair bem entre o empréstimo
 * ser concedido e o pedido ser gravado, o usuário fica com as moedas do
 * empréstimo em conta mas sem o pedido — recuperável pagando com "coins"
 * (ele já tem o saldo) ou quitando o empréstimo no Banco; não há perda
 * de moedas nem cobrança duplicada.
 */
export async function checkout(db: Client, ownerId: string, requestId: string, paymentMethod: CheckoutPaymentMethod = "coins"): Promise<CheckoutResult> {
  const existing = await db.execute({ sql: "SELECT id FROM shop_orders WHERE owner_id = ? AND request_id = ?", args: [ownerId, requestId] });
  if (existing.rows[0]) {
    const orderId = String(existing.rows[0].id);
    const row = (await db.execute({ sql: "SELECT payment_method, total_amount FROM shop_orders WHERE id = ?", args: [orderId] })).rows[0]!;
    const method = String(row.payment_method) as OrderPaymentMethod;
    const total = Number(row.total_amount);
    return { ok: true, orderId, totalCoins: method === "gems" ? 0 : total, totalGems: method === "gems" ? total : 0, paymentMethod: method, replayed: true };
  }

  const cart = await getCart(db, ownerId);
  const lines = cart.items.filter((i) => i.quantity > 0);
  if (lines.length === 0) return { ok: false, code: "empty", message: "O carrinho está vazio." };
  if (lines.some((i) => !i.available)) return { ok: false, code: "unavailable", message: "Um ou mais itens do carrinho não estão mais disponíveis na Loja. Remova-os para continuar." };

  // Um pedido só pode ser pago numa única moeda (moedas/crédito OU gemas) — carrinho misto é bloqueado aqui.
  const hasCoins = lines.some((i) => i.currency === "coin");
  const hasGems = lines.some((i) => i.currency === "gem");
  if (hasCoins && hasGems) return { ok: false, code: "unavailable", message: "Por enquanto, finalize em duas compras: itens pagos em moedas e itens pagos em gemas separadamente." };
  if (hasGems && paymentMethod === "credit") return { ok: false, code: "unavailable", message: "O Crédito do Banco só cobre itens pagos em moedas." };

  const total = lines.reduce((s, i) => s + i.lineTotal, 0);
  const method: OrderPaymentMethod = hasGems ? "gems" : paymentMethod;
  const ledger = method === "gems" ? "gem_ledger" : "coin_ledger";

  let bankLoanId: string | null = null;
  if (method === "credit") {
    const loan = await requestLoan(db, ownerId, total);
    if (!loan.ok) {
      const message = loan.code === "active_exists" ? "Você já tem um empréstimo ativo no Banco. Quite-o antes de comprar no crédito." : loan.message;
      return { ok: false, code: "credit_unavailable", message };
    }
    bankLoanId = loan.loan.id;
  }

  const orderId = nanoid();
  const guard = "EXISTS (SELECT 1 FROM shop_orders WHERE id = ?)";
  const stmts: Array<{ sql: string; args: Array<string | number | null> }> = [
    {
      sql: `INSERT INTO shop_orders (id, owner_id, request_id, payment_method, total_amount, bank_loan_id)
            SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT COALESCE(SUM(amount), 0) FROM ${ledger} WHERE owner_id = ?) >= ?`,
      args: [orderId, ownerId, requestId, method, total, bankLoanId, ownerId, total],
    },
    {
      sql: `INSERT INTO ${ledger} (id, owner_id, amount, source_type, source_id, event_type, label)
            SELECT ?, ?, ?, 'shop_order', ?, 'purchase', ? WHERE ${guard}`,
      args: [nanoid(), ownerId, -total, orderId, `Compra na Loja Arcana (${lines.length} item(ns))${method === "credit" ? " — no crédito do Banco" : ""}`, orderId],
    },
    {
      sql: `INSERT INTO shop_order_events (id, order_id, owner_id, type, message) SELECT ?, ?, ?, 'confirmado', 'Pedido confirmado. Acompanhe a entrega no Correio da Guilda.' WHERE ${guard}`,
      args: [nanoid(), orderId, ownerId, orderId],
    },
  ];
  for (const line of lines) {
    stmts.push({
      sql: `INSERT INTO shop_order_items (id, order_id, product_key, product_name, rarity, quantity, unit_price, line_total)
            SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard}`,
      args: [nanoid(), orderId, line.productKey, line.name, line.rarity, line.quantity, line.unitPrice, line.lineTotal, orderId],
    });
    stmts.push({
      sql: `INSERT INTO shop_deliveries (id, order_id, owner_id, product_key, product_name, rarity, quantity, ready_at)
            SELECT ?, ?, ?, ?, ?, ?, ?, datetime('now', '+' || ? || ' minutes') WHERE ${guard}`,
      args: [nanoid(), orderId, ownerId, line.productKey, line.name, line.rarity, line.quantity, DELIVERY_DELAY_MIN[line.rarity], orderId],
    });
  }
  stmts.push({ sql: "DELETE FROM shop_cart_items WHERE cart_id = (SELECT id FROM shop_carts WHERE owner_id = ?)", args: [ownerId] });

  try {
    const results = await db.batch(stmts, "write");
    if (results[0].rowsAffected === 0) {
      return { ok: false, code: "insufficient", message: method === "gems" ? "Gemas insuficientes para esta compra." : "Moedas insuficientes para esta compra." };
    }
  } catch (err) {
    const again = await db.execute({ sql: "SELECT id FROM shop_orders WHERE owner_id = ? AND request_id = ?", args: [ownerId, requestId] });
    if (again.rows[0]) return checkout(db, ownerId, requestId, paymentMethod);
    throw err;
  }
  return { ok: true, orderId, totalCoins: method === "gems" ? 0 : total, totalGems: method === "gems" ? total : 0, paymentMethod: method, replayed: false };
}

/**
 * Correio da Guilda: entrega (no Inventário do Herói) o que já passou do
 * `ready_at`. Idempotente (mesmo padrão de `applyGrants`: INSERT OR
 * IGNORE guardado pela UNIQUE de `inventory_transactions`) e chamado
 * antes de toda leitura de pedidos/inventário — nunca por temporizador
 * no navegador, só pelo relógio do servidor.
 */
async function syncDeliveries(db: Client, ownerId: string): Promise<void> {
  const due = await db.execute({
    sql: "SELECT * FROM shop_deliveries WHERE owner_id = ? AND status = 'em_transito' AND ready_at <= datetime('now')",
    args: [ownerId],
  });
  if (due.rows.length === 0) return;
  const stmts: Array<{ sql: string; args: Array<string | number | null> }> = [];
  for (const row of due.rows as unknown as Array<Record<string, unknown>>) {
    const deliveryId = String(row.id);
    const productKey = String(row.product_key);
    const productName = String(row.product_name);
    const quantity = Number(row.quantity);
    const itemKey = `shop:${productKey}`;
    const txId = nanoid();
    stmts.push({
      sql: `INSERT OR IGNORE INTO inventory_transactions (id, owner_id, item_key, type, quantity, source_type, source_id, label)
            VALUES (?, ?, ?, 'acquire', ?, 'shop_delivery', ?, ?)`,
      args: [txId, ownerId, itemKey, quantity, deliveryId, `Entregue pelo Correio da Guilda: ${productName}`],
    });
    stmts.push({
      sql: `INSERT INTO user_inventory_items (id, owner_id, item_key, quantity, acquired_at, last_acquired_at, source_type, source_id)
            SELECT ?, ?, ?, ?, datetime('now'), datetime('now'), 'shop_delivery', ?
            WHERE EXISTS (SELECT 1 FROM inventory_transactions WHERE id = ?)
            ON CONFLICT (owner_id, item_key) DO UPDATE SET
              quantity = quantity + excluded.quantity,
              last_acquired_at = datetime('now'),
              updated_at = datetime('now')`,
      args: [nanoid(), ownerId, itemKey, quantity, deliveryId, txId],
    });
    stmts.push({
      sql: "UPDATE shop_deliveries SET status = 'entregue', delivered_at = datetime('now') WHERE id = ? AND status = 'em_transito'",
      args: [deliveryId],
    });
  }
  await db.batch(stmts, "write");
  await db.execute({
    sql: `UPDATE shop_orders SET status = 'entregue', delivered_at = datetime('now')
          WHERE owner_id = ? AND status = 'confirmado'
            AND NOT EXISTS (SELECT 1 FROM shop_deliveries WHERE order_id = shop_orders.id AND status != 'entregue')`,
    args: [ownerId],
  });
}

export interface OrderView {
  id: string;
  status: string;
  paymentMethod: string;
  totalAmount: number;
  createdAt: string;
  bankLoanId: string | null;
  items: Array<{
    productKey: string;
    productName: string;
    rarity: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    deliveryStatus: "em_transito" | "entregue" | null;
    readyAt: string | null;
  }>;
}

export async function listOrders(db: Client, ownerId: string, limit = 30): Promise<OrderView[]> {
  await syncDeliveries(db, ownerId);
  const orders = await db.execute({ sql: "SELECT * FROM shop_orders WHERE owner_id = ? ORDER BY created_at DESC LIMIT ?", args: [ownerId, limit] });
  const ids = orders.rows.map((r) => String(r.id));
  if (ids.length === 0) return [];
  const items = await db.execute({ sql: `SELECT * FROM shop_order_items WHERE order_id IN (${ids.map(() => "?").join(",")})`, args: ids });
  const deliveries = await db.execute({ sql: `SELECT * FROM shop_deliveries WHERE order_id IN (${ids.map(() => "?").join(",")})`, args: ids });
  const deliveryByOrderProduct = new Map<string, { status: "em_transito" | "entregue"; readyAt: string }>();
  for (const r of deliveries.rows) {
    deliveryByOrderProduct.set(`${r.order_id}:${r.product_key}`, { status: r.status as "em_transito" | "entregue", readyAt: String(r.ready_at) });
  }
  const byOrder = new Map<string, OrderView["items"]>();
  for (const r of items.rows) {
    const orderId = String(r.order_id);
    const delivery = deliveryByOrderProduct.get(`${orderId}:${r.product_key}`);
    const list = byOrder.get(orderId) ?? [];
    list.push({
      productKey: String(r.product_key),
      productName: String(r.product_name),
      rarity: String(r.rarity),
      quantity: Number(r.quantity),
      unitPrice: Number(r.unit_price),
      lineTotal: Number(r.line_total),
      deliveryStatus: delivery?.status ?? null,
      readyAt: delivery?.readyAt ?? null,
    });
    byOrder.set(orderId, list);
  }
  return orders.rows.map((r) => ({
    id: String(r.id),
    status: String(r.status),
    paymentMethod: String(r.payment_method),
    totalAmount: Number(r.total_amount),
    createdAt: String(r.created_at),
    bankLoanId: r.bank_loan_id == null ? null : String(r.bank_loan_id),
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
  /** Tem uma ação de "Usar" de verdade (boosters, passe de revisão, ticket de hábito). */
  usable: boolean;
  /** Cosmético de Personalização equipável — slot que ele ocupa (ver COSMETIC_PRODUCTS). */
  cosmeticSlot: CosmeticSlot | null;
}

export interface HeroPendingDelivery {
  productKey: string;
  productName: string;
  rarity: ShopRarity;
  quantity: number;
  readyAt: string;
}

export interface HeroInventoryView {
  items: HeroInventoryItem[];
  pending: HeroPendingDelivery[];
  kpis: { totalItems: number; legendaryCount: number; consumables: number; slotsUsed: number; bonusesActive: number };
}

/**
 * Itens comprados na Loja (chave "shop:*") já entregues pelo Correio da
 * Guilda. "usable" marca itens com ação de Usar de verdade (boosters,
 * passe, ticket — ver shopEffectsService.useShopItem) e "cosmeticSlot"
 * marca cosméticos de Personalização equipáveis (toggleCosmetic).
 * Reconcilia entregas vencidas (`syncDeliveries`) antes de ler, então
 * `pending` só mostra o que genuinamente ainda está a caminho.
 */
export async function getHeroInventory(db: Client, ownerId: string): Promise<HeroInventoryView> {
  await syncDeliveries(db, ownerId);
  const pendingRows = await db.execute({
    sql: "SELECT product_key, product_name, rarity, quantity, ready_at FROM shop_deliveries WHERE owner_id = ? AND status = 'em_transito' ORDER BY ready_at ASC",
    args: [ownerId],
  });
  const pending: HeroPendingDelivery[] = pendingRows.rows.map((r) => ({
    productKey: String(r.product_key),
    productName: String(r.product_name),
    rarity: r.rarity as ShopRarity,
    quantity: Number(r.quantity),
    readyAt: String(r.ready_at),
  }));
  const rows = await db.execute({
    sql: `SELECT ui.item_key, ui.quantity, ui.acquired_at, p.name, p.description, p.category, p.rarity, p.art, p.effect_text, p.duration_text
          FROM user_inventory_items ui JOIN shop_products p ON p.key = substr(ui.item_key, 6)
          WHERE ui.owner_id = ? AND ui.item_key LIKE 'shop:%' AND ui.quantity > 0
          ORDER BY ui.last_acquired_at DESC`,
    args: [ownerId],
  });
  const items: HeroInventoryItem[] = rows.rows.map((r) => {
    const key = String(r.item_key).slice(5);
    return {
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
      usable: USABLE_PRODUCT_KEYS.includes(key),
      cosmeticSlot: COSMETIC_PRODUCTS[key]?.slot ?? null,
    };
  });
  const bonuses = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM active_item_effects WHERE owner_id = ? AND status = 'active' AND effect_type IN ('XP_MULTIPLIER_TASK', 'COIN_MULTIPLIER_TASK', 'REVIEW_GRACE_WEEKLY') AND expires_at > datetime('now')",
    args: [ownerId],
  });
  const equippedCosmetics = await (async () => {
    const u = await db.execute({ sql: "SELECT rpg_prefs_json FROM users WHERE id = ?", args: [ownerId] });
    try {
      const prefs = JSON.parse(String(u.rows[0]?.rpg_prefs_json ?? "{}"));
      const sc = prefs?.shopCosmetics;
      return sc && typeof sc === "object" ? sc : {};
    } catch {
      return {};
    }
  })();
  const slotsUsed = Object.values(equippedCosmetics).filter((v) => v === true || typeof v === "string").length;
  return {
    items,
    pending,
    kpis: {
      totalItems: items.reduce((s, i) => s + i.quantity, 0),
      legendaryCount: items.filter((i) => i.rarity === "lendario" || i.rarity === "mitico").reduce((s, i) => s + i.quantity, 0),
      consumables: items.filter((i) => i.category === "pocoes").reduce((s, i) => s + i.quantity, 0),
      slotsUsed,
      bonusesActive: Number(bonuses.rows[0]?.n ?? 0),
    },
  };
}

/* ----------------------------- Administração da Loja (admin) ----------------------------- */

export interface AdminShopProduct extends ShopProduct {
  createdAt: string;
  updatedAt: string;
}

function mapAdminProduct(row: Record<string, unknown>): AdminShopProduct {
  return { ...mapProduct(row), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}

/** Catálogo completo (ativos e inativos) — só para a tela de administração. */
export async function listAllProductsAdmin(db: Client): Promise<AdminShopProduct[]> {
  const r = await db.execute({ sql: "SELECT * FROM shop_products ORDER BY category ASC, sort_order ASC, created_at ASC", args: [] });
  return r.rows.map((row) => mapAdminProduct(row as unknown as Record<string, unknown>));
}

export interface ShopProductInput {
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

/** Chave estável a partir do nome (nunca muda depois de criada — pedidos e inventário já existentes referenciam por chave). */
function slugifyProductName(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || `item-${nanoid(8)}`;
}

export type AdminProductResult = { ok: true; product: AdminShopProduct } | { ok: false; code: "duplicate" | "not_found" | "in_use"; message: string };

export async function createProductAdmin(db: Client, input: ShopProductInput): Promise<AdminProductResult> {
  let key = slugifyProductName(input.name);
  const existing = await db.execute({ sql: "SELECT key FROM shop_products WHERE key = ?", args: [key] });
  if (existing.rows[0]) key = `${key}-${nanoid(4)}`;
  await db.execute({
    sql: `INSERT INTO shop_products (key, category, rarity, name, description, currency, price, art, effect_text, duration_text, stackable, max_stack, featured, active, stock, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM shop_products))`,
    args: [
      key,
      input.category,
      input.rarity,
      input.name,
      input.description,
      input.currency,
      input.price,
      input.art,
      input.effectText,
      input.durationText,
      input.stackable ? 1 : 0,
      input.maxStack,
      input.featured ? 1 : 0,
      input.active ? 1 : 0,
      input.stock,
    ],
  });
  const row = (await db.execute({ sql: "SELECT * FROM shop_products WHERE key = ?", args: [key] })).rows[0]!;
  return { ok: true, product: mapAdminProduct(row as unknown as Record<string, unknown>) };
}

export async function updateProductAdmin(db: Client, key: string, input: ShopProductInput): Promise<AdminProductResult> {
  const r = await db.execute({
    sql: `UPDATE shop_products SET category = ?, rarity = ?, name = ?, description = ?, currency = ?, price = ?, art = ?, effect_text = ?, duration_text = ?,
            stackable = ?, max_stack = ?, featured = ?, active = ?, stock = ?, updated_at = datetime('now')
          WHERE key = ?`,
    args: [
      input.category,
      input.rarity,
      input.name,
      input.description,
      input.currency,
      input.price,
      input.art,
      input.effectText,
      input.durationText,
      input.stackable ? 1 : 0,
      input.maxStack,
      input.featured ? 1 : 0,
      input.active ? 1 : 0,
      input.stock,
      key,
    ],
  });
  if (r.rowsAffected === 0) return { ok: false, code: "not_found", message: "Produto não encontrado." };
  const row = (await db.execute({ sql: "SELECT * FROM shop_products WHERE key = ?", args: [key] })).rows[0]!;
  return { ok: true, product: mapAdminProduct(row as unknown as Record<string, unknown>) };
}

export async function setProductActiveAdmin(db: Client, key: string, active: boolean): Promise<AdminProductResult> {
  const r = await db.execute({ sql: "UPDATE shop_products SET active = ?, updated_at = datetime('now') WHERE key = ?", args: [active ? 1 : 0, key] });
  if (r.rowsAffected === 0) return { ok: false, code: "not_found", message: "Produto não encontrado." };
  const row = (await db.execute({ sql: "SELECT * FROM shop_products WHERE key = ?", args: [key] })).rows[0]!;
  return { ok: true, product: mapAdminProduct(row as unknown as Record<string, unknown>) };
}

/** Só apaga de verdade quando ninguém nunca comprou — senão o item sumiria do Inventário de quem já tem. Desativar é o caminho normal. */
export async function deleteProductAdmin(db: Client, key: string): Promise<{ ok: true } | { ok: false; code: "not_found" | "in_use"; message: string }> {
  const used = await db.execute({ sql: "SELECT 1 FROM shop_order_items WHERE product_key = ? LIMIT 1", args: [key] });
  if (used.rows[0]) return { ok: false, code: "in_use", message: "Este produto já foi comprado por algum usuário — desative-o em vez de excluir, para não sumir do Inventário de quem já tem." };
  const r = await db.execute({ sql: "DELETE FROM shop_products WHERE key = ?", args: [key] });
  if (r.rowsAffected === 0) return { ok: false, code: "not_found", message: "Produto não encontrado." };
  return { ok: true };
}
