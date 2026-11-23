import { Router, type Response } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { aiRateLimit } from "../middleware/rateLimit.js";
import { agentHistory, getWorld, listWorldEvents, placeable, placeDecor, removeDecor, runAgent, saveAgentLook, saveAvatar, saveSettings, WorldError } from "../services/livingWorldService.js";
import { getWorldWeather } from "../services/worldWeatherService.js";
import { BEARDS, HAIR_STYLES, HATS, OUTFITS, PROPS } from "../config/livingWorld.js";

/** Meu Mundo (/api/world): leitura agregada dos dados reais + ações do próprio mundo. */
export const livingWorldRouter = Router();
livingWorldRouter.use(requireAuth);

function fail(res: Response, err: unknown) {
  if (err instanceof WorldError) return res.status(err.status).json({ error: err.message });
  console.error("[meu-mundo] erro:", err instanceof Error ? err.message : "desconhecido");
  return res.status(500).json({ error: "Não foi possível concluir a ação no Meu Mundo." });
}

livingWorldRouter.get("/", async (req, res) => {
  try {
    return res.json(await getWorld(getDb(), req.user!.id));
  } catch (err) {
    return fail(res, err);
  }
});

/** Clima real da localização do Contexto do Dia (Open-Meteo, com cache e último valor válido). */
livingWorldRouter.get("/weather", async (req, res) => {
  try {
    return res.json(await getWorldWeather(getDb(), req.user!.id));
  } catch (err) {
    return fail(res, err);
  }
});

const settingsSchema = z
  .object({
    quality: z.enum(["low", "medium", "high"]),
    effects: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    animSpeed: z.union([z.literal(0.5), z.literal(1), z.literal(1.5)]),
    sound: z.boolean(),
    autonomous: z.boolean(),
    showNames: z.boolean(),
    showIndicators: z.boolean(),
    showLabels: z.boolean(),
    followAvatar: z.boolean(),
    weatherEnabled: z.boolean(),
    weatherIntensity: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    weatherParticles: z.boolean(),
  })
  .partial()
  .strict();

livingWorldRouter.put("/settings", async (req, res) => {
  const p = settingsSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Configuração inválida." });
  try {
    return res.json(await saveSettings(getDb(), req.user!.id, p.data));
  } catch (err) {
    return fail(res, err);
  }
});

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
/** Aparência de personagem (avatar e agentes) — só opções conhecidas e cores hex. */
const lookShape = {
  skin: color,
  hair: color,
  hairStyle: z.enum(HAIR_STYLES),
  beard: z.enum(BEARDS),
  eyes: color,
  glasses: z.boolean(),
  outfit: z.enum(OUTFITS),
  shirt: color,
  pants: color,
  trim: color,
  boots: color,
  cape: color.nullable(),
  hat: z.enum(HATS),
  hatColor: color,
  prop: z.enum(PROPS),
};
const LOOK_KEYS = Object.keys(lookShape);
const avatarSchema = z
  .object({
    name: z.string().trim().min(1).max(40).nullable(),
    ...lookShape,
    // grade do mapa é 42×42 (0..41)
    x: z.number().int().min(0).max(41),
    y: z.number().int().min(0).max(41),
  })
  .partial()
  .strict();

livingWorldRouter.put("/avatar", async (req, res) => {
  const p = avatarSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Dados do avatar inválidos." });
  const look = ["name", ...LOOK_KEYS].some((k) => k in p.data);
  try {
    return res.json(await saveAvatar(getDb(), req.user!.id, p.data, look));
  } catch (err) {
    return fail(res, err);
  }
});

const agentLookSchema = z
  .object({
    look: z.object(lookShape).partial().strict().nullable(),
    nickname: z.string().trim().max(24).nullable(),
  })
  .partial()
  .strict();

livingWorldRouter.put("/agents/:key/look", async (req, res) => {
  const p = agentLookSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Aparência do agente inválida." });
  try {
    return res.json(await saveAgentLook(getDb(), req.user!.id, req.params.key, p.data));
  } catch (err) {
    return fail(res, err);
  }
});

livingWorldRouter.get("/events", async (req, res) => {
  const p = z
    .object({ category: z.enum(["missoes", "habitos", "saude", "diario", "recompensas", "revisoes", "agentes", "mundo", "outros"]).optional(), before: z.string().datetime().optional(), limit: z.coerce.number().int().min(1).max(50).optional() })
    .safeParse(req.query);
  if (!p.success) return res.status(400).json({ error: "Filtro inválido." });
  try {
    return res.json(await listWorldEvents(getDb(), req.user!.id, p.data));
  } catch (err) {
    return fail(res, err);
  }
});

livingWorldRouter.get("/agents/:key/runs", async (req, res) => {
  try {
    return res.json(await agentHistory(getDb(), req.user!.id, req.params.key));
  } catch (err) {
    return fail(res, err);
  }
});

/** Execução real do agente (conselheiro do LifeOS). Só leitura dos dados; não altera nada. */
livingWorldRouter.post("/agents/:key/run", aiRateLimit(), async (req, res) => {
  const p = z.object({ question: z.string().max(400).nullable().optional() }).safeParse(req.body ?? {});
  if (!p.success) return res.status(400).json({ error: "Pedido inválido." });
  try {
    return res.json(await runAgent(getDb(), req.user!.id, req.params.key, p.data.question ?? null));
  } catch (err) {
    return fail(res, err);
  }
});

/** Itens do inventário que podem decorar o mundo (só quando o usuário abre a decoração). */
livingWorldRouter.get("/decor-items", async (req, res) => {
  try {
    return res.json(await placeable(getDb(), req.user!.id));
  } catch (err) {
    return fail(res, err);
  }
});

livingWorldRouter.put("/decor/:slot", async (req, res) => {
  const p = z.object({ itemKey: z.string().min(1).max(120) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Escolha um item." });
  try {
    return res.json(await placeDecor(getDb(), req.user!.id, req.params.slot, p.data.itemKey));
  } catch (err) {
    return fail(res, err);
  }
});

livingWorldRouter.delete("/decor/:slot", async (req, res) => {
  try {
    return res.json(await removeDecor(getDb(), req.user!.id, req.params.slot));
  } catch (err) {
    return fail(res, err);
  }
});
