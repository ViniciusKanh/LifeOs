import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import {
  SHOP_CATEGORIES,
  SHOP_RARITIES,
  addToCart,
  checkout,
  clearCart,
  getCart,
  getHeroInventory,
  listOrders,
  listProducts,
  removeFromCart,
  updateCartItem,
  type CartResult,
} from "../services/shopService.js";

/** Loja Arcana (Fase 1) — rotas isoladas por usuário. */
export const shopRouter = Router();
shopRouter.use(requireAuth);

const productKey = z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/);
const listSchema = z.object({
  category: z.enum([...SHOP_CATEGORIES, "all"]).optional(),
  rarity: z.enum([...SHOP_RARITIES, "all"]).optional(),
  query: z.string().trim().max(80).optional(),
  sort: z.enum(["relevancia", "preco_asc", "preco_desc", "raridade"]).optional(),
});
const addSchema = z.object({ productKey, quantity: z.number().int().min(1).max(99).default(1) });
const updateSchema = z.object({ quantity: z.number().int().min(0).max(99) });
const checkoutSchema = z.object({
  requestId: z.string().trim().min(8).max(64),
  paymentMethod: z.enum(["coins", "credit"]).default("coins"),
});

const replyCart = (res: import("express").Response, r: CartResult) => (r.ok ? res.json(r.cart) : res.status(r.status).json({ error: r.message }));

/** GET /api/shop/products — catálogo ativo, filtrável */
shopRouter.get("/products", async (req, res) => {
  const p = listSchema.safeParse(req.query);
  if (!p.success) return res.status(400).json({ error: "Filtro inválido." });
  return res.json(await listProducts(getDb(), p.data));
});

/** GET /api/shop/cart — carrinho com preços e saldo recalculados agora */
shopRouter.get("/cart", async (req, res) => res.json(await getCart(getDb(), req.user!.id)));

/** POST /api/shop/cart/items — adiciona (ou soma quantidade) */
shopRouter.post("/cart/items", async (req, res) => {
  const p = addSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Requisição inválida." });
  return replyCart(res, await addToCart(getDb(), req.user!.id, p.data.productKey, p.data.quantity));
});

/** PATCH /api/shop/cart/items/:productKey — define quantidade (0 remove) */
shopRouter.patch("/cart/items/:productKey", async (req, res) => {
  const key = productKey.safeParse(req.params.productKey);
  const body = updateSchema.safeParse(req.body);
  if (!key.success || !body.success) return res.status(400).json({ error: "Requisição inválida." });
  return replyCart(res, await updateCartItem(getDb(), req.user!.id, key.data, body.data.quantity));
});

/** DELETE /api/shop/cart/items/:productKey */
shopRouter.delete("/cart/items/:productKey", async (req, res) => {
  const key = productKey.safeParse(req.params.productKey);
  if (!key.success) return res.status(400).json({ error: "Item inválido." });
  return res.json(await removeFromCart(getDb(), req.user!.id, key.data));
});

/** DELETE /api/shop/cart — esvazia */
shopRouter.delete("/cart", async (req, res) => res.json(await clearCart(getDb(), req.user!.id)));

/** POST /api/shop/checkout — confirma o pedido (idempotente por requestId). paymentMethod "credit" usa o Crédito do Banco (empréstimo real). */
shopRouter.post("/checkout", async (req, res) => {
  const p = checkoutSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Requisição inválida." });
  const r = await checkout(getDb(), req.user!.id, p.data.requestId, p.data.paymentMethod);
  return r.ok ? res.json(r) : res.status(409).json({ error: r.message, code: r.code });
});

/** GET /api/shop/orders — histórico de pedidos do usuário */
shopRouter.get("/orders", async (req, res) => res.json(await listOrders(getDb(), req.user!.id)));

/** GET /api/shop/inventory — Inventário do Herói (itens comprados na Loja) */
shopRouter.get("/inventory", async (req, res) => res.json(await getHeroInventory(getDb(), req.user!.id)));
