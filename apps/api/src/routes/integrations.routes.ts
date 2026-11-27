import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { resolveAppUrl } from "../services/googleAuthService.js";
import { IntegrationError, integrationRedirectBase, readIntegrationState, signIntegrationState } from "../services/integrationsCore.js";
import {
  STEAM_CALLBACK_PATH,
  buildSteamLoginUrl,
  connectSteam,
  disconnectSteam,
  getSteamOverview,
  pinSteamTrophy,
  resolveSteamId,
  getSteamGame,
  steamApiKey,
  syncSteam,
  syncSteamAchievements,
  updateSteamSettings,
  verifySteamOpenId,
} from "../services/steamService.js";

/**
 * Integrações externas (/api/integrations): Steam.
 * O callback do OpenID é público (o usuário vem do state assinado); o resto exige sessão.
 */
export const integrationsRouter = Router();
const syncLimit = rateLimit({ windowMs: 60_000, max: 12, message: "Muitas sincronizações seguidas. Aguarde um instante." });

function fail(res: Response, err: unknown) {
  if (err instanceof IntegrationError) return res.status(err.status).json({ error: err.message, code: err.code });
  if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues[0]?.message ?? "Dados inválidos." });
  console.error("[integracoes] erro:", err instanceof Error ? err.message : "desconhecido");
  return res.status(500).json({ error: "Não foi possível concluir a ação na integração." });
}

/** Volta para a tela da integração com o resultado na query (sem dados sensíveis). */
function backTo(req: Request, res: Response, page: string, result: { ok: true } | { error: string }) {
  const base = resolveAppUrl(req);
  const q = "ok" in result ? "conectado=1" : `erro=${encodeURIComponent(result.error)}`;
  return res.redirect(302, `${base}${page}?${q}`);
}

const disconnectSchema = z.object({ deleteData: z.boolean().default(false) });

/* ─────────────────────────── Steam ─────────────────────────── */

integrationsRouter.get("/steam", requireAuth, async (req, res) => {
  const db = getDb();
  try {
    const range = z.coerce.number().pipe(z.union([z.literal(7), z.literal(14), z.literal(30)])).catch(7).parse(req.query.range);
    await syncSteam(db, req.user!.id).catch(() => null);
    return res.json(await getSteamOverview(db, req.user!.id, range));
  } catch (err) {
    return fail(res, err);
  }
});

integrationsRouter.get("/steam/connect", requireAuth, async (req, res) => {
  if (!(await steamApiKey(getDb()))) return res.status(503).json({ error: "Steam ainda não foi configurada pelo administrador (Configurações → Steam).", code: "nao_configurado" });
  const base = integrationRedirectBase(req);
  const returnTo = `${base}${STEAM_CALLBACK_PATH}?state=${encodeURIComponent(signIntegrationState("steam", req.user!.id))}`;
  return res.json({ url: buildSteamLoginUrl(returnTo, base) });
});

integrationsRouter.get("/steam/callback", async (req, res) => {
  const ownerId = readIntegrationState("steam", String(req.query.state ?? ""));
  if (!ownerId) return backTo(req, res, "/tempo-de-jogo", { error: "Sessão de login expirada. Tente conectar de novo." });
  try {
    const steamId = await verifySteamOpenId(req.query as Record<string, unknown>);
    await connectSteam(getDb(), ownerId, steamId);
    return backTo(req, res, "/tempo-de-jogo", { ok: true });
  } catch (err) {
    return backTo(req, res, "/tempo-de-jogo", { error: err instanceof IntegrationError ? err.message : "Não foi possível conectar a Steam." });
  }
});

integrationsRouter.post("/steam/link", requireAuth, async (req, res) => {
  try {
    const { profile } = z.object({ profile: z.string().trim().min(2).max(200) }).parse(req.body);
    const db = getDb();
    await connectSteam(db, req.user!.id, await resolveSteamId(db, profile));
    return res.json({ ok: true });
  } catch (err) {
    return fail(res, err);
  }
});

integrationsRouter.post("/steam/sync", requireAuth, syncLimit, async (req, res) => {
  try {
    return res.json(await syncSteam(getDb(), req.user!.id, { force: true }));
  } catch (err) {
    return fail(res, err);
  }
});

// Lê conquistas em lotes (a tela chama em sequência enquanto houver pendência).
integrationsRouter.post("/steam/achievements/sync", requireAuth, syncLimit, async (req, res) => {
  try {
    const force = req.body?.force === true;
    return res.json(await syncSteamAchievements(getDb(), req.user!.id, { force, budgetMs: 20_000 }));
  } catch (err) {
    return fail(res, err);
  }
});

integrationsRouter.get("/steam/games/:appid", requireAuth, async (req, res) => {
  try {
    const appid = z.coerce.number().int().positive().parse(req.params.appid);
    return res.json(await getSteamGame(getDb(), req.user!.id, appid));
  } catch (err) {
    return fail(res, err);
  }
});

integrationsRouter.put("/steam/settings", requireAuth, async (req, res) => {
  try {
    const body = z.object({ weeklyLimitHours: z.number().min(1).max(100).nullable(), achievementXp: z.boolean() }).partial().parse(req.body);
    await updateSteamSettings(getDb(), req.user!.id, body);
    return res.json({ ok: true });
  } catch (err) {
    return fail(res, err);
  }
});

integrationsRouter.post("/steam/trophies", requireAuth, async (req, res) => {
  try {
    const b = z.object({ appid: z.number().int().positive(), apiName: z.string().min(1).max(200), pin: z.boolean() }).parse(req.body);
    await pinSteamTrophy(getDb(), req.user!.id, b.appid, b.apiName, b.pin);
    return res.json({ ok: true });
  } catch (err) {
    return fail(res, err);
  }
});

integrationsRouter.post("/steam/disconnect", requireAuth, async (req, res) => {
  try {
    await disconnectSteam(getDb(), req.user!.id, disconnectSchema.parse(req.body ?? {}));
    return res.json({ ok: true });
  } catch (err) {
    return fail(res, err);
  }
});
