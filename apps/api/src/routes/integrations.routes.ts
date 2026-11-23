import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { resolveAppUrl } from "../services/googleAuthService.js";
import { IntegrationError, integrationRedirectBase, readIntegrationState, signIntegrationState } from "../services/integrationsCore.js";
import {
  STRAVA_CALLBACK_PATH,
  buildStravaAuthUrl,
  createStravaSubscription,
  disconnectStrava,
  exchangeStravaCode,
  getStravaOverview,
  handleStravaWebhook,
  stravaAppConfig,
  syncStrava,
  updateStravaSettings,
} from "../services/stravaService.js";
import {
  MUSIC_SESSION_KINDS,
  PLAYLIST_SLOTS,
  SPOTIFY_CALLBACK_PATH,
  buildSpotifyAuthUrl,
  deleteSession,
  deleteSpotifyHistory,
  disconnectSpotify,
  exchangeSpotifyCode,
  getSpotifyOverview,
  listUserPlaylists,
  nowPlaying,
  playerControl,
  setJourneyPlaylist,
  spotifyAppConfig,
  startSession,
  stopOpenSessions,
  syncSpotify,
  updateSpotifySettings,
} from "../services/spotifyService.js";
import {
  STEAM_CALLBACK_PATH,
  buildSteamLoginUrl,
  connectSteam,
  disconnectSteam,
  getSteamOverview,
  pinSteamTrophy,
  resolveSteamId,
  steamApiKey,
  syncSteam,
  updateSteamSettings,
  verifySteamOpenId,
} from "../services/steamService.js";

/**
 * Integrações externas (/api/integrations): Strava, Spotify e Steam.
 * Os callbacks de OAuth/OpenID e o webhook do Strava são públicos (o usuário
 * vem do state assinado); todo o resto exige sessão.
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

/* ─────────────────────────── Strava ─────────────────────────── */

integrationsRouter.get("/strava", requireAuth, async (req, res) => {
  try {
    return res.json(await getStravaOverview(getDb(), req.user!.id));
  } catch (err) {
    return fail(res, err);
  }
});

integrationsRouter.get("/strava/connect", requireAuth, async (req, res) => {
  const cfg = await stravaAppConfig(getDb());
  if (!cfg) return res.status(503).json({ error: "Strava ainda não foi configurado pelo administrador (Configurações → Strava).", code: "nao_configurado" });
  return res.json({ url: buildStravaAuthUrl(cfg.clientId, `${integrationRedirectBase(req)}${STRAVA_CALLBACK_PATH}`, signIntegrationState("strava", req.user!.id)) });
});

integrationsRouter.get("/strava/callback", async (req, res) => {
  const ownerId = readIntegrationState("strava", String(req.query.state ?? ""));
  if (!ownerId) return backTo(req, res, "/strava", { error: "Sessão de autorização expirada. Tente conectar de novo." });
  if (req.query.error || !req.query.code) return backTo(req, res, "/strava", { error: "Autorização cancelada no Strava." });
  const db = getDb();
  try {
    await exchangeStravaCode(db, ownerId, String(req.query.code), req.query.scope ? String(req.query.scope) : null);
    await syncStrava(db, ownerId, { force: true }).catch(() => null);
    return backTo(req, res, "/strava", { ok: true });
  } catch (err) {
    return backTo(req, res, "/strava", { error: err instanceof IntegrationError ? err.message : "Não foi possível conectar o Strava." });
  }
});

integrationsRouter.post("/strava/sync", requireAuth, syncLimit, async (req, res) => {
  try {
    return res.json(await syncStrava(getDb(), req.user!.id, { force: true }));
  } catch (err) {
    return fail(res, err);
  }
});

integrationsRouter.put("/strava/settings", requireAuth, async (req, res) => {
  try {
    const body = z.object({ autoImport: z.boolean(), registerChronicle: z.boolean(), awardXp: z.boolean() }).partial().parse(req.body);
    await updateStravaSettings(getDb(), req.user!.id, body);
    return res.json(await getStravaOverview(getDb(), req.user!.id));
  } catch (err) {
    return fail(res, err);
  }
});

integrationsRouter.post("/strava/disconnect", requireAuth, async (req, res) => {
  try {
    await disconnectStrava(getDb(), req.user!.id, disconnectSchema.parse(req.body ?? {}));
    return res.json({ ok: true });
  } catch (err) {
    return fail(res, err);
  }
});

// Validação da assinatura do webhook (GET com hub.challenge).
integrationsRouter.get("/strava/webhook", async (req, res) => {
  const cfg = await stravaAppConfig(getDb());
  if (req.query["hub.mode"] === "subscribe" && cfg?.verifyToken && req.query["hub.verify_token"] === cfg.verifyToken) {
    return res.json({ "hub.challenge": String(req.query["hub.challenge"] ?? "") });
  }
  return res.status(403).json({ error: "Token de verificação inválido." });
});

const webhookSchema = z.object({
  object_type: z.enum(["activity", "athlete"]),
  object_id: z.number(),
  aspect_type: z.enum(["create", "update", "delete"]),
  owner_id: z.number(),
  event_time: z.number(),
  subscription_id: z.number().optional(),
  updates: z.record(z.string()).optional(),
});

integrationsRouter.post("/strava/webhook", async (req, res) => {
  const parsed = webhookSchema.safeParse(req.body);
  if (!parsed.success) return res.status(200).json({ ignored: true });
  // O Strava espera resposta em até 2 s; falhas ficam para a reconciliação.
  const status = await handleStravaWebhook(getDb(), parsed.data).catch(() => "erro");
  return res.status(200).json({ status });
});

integrationsRouter.post("/strava/webhook/subscribe", requireAuth, requireAdmin, async (req, res) => {
  try {
    const sub = await createStravaSubscription(getDb(), `${integrationRedirectBase(req)}/api/integrations/strava/webhook`);
    return res.json({ ok: true, subscriptionId: sub?.id ?? null });
  } catch (err) {
    return fail(res, err);
  }
});

/* ─────────────────────────── Spotify ─────────────────────────── */

integrationsRouter.get("/spotify", requireAuth, async (req, res) => {
  const db = getDb();
  try {
    await syncSpotify(db, req.user!.id).catch(() => null);
    return res.json(await getSpotifyOverview(db, req.user!.id));
  } catch (err) {
    return fail(res, err);
  }
});

integrationsRouter.get("/spotify/connect", requireAuth, async (req, res) => {
  const cfg = await spotifyAppConfig(getDb());
  if (!cfg) return res.status(503).json({ error: "Spotify ainda não foi configurado pelo administrador (Configurações → Spotify).", code: "nao_configurado" });
  return res.json({ url: buildSpotifyAuthUrl(cfg.clientId, `${integrationRedirectBase(req)}${SPOTIFY_CALLBACK_PATH}`, signIntegrationState("spotify", req.user!.id)) });
});

integrationsRouter.get("/spotify/callback", async (req, res) => {
  const ownerId = readIntegrationState("spotify", String(req.query.state ?? ""));
  if (!ownerId) return backTo(req, res, "/trilha-sonora", { error: "Sessão de autorização expirada. Tente conectar de novo." });
  if (req.query.error || !req.query.code) return backTo(req, res, "/trilha-sonora", { error: "Autorização cancelada no Spotify." });
  const db = getDb();
  try {
    await exchangeSpotifyCode(db, ownerId, String(req.query.code), `${integrationRedirectBase(req)}${SPOTIFY_CALLBACK_PATH}`);
    await syncSpotify(db, ownerId, { force: true }).catch(() => null);
    return backTo(req, res, "/trilha-sonora", { ok: true });
  } catch (err) {
    return backTo(req, res, "/trilha-sonora", { error: err instanceof IntegrationError ? err.message : "Não foi possível conectar o Spotify." });
  }
});

integrationsRouter.get("/spotify/now-playing", requireAuth, async (req, res) => {
  try {
    return res.json({ nowPlaying: await nowPlaying(getDb(), req.user!.id) });
  } catch (err) {
    return fail(res, err);
  }
});

integrationsRouter.post("/spotify/player/:action", requireAuth, async (req, res) => {
  try {
    const action = z.enum(["play", "pause", "next", "previous"]).parse(req.params.action);
    await playerControl(getDb(), req.user!.id, action);
    return res.json({ ok: true });
  } catch (err) {
    return fail(res, err);
  }
});

integrationsRouter.post("/spotify/sync", requireAuth, syncLimit, async (req, res) => {
  try {
    return res.json(await syncSpotify(getDb(), req.user!.id, { force: true }));
  } catch (err) {
    return fail(res, err);
  }
});

integrationsRouter.get("/spotify/playlists", requireAuth, async (req, res) => {
  try {
    return res.json({ playlists: await listUserPlaylists(getDb(), req.user!.id) });
  } catch (err) {
    return fail(res, err);
  }
});

integrationsRouter.put("/spotify/journey-playlists/:slot", requireAuth, async (req, res) => {
  try {
    const slot = z.enum(PLAYLIST_SLOTS).parse(req.params.slot);
    const body = z
      .object({ id: z.string().regex(/^[A-Za-z0-9]{10,40}$/), name: z.string().trim().min(1).max(120), image: z.string().url().nullable().optional(), url: z.string().url().nullable().optional() })
      .nullable()
      .parse(req.body?.playlist ?? null);
    await setJourneyPlaylist(getDb(), req.user!.id, slot, body);
    return res.json({ ok: true });
  } catch (err) {
    return fail(res, err);
  }
});

integrationsRouter.post("/spotify/sessions", requireAuth, async (req, res) => {
  try {
    const { kind } = z.object({ kind: z.enum(MUSIC_SESSION_KINDS) }).parse(req.body);
    return res.status(201).json({ id: await startSession(getDb(), req.user!.id, kind) });
  } catch (err) {
    return fail(res, err);
  }
});

integrationsRouter.post("/spotify/sessions/stop", requireAuth, async (req, res) => {
  try {
    const db = getDb();
    await syncSpotify(db, req.user!.id, { force: true }).catch(() => null);
    return res.json({ stopped: await stopOpenSessions(db, req.user!.id) });
  } catch (err) {
    return fail(res, err);
  }
});

integrationsRouter.delete("/spotify/sessions/:id", requireAuth, async (req, res) => {
  try {
    await deleteSession(getDb(), req.user!.id, String(req.params.id));
    return res.json({ ok: true });
  } catch (err) {
    return fail(res, err);
  }
});

integrationsRouter.put("/spotify/settings", requireAuth, async (req, res) => {
  try {
    const body = z.object({ recordHistory: z.boolean(), linkSessions: z.boolean(), stats: z.boolean(), insights: z.boolean(), privateMode: z.boolean() }).partial().parse(req.body);
    await updateSpotifySettings(getDb(), req.user!.id, body);
    return res.json({ ok: true });
  } catch (err) {
    return fail(res, err);
  }
});

integrationsRouter.delete("/spotify/history", requireAuth, async (req, res) => {
  try {
    await deleteSpotifyHistory(getDb(), req.user!.id);
    return res.json({ ok: true });
  } catch (err) {
    return fail(res, err);
  }
});

integrationsRouter.post("/spotify/disconnect", requireAuth, async (req, res) => {
  try {
    await disconnectSpotify(getDb(), req.user!.id, disconnectSchema.parse(req.body ?? {}));
    return res.json({ ok: true });
  } catch (err) {
    return fail(res, err);
  }
});

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
