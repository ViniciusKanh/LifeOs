import { Router, type Response } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { IntegrationError } from "../services/integrationsCore.js";
import { ZoteroError, connectZotero, disconnectZotero, getZoteroOverview, setZoteroCollection, syncZotero, zoteroPaperFlags } from "../services/zoteroService.js";
import { RadarError, addTopic, decideRadarItem, deleteTopic, getRadarOverview, scanRadar } from "../services/radarService.js";
import { WakaError, connectWakatime, disconnectWakatime, getWakatimeOverview, syncWakatime } from "../services/wakatimeService.js";
import { ClickUpError, connectClickUp, disconnectClickUp, getClickUpOverview, listClickUpTeams, syncClickUp, updateClickUpSettings } from "../services/clickupService.js";
import { NutritionError, addMeal, deleteMeal, getNutritionOverview, lookupProduct, MEAL_TYPES, saveNutritionSettings } from "../services/nutritionService.js";
import { HolidayError, addLocalHoliday, deleteLocalHoliday, getHolidayPrefs, holidaysBetween, saveHolidayPrefs } from "../services/holidayService.js";

/**
 * Integrações pessoais por tela (chaves do próprio usuário, criptografadas):
 *   /api/zotero, /api/radar      → Biblioteca do Mestrado
 *   /api/wakatime                → Forja do Código
 *   /api/clickup                 → Profissional
 *   /api/nutrition               → Saúde (Open Food Facts)
 *   /api/holidays                → Agenda, Conselho de Guerra e Raid (BrasilAPI)
 * Todas exigem login; cada consulta é filtrada pelo usuário autenticado.
 */

const KNOWN = [ZoteroError, RadarError, WakaError, ClickUpError, NutritionError, HolidayError, IntegrationError];
const isKnown = (e: unknown): e is Error & { status: number } => KNOWN.some((K) => e instanceof K);

function handler(tag: string, fallback: string) {
  return (res: Response, err: unknown) => {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues[0]?.message ?? "Dados inválidos." });
    if (isKnown(err)) return res.status(err.status).json({ error: err.message });
    // Mensagem genérica: nunca devolvemos detalhes internos (nem trechos de token).
    console.error(`[${tag}] erro:`, err instanceof Error ? err.message : "desconhecido");
    return res.status(500).json({ error: fallback });
  };
}

const syncLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 20, message: "Muitas sincronizações seguidas. Aguarde alguns minutos." });
const keySchema = (min: number, msg: string) => z.object({ key: z.string().trim().min(min, msg).max(200) }).strict();
const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

/* ───────────── Zotero ───────────── */
export const zoteroRouter = Router();
zoteroRouter.use(requireAuth);
const zFail = handler("zotero", "Não foi possível concluir a ação no Zotero.");

zoteroRouter.get("/", async (req, res) => {
  try {
    const [overview, flags] = await Promise.all([getZoteroOverview(getDb(), req.user!.id), zoteroPaperFlags(getDb(), req.user!.id)]);
    return res.json({ ...overview, flags });
  } catch (e) {
    return zFail(res, e);
  }
});
zoteroRouter.post("/connect", syncLimit, async (req, res) => {
  try {
    const { key } = keySchema(16, "Cole a chave da API do Zotero.").parse(req.body);
    const r = await connectZotero(getDb(), req.user!.id, key);
    const sync = await syncZotero(getDb(), req.user!.id).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Falha ao sincronizar." }));
    return res.status(201).json({ ...r, sync });
  } catch (e) {
    return zFail(res, e);
  }
});
zoteroRouter.post("/sync", syncLimit, async (req, res) => {
  try {
    return res.json(await syncZotero(getDb(), req.user!.id));
  } catch (e) {
    return zFail(res, e);
  }
});
zoteroRouter.put("/collection", async (req, res) => {
  try {
    const { collectionKey } = z.object({ collectionKey: z.string().trim().max(20).nullable() }).strict().parse(req.body);
    await setZoteroCollection(getDb(), req.user!.id, collectionKey);
    return res.json({ ok: true });
  } catch (e) {
    return zFail(res, e);
  }
});
zoteroRouter.delete("/connect", async (req, res) => {
  try {
    await disconnectZotero(getDb(), req.user!.id);
    return res.status(204).send();
  } catch (e) {
    return zFail(res, e);
  }
});

/* ───────────── Radar de Artigos ───────────── */
export const radarRouter = Router();
radarRouter.use(requireAuth);
const rFail = handler("radar", "Não foi possível concluir a ação no Radar de Artigos.");

radarRouter.get("/", async (req, res) => {
  try {
    return res.json(await getRadarOverview(getDb(), req.user!.id));
  } catch (e) {
    return rFail(res, e);
  }
});
radarRouter.post("/topics", async (req, res) => {
  try {
    const { query } = z.object({ query: z.string().trim().min(3, "Use pelo menos 3 letras.").max(80) }).strict().parse(req.body);
    return res.status(201).json(await addTopic(getDb(), req.user!.id, query));
  } catch (e) {
    return rFail(res, e);
  }
});
radarRouter.delete("/topics/:id", async (req, res) => {
  try {
    await deleteTopic(getDb(), req.user!.id, z.string().min(1).max(40).parse(req.params.id));
    return res.status(204).send();
  } catch (e) {
    return rFail(res, e);
  }
});
radarRouter.post("/scan", syncLimit, async (req, res) => {
  try {
    const { force } = z.object({ force: z.boolean().optional() }).strict().parse(req.body ?? {});
    return res.json(await scanRadar(getDb(), req.user!.id, { force }));
  } catch (e) {
    return rFail(res, e);
  }
});
radarRouter.post("/items/decide", async (req, res) => {
  try {
    const p = z.object({ key: z.string().min(3).max(200), decision: z.enum(["salvar", "dispensar", "desfazer"]) }).strict().parse(req.body);
    return res.json(await decideRadarItem(getDb(), req.user!.id, p.key, p.decision));
  } catch (e) {
    return rFail(res, e);
  }
});

/* ───────────── WakaTime ───────────── */
export const wakatimeRouter = Router();
wakatimeRouter.use(requireAuth);
const wFail = handler("wakatime", "Não foi possível concluir a ação no WakaTime.");

wakatimeRouter.get("/", async (req, res) => {
  try {
    return res.json(await getWakatimeOverview(getDb(), req.user!.id));
  } catch (e) {
    return wFail(res, e);
  }
});
wakatimeRouter.post("/connect", syncLimit, async (req, res) => {
  try {
    const { key } = keySchema(20, "Cole o token pessoal do WakaTime (wakatime.com/oauth).").parse(req.body);
    const r = await connectWakatime(getDb(), req.user!.id, key);
    const sync = await syncWakatime(getDb(), req.user!.id, { force: true }).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Falha ao sincronizar." }));
    return res.status(201).json({ ...r, sync });
  } catch (e) {
    return wFail(res, e);
  }
});
wakatimeRouter.post("/sync", syncLimit, async (req, res) => {
  try {
    return res.json(await syncWakatime(getDb(), req.user!.id));
  } catch (e) {
    return wFail(res, e);
  }
});
wakatimeRouter.delete("/connect", async (req, res) => {
  try {
    await disconnectWakatime(getDb(), req.user!.id);
    return res.status(204).send();
  } catch (e) {
    return wFail(res, e);
  }
});

/* ───────────── ClickUp ───────────── */
export const clickupRouter = Router();
clickupRouter.use(requireAuth);
const cFail = handler("clickup", "Não foi possível concluir a ação no ClickUp.");

clickupRouter.get("/", async (req, res) => {
  try {
    return res.json(await getClickUpOverview(getDb(), req.user!.id));
  } catch (e) {
    return cFail(res, e);
  }
});
clickupRouter.get("/teams", async (req, res) => {
  try {
    return res.json(await listClickUpTeams(getDb(), req.user!.id));
  } catch (e) {
    return cFail(res, e);
  }
});
clickupRouter.post("/connect", syncLimit, async (req, res) => {
  try {
    const { key } = z.object({ key: z.string().trim().regex(/^pk_[A-Za-z0-9_]{10,120}$/, "O token pessoal do ClickUp começa com pk_.") }).strict().parse(req.body);
    const r = await connectClickUp(getDb(), req.user!.id, key);
    const sync = await syncClickUp(getDb(), req.user!.id).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Falha ao sincronizar." }));
    return res.status(201).json({ ...r, sync });
  } catch (e) {
    return cFail(res, e);
  }
});
clickupRouter.post("/sync", syncLimit, async (req, res) => {
  try {
    return res.json(await syncClickUp(getDb(), req.user!.id));
  } catch (e) {
    return cFail(res, e);
  }
});
clickupRouter.put("/settings", async (req, res) => {
  try {
    const p = z.object({ teamId: z.string().trim().min(1).max(40).optional(), projectId: z.string().trim().min(1).max(40).nullable().optional() }).strict().parse(req.body);
    await updateClickUpSettings(getDb(), req.user!.id, p);
    return res.json(await getClickUpOverview(getDb(), req.user!.id));
  } catch (e) {
    return cFail(res, e);
  }
});
clickupRouter.delete("/connect", async (req, res) => {
  try {
    await disconnectClickUp(getDb(), req.user!.id);
    return res.status(204).send();
  } catch (e) {
    return cFail(res, e);
  }
});

/* ───────────── Cozinha do Herói (Open Food Facts) ───────────── */
export const nutritionRouter = Router();
nutritionRouter.use(requireAuth);
const nFail = handler("nutricao", "Não foi possível concluir a ação na Cozinha do Herói.");
const productLimit = rateLimit({ windowMs: 60 * 1000, max: 30, message: "Muitas consultas de produto seguidas. Aguarde um minuto." });
const nonNeg = (max: number) => z.number().min(0).max(max).nullable().optional();

nutritionRouter.get("/", async (req, res) => {
  try {
    const day = DAY.optional().catch(undefined).parse(req.query.day);
    return res.json(await getNutritionOverview(getDb(), req.user!.id, day));
  } catch (e) {
    return nFail(res, e);
  }
});
nutritionRouter.get("/product/:barcode", productLimit, async (req, res) => {
  try {
    return res.json(await lookupProduct(getDb(), z.string().max(20).parse(req.params.barcode)));
  } catch (e) {
    return nFail(res, e);
  }
});
nutritionRouter.post("/meals", async (req, res) => {
  try {
    const p = z
      .object({
        mealType: z.enum(MEAL_TYPES),
        day: DAY.optional(),
        barcode: z.string().trim().regex(/^\d{6,14}$/, "Código de barras inválido.").nullable().optional(),
        grams: z.number().positive().max(5000).nullable().optional(),
        name: z.string().trim().max(120).nullable().optional(),
        brand: z.string().trim().max(80).nullable().optional(),
        kcal: nonNeg(10000),
        proteinG: nonNeg(1000),
        carbsG: nonNeg(2000),
        fatG: nonNeg(1000),
      })
      .strict()
      .parse(req.body);
    return res.status(201).json(await addMeal(getDb(), req.user!.id, p));
  } catch (e) {
    return nFail(res, e);
  }
});
nutritionRouter.delete("/meals/:id", async (req, res) => {
  try {
    await deleteMeal(getDb(), req.user!.id, z.string().min(1).max(40).parse(req.params.id));
    return res.status(204).send();
  } catch (e) {
    return nFail(res, e);
  }
});
nutritionRouter.put("/settings", async (req, res) => {
  try {
    const p = z.object({ kcalGoal: z.number().int().min(500).max(10000).nullable(), proteinGoalG: z.number().int().min(10).max(500).nullable() }).strict().parse(req.body);
    return res.json(await saveNutritionSettings(getDb(), req.user!.id, p));
  } catch (e) {
    return nFail(res, e);
  }
});

/* ───────────── Feriados (BrasilAPI) ───────────── */
export const holidaysRouter = Router();
holidaysRouter.use(requireAuth);
const hFail = handler("feriados", "Não foi possível carregar os feriados.");

holidaysRouter.get("/", async (req, res) => {
  try {
    const year = z.coerce.number().int().min(2000).max(2100).catch(new Date().getFullYear()).parse(req.query.year);
    const [list, prefs] = await Promise.all([holidaysBetween(getDb(), req.user!.id, `${year}-01-01`, `${year}-12-31`), getHolidayPrefs(getDb(), req.user!.id)]);
    return res.json({ year, ...list, prefs });
  } catch (e) {
    return hFail(res, e);
  }
});
holidaysRouter.put("/prefs", async (req, res) => {
  try {
    const p = z.object({ council: z.boolean().optional(), raidTruce: z.boolean().optional() }).strict().parse(req.body);
    return res.json(await saveHolidayPrefs(getDb(), req.user!.id, p));
  } catch (e) {
    return hFail(res, e);
  }
});
holidaysRouter.post("/local", async (req, res) => {
  try {
    const p = z.object({ date: DAY, name: z.string().trim().min(2, "Dê um nome ao feriado.").max(80) }).strict().parse(req.body);
    return res.status(201).json(await addLocalHoliday(getDb(), req.user!.id, p.date, p.name));
  } catch (e) {
    return hFail(res, e);
  }
});
holidaysRouter.delete("/local/:id", async (req, res) => {
  try {
    await deleteLocalHoliday(getDb(), req.user!.id, z.string().min(1).max(40).parse(req.params.id));
    return res.status(204).send();
  } catch (e) {
    return hFail(res, e);
  }
});
