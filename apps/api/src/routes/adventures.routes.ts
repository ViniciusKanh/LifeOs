import { Router, type Response } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { RaidError, getRaidOverview, saveRaidSettings, setRestDay } from "../services/raidService.js";
import { ACCESSORIES, CARE_ACTIONS, CompanionError, adoptCompanion, careFor, getCompanion, updateCompanion } from "../services/companionService.js";
import {
  AtlasError,
  PLACE_CATEGORIES,
  createCheckin,
  deleteAtlasHistory,
  deleteJournal,
  deletePlace,
  deleteRoute,
  exportAtlas,
  getAtlasOverview,
  journalPhoto,
  reversePlace,
  saveAtlasSettings,
  saveJournal,
  saveRoute,
  searchPlaces,
  updatePlace,
} from "../services/atlasService.js";
import { IntegrationError } from "../services/integrationsCore.js";
import { getAdventureWorld } from "../services/adventureHubService.js";

/** Raid (/api/raid), Companheiro (/api/companion), Atlas (/api/atlas) e resumo para a Vila (/api/adventures). */
export const raidRouter = Router();
export const companionRouter = Router();
export const atlasRouter = Router();
export const adventuresRouter = Router();
for (const r of [raidRouter, companionRouter, atlasRouter, adventuresRouter]) r.use(requireAuth);

function fail(res: Response, err: unknown) {
  if (err instanceof RaidError || err instanceof CompanionError || err instanceof AtlasError || err instanceof IntegrationError) return res.status(err.status).json({ error: err.message });
  if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues[0]?.message ?? "Dados inválidos." });
  console.error("[aventuras] erro:", err instanceof Error ? err.message : "desconhecido");
  return res.status(500).json({ error: "Não foi possível concluir a ação." });
}
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

/* ─────────────── Raid ─────────────── */

raidRouter.get("/", async (req, res) => {
  try {
    return res.json(await getRaidOverview(getDb(), req.user!.id));
  } catch (err) {
    return fail(res, err);
  }
});

raidRouter.put("/settings", async (req, res) => {
  try {
    const b = z.object({ difficulty: z.enum(["leve", "normal", "desafiador"]), healingEnabled: z.boolean(), restWeekdays: z.array(z.number().int().min(0).max(6)).max(3, "No máximo 3 dias de descanso por semana.") }).parse(req.body);
    return res.json(await saveRaidSettings(getDb(), req.user!.id, b));
  } catch (err) {
    return fail(res, err);
  }
});

raidRouter.put("/rest-days/:day", async (req, res) => {
  try {
    const { rest } = z.object({ rest: z.boolean() }).parse(req.body);
    await setRestDay(getDb(), req.user!.id, day.parse(req.params.day), rest);
    return res.json({ ok: true });
  } catch (err) {
    return fail(res, err);
  }
});

/* ─────────────── Companheiro ─────────────── */

companionRouter.get("/", async (req, res) => {
  try {
    return res.json(await getCompanion(getDb(), req.user!.id));
  } catch (err) {
    return fail(res, err);
  }
});

const nameSchema = z.string().trim().min(2, "Nome muito curto.").max(24, "Nome muito longo.");
const colorSchema = z.enum(["cinza", "marrom", "branco", "preto", "dourado"]);

companionRouter.post("/adopt", async (req, res) => {
  try {
    const b = z.object({ name: nameSchema, species: z.enum(["husky"]).default("husky"), color: colorSchema.default("cinza") }).parse(req.body);
    return res.status(201).json(await adoptCompanion(getDb(), req.user!.id, b));
  } catch (err) {
    return fail(res, err);
  }
});

const careLimit = rateLimit({ windowMs: 60_000, max: 20, message: "Calma! Seu companheiro precisa de um tempinho." });
companionRouter.post("/care/:action", careLimit, async (req, res) => {
  try {
    return res.json(await careFor(getDb(), req.user!.id, z.enum(CARE_ACTIONS).parse(req.params.action)));
  } catch (err) {
    return fail(res, err);
  }
});

const accKey = z.enum(ACCESSORIES.map((a) => a.key) as [string, ...string[]]);
companionRouter.patch("/", async (req, res) => {
  try {
    const slotValue = z.union([accKey, z.literal("auto"), z.null()]);
    const b = z
      .object({ name: nameSchema, color: colorSchema, showInWorld: z.boolean(), equipped: z.object({ pescoco: slotValue, cabeca: slotValue, costas: slotValue }).partial() })
      .partial()
      .parse(req.body);
    return res.json(await updateCompanion(getDb(), req.user!.id, b as Parameters<typeof updateCompanion>[2]));
  } catch (err) {
    return fail(res, err);
  }
});

/* ─────────────── Atlas ─────────────── */

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

atlasRouter.get("/", async (req, res) => {
  try {
    return res.json(await getAtlasOverview(getDb(), req.user!.id, { region: typeof req.query.region === "string" ? req.query.region : null }));
  } catch (err) {
    return fail(res, err);
  }
});

const geoLimit = rateLimit({ windowMs: 60_000, max: 20, message: "Muitas buscas seguidas. Aguarde um instante." });
atlasRouter.get("/search", geoLimit, async (req, res) => {
  try {
    const q = z.string().trim().min(2, "Digite pelo menos 2 letras.").max(120).parse(req.query.q);
    const near = req.query.lat && req.query.lng ? { lat: lat.parse(Number(req.query.lat)), lng: lng.parse(Number(req.query.lng)) } : undefined;
    return res.json({ results: await searchPlaces(q, near) });
  } catch (err) {
    return fail(res, err);
  }
});

atlasRouter.get("/reverse", geoLimit, async (req, res) => {
  try {
    return res.json({ place: await reversePlace(lat.parse(Number(req.query.lat)), lng.parse(Number(req.query.lng))) });
  } catch (err) {
    return fail(res, err);
  }
});

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
atlasRouter.post("/checkins", async (req, res) => {
  try {
    const b = z
      .object({
        name: nullableText(160),
        lat,
        lng,
        osmRef: z.string().max(40).nullable().optional(),
        category: z.enum(PLACE_CATEGORIES).nullable().optional(),
        method: z.enum(["manual", "localizacao"]),
        visitedAt: z.string().datetime().nullable().optional(),
        neighborhood: nullableText(120),
        city: nullableText(120),
        state: nullableText(120),
        country: nullableText(120),
        countryCode: nullableText(4),
      })
      .parse(req.body);
    return res.status(201).json(await createCheckin(getDb(), req.user!.id, b));
  } catch (err) {
    return fail(res, err);
  }
});

atlasRouter.patch("/places/:id", async (req, res) => {
  try {
    const b = z.object({ name: z.string().trim().min(1).max(160), category: z.enum(PLACE_CATEGORIES), favorite: z.boolean() }).partial().parse(req.body);
    await updatePlace(getDb(), req.user!.id, String(req.params.id), b);
    return res.json({ ok: true });
  } catch (err) {
    return fail(res, err);
  }
});

atlasRouter.delete("/places/:id", async (req, res) => {
  try {
    await deletePlace(getDb(), req.user!.id, String(req.params.id));
    return res.json({ ok: true });
  } catch (err) {
    return fail(res, err);
  }
});

atlasRouter.post("/routes", async (req, res) => {
  try {
    const b = z.object({ name: z.string().trim().min(1).max(160), points: z.array(z.tuple([lat, lng])).min(2).max(5000), startedAt: z.string().datetime() }).parse(req.body);
    const id = await saveRoute(getDb(), req.user!.id, { ...b, source: "manual" });
    return res.status(201).json({ id });
  } catch (err) {
    return fail(res, err);
  }
});

atlasRouter.delete("/routes/:id", async (req, res) => {
  try {
    await deleteRoute(getDb(), req.user!.id, String(req.params.id));
    return res.json({ ok: true });
  } catch (err) {
    return fail(res, err);
  }
});

atlasRouter.put("/settings", async (req, res) => {
  try {
    const b = z.object({ locationEnabled: z.boolean(), preciseLocation: z.boolean(), useStravaRoutes: z.boolean() }).partial().parse(req.body);
    return res.json(await saveAtlasSettings(getDb(), req.user!.id, b));
  } catch (err) {
    return fail(res, err);
  }
});

const journalSchema = z.object({
  placeId: z.string().max(40).nullable().optional(),
  title: z.string().trim().min(1, "Dê um título.").max(140),
  body: z.string().trim().max(5000).nullable().optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  category: z.string().trim().max(40).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(8).optional(),
  photo: z.string().max(720_000).nullable().optional(),
  visitedOn: day,
});

atlasRouter.post("/journal", async (req, res) => {
  try {
    return res.status(201).json({ id: await saveJournal(getDb(), req.user!.id, journalSchema.parse(req.body)) });
  } catch (err) {
    return fail(res, err);
  }
});

atlasRouter.put("/journal/:id", async (req, res) => {
  try {
    return res.json({ id: await saveJournal(getDb(), req.user!.id, journalSchema.parse(req.body), String(req.params.id)) });
  } catch (err) {
    return fail(res, err);
  }
});

atlasRouter.get("/journal/:id/photo", async (req, res) => {
  try {
    return res.json({ photo: await journalPhoto(getDb(), req.user!.id, String(req.params.id)) });
  } catch (err) {
    return fail(res, err);
  }
});

atlasRouter.delete("/journal/:id", async (req, res) => {
  try {
    await deleteJournal(getDb(), req.user!.id, String(req.params.id));
    return res.json({ ok: true });
  } catch (err) {
    return fail(res, err);
  }
});

atlasRouter.get("/export", async (req, res) => {
  try {
    res.setHeader("Content-Disposition", 'attachment; filename="atlas-lifeos.json"');
    return res.json(await exportAtlas(getDb(), req.user!.id));
  } catch (err) {
    return fail(res, err);
  }
});

atlasRouter.delete("/history", async (req, res) => {
  try {
    z.object({ confirm: z.literal("APAGAR") }).parse(req.body);
    await deleteAtlasHistory(getDb(), req.user!.id);
    return res.json({ ok: true });
  } catch (err) {
    return fail(res, err);
  }
});

/* ─────────────── Vila ─────────────── */

adventuresRouter.get("/world", async (req, res) => {
  try {
    return res.json(await getAdventureWorld(getDb(), req.user!.id));
  } catch (err) {
    return fail(res, err);
  }
});
