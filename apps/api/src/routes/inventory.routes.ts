import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { getHistory, getInventory, setEquipped, setFlags, useItem, type ActionResult } from "../services/inventoryService.js";

/**
 * Coleção / Inventário. Nenhuma rota concede item diretamente: itens só
 * nascem de marcos reais (sincronizados no servidor). Tudo isolado por usuário.
 */
export const inventoryRouter = Router();
inventoryRouter.use(requireAuth);

const itemKey = z.string().trim().min(2).max(120).regex(/^[a-z0-9:_-]+$/i);
const useSchema = z.object({ itemKey, requestId: z.string().trim().min(8).max(64) });
const equipSchema = z.object({ itemKey, equip: z.boolean() });
const flagSchema = z.object({ itemKey, favorite: z.boolean().optional(), archived: z.boolean().optional() }).refine((v) => v.favorite !== undefined || v.archived !== undefined);
const historySchema = z.object({ type: z.enum(["acquire", "use", "equip"]).optional(), limit: z.coerce.number().int().min(1).max(300).default(100) });

const reply = (res: import("express").Response, r: ActionResult) => (r.ok ? res.json(r) : res.status(r.status).json({ error: r.message }));

/** GET /api/inventory — itens, KPIs, efeitos ativos, conjuntos e últimas aquisições */
inventoryRouter.get("/", async (req, res) => res.json(await getInventory(getDb(), req.user!.id)));

/** GET /api/inventory/history?type= — ledger do inventário */
inventoryRouter.get("/history", async (req, res) => {
  const p = historySchema.safeParse(req.query);
  if (!p.success) return res.status(400).json({ error: "Filtro inválido." });
  return res.json(await getHistory(getDb(), req.user!.id, p.data.type, p.data.limit));
});

/** POST /api/inventory/use — consome 1 unidade (idempotente por requestId) */
inventoryRouter.post("/use", async (req, res) => {
  const p = useSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Requisição inválida." });
  return reply(res, await useItem(getDb(), req.user!.id, p.data.itemKey, p.data.requestId));
});

/** POST /api/inventory/equip — equipa/remove cosmético (atualiza o Perfil) */
inventoryRouter.post("/equip", async (req, res) => {
  const p = equipSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Requisição inválida." });
  return reply(res, await setEquipped(getDb(), req.user!.id, p.data.itemKey, p.data.equip));
});

/** POST /api/inventory/flags — favoritar/arquivar */
inventoryRouter.post("/flags", async (req, res) => {
  const p = flagSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Requisição inválida." });
  return reply(res, await setFlags(getDb(), req.user!.id, p.data.itemKey, p.data));
});
