import { Router, type Response } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { IntegrationError } from "../services/integrationsCore.js";
import { ChessError, connectLichess, disconnectLichess, getChessOverview, syncLichess } from "../services/chessArenaService.js";
import { AocError, connectAoc, disconnectAoc, getAocOverview, setAocMember, syncAoc } from "../services/adventOfCodeService.js";
import { EXPEDITION_KINDS, ExpeditionError, getExpeditions, saveExpeditionSettings, swapMission } from "../services/expeditionService.js";
import { BestiaryError, connectBestiary, disconnectBestiary, getBestiary, syncBestiary } from "../services/bestiaryService.js";
import { PodcastError, followPodcast, getPodcastOverview, markListened, removePodcastKeys, savePodcastKeys, searchPodcasts, setPodcastGoal, unfollowPodcast, unmarkListened } from "../services/podcastService.js";

/**
 * Integrações de aventura e estudo:
 *   /api/chess        → Aventuras · Arena de Xadrez (Lichess)
 *   /api/aoc          → Forja do Código · Advent of Code
 *   /api/expeditions  → Atlas · Expedições da Semana (OpenStreetMap/Overpass)
 *   /api/bestiary     → Aventuras · Bestiário (iNaturalist)
 *   /api/podcasts     → Biblioteca · Leitura em Áudio (Podcast Index)
 * Todas exigem login; toda leitura e escrita é filtrada pelo usuário autenticado.
 */

const KNOWN = [ChessError, AocError, ExpeditionError, BestiaryError, PodcastError, IntegrationError];
const isKnown = (e: unknown): e is Error & { status: number } => KNOWN.some((K) => e instanceof K);
function handler(tag: string, fallback: string) {
  return (res: Response, err: unknown) => {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues[0]?.message ?? "Dados inválidos." });
    if (isKnown(err)) return res.status(err.status).json({ error: err.message });
    console.error(`[${tag}] erro:`, err instanceof Error ? err.message : "desconhecido");
    return res.status(500).json({ error: fallback });
  };
}
const syncLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 20, message: "Muitas sincronizações seguidas. Aguarde alguns minutos." });
const writeLimit = rateLimit({ windowMs: 60 * 1000, max: 40, message: "Muitas ações seguidas. Aguarde um minuto." });
const ID = z.string().min(1).max(40);

/* ───────────── Arena de Xadrez ───────────── */
export const chessRouter = Router();
chessRouter.use(requireAuth);
const chFail = handler("xadrez", "Não foi possível concluir a ação na Arena de Xadrez.");
chessRouter.get("/", async (req, res) => {
  try {
    return res.json(await getChessOverview(getDb(), req.user!.id));
  } catch (e) {
    return chFail(res, e);
  }
});
chessRouter.post("/connect", syncLimit, async (req, res) => {
  try {
    const p = z.object({ username: z.string().trim().regex(/^[A-Za-z0-9_-]{2,30}$/, "Nome de usuário do Lichess inválido."), token: z.string().trim().max(120).regex(/^[A-Za-z0-9_-]*$/, "Token inválido.").nullable().optional() }).strict().parse(req.body);
    const r = await connectLichess(getDb(), req.user!.id, p);
    const sync = await syncLichess(getDb(), req.user!.id, { force: true }).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Falha ao sincronizar." }));
    return res.status(201).json({ ...r, sync });
  } catch (e) {
    return chFail(res, e);
  }
});
chessRouter.post("/sync", syncLimit, async (req, res) => {
  try {
    return res.json(await syncLichess(getDb(), req.user!.id));
  } catch (e) {
    return chFail(res, e);
  }
});
chessRouter.delete("/connect", async (req, res) => {
  try {
    await disconnectLichess(getDb(), req.user!.id);
    return res.status(204).send();
  } catch (e) {
    return chFail(res, e);
  }
});

/* ───────────── Advent of Code ───────────── */
export const aocRouter = Router();
aocRouter.use(requireAuth);
const aFail = handler("advent-of-code", "Não foi possível concluir a ação no Advent of Code.");
const YEAR = z.coerce.number().int().min(2015).max(2100);
aocRouter.get("/", async (req, res) => {
  try {
    const year = YEAR.optional().catch(undefined).parse(req.query.year);
    return res.json(await getAocOverview(getDb(), req.user!.id, year));
  } catch (e) {
    return aFail(res, e);
  }
});
aocRouter.post("/connect", syncLimit, async (req, res) => {
  try {
    const p = z.object({ session: z.string().trim().min(20, "Cole o valor do cookie 'session'.").max(400), leaderboardId: z.string().trim().min(3).max(40) }).strict().parse(req.body);
    return res.status(201).json(await connectAoc(getDb(), req.user!.id, p));
  } catch (e) {
    return aFail(res, e);
  }
});
aocRouter.post("/sync", syncLimit, async (req, res) => {
  try {
    const { year } = z.object({ year: YEAR }).strict().parse(req.body);
    return res.json(await syncAoc(getDb(), req.user!.id, year));
  } catch (e) {
    return aFail(res, e);
  }
});
aocRouter.put("/member", async (req, res) => {
  try {
    const { memberId } = z.object({ memberId: z.string().regex(/^\d{1,12}$/) }).strict().parse(req.body);
    await setAocMember(getDb(), req.user!.id, memberId);
    return res.json({ ok: true });
  } catch (e) {
    return aFail(res, e);
  }
});
aocRouter.delete("/connect", async (req, res) => {
  try {
    await disconnectAoc(getDb(), req.user!.id);
    return res.status(204).send();
  } catch (e) {
    return aFail(res, e);
  }
});

/* ───────────── Expedições ───────────── */
export const expeditionsRouter = Router();
expeditionsRouter.use(requireAuth);
const eFail = handler("expedicoes", "Não foi possível carregar as expedições.");
expeditionsRouter.get("/", async (req, res) => {
  try {
    return res.json(await getExpeditions(getDb(), req.user!.id));
  } catch (e) {
    return eFail(res, e);
  }
});
expeditionsRouter.put("/settings", writeLimit, async (req, res) => {
  try {
    const p = z.object({ radiusM: z.number().int().min(500).max(15000).optional(), centerPlaceId: ID.nullable().optional(), kinds: z.array(z.enum(EXPEDITION_KINDS)).min(1).max(6).optional() }).strict().parse(req.body);
    return res.json(await saveExpeditionSettings(getDb(), req.user!.id, p));
  } catch (e) {
    return eFail(res, e);
  }
});
expeditionsRouter.post("/:id/swap", writeLimit, async (req, res) => {
  try {
    return res.json(await swapMission(getDb(), req.user!.id, ID.parse(req.params.id)));
  } catch (e) {
    return eFail(res, e);
  }
});

/* ───────────── Bestiário ───────────── */
export const bestiaryRouter = Router();
bestiaryRouter.use(requireAuth);
const bFail = handler("bestiario", "Não foi possível concluir a ação no Bestiário.");
bestiaryRouter.get("/", async (req, res) => {
  try {
    return res.json(await getBestiary(getDb(), req.user!.id));
  } catch (e) {
    return bFail(res, e);
  }
});
bestiaryRouter.post("/connect", syncLimit, async (req, res) => {
  try {
    const { login } = z.object({ login: z.string().trim().regex(/^@?[A-Za-z0-9_-]{2,40}$/, "Login do iNaturalist inválido.") }).strict().parse(req.body);
    return res.status(201).json(await connectBestiary(getDb(), req.user!.id, login));
  } catch (e) {
    return bFail(res, e);
  }
});
bestiaryRouter.post("/sync", syncLimit, async (req, res) => {
  try {
    return res.json(await syncBestiary(getDb(), req.user!.id));
  } catch (e) {
    return bFail(res, e);
  }
});
bestiaryRouter.delete("/connect", async (req, res) => {
  try {
    await disconnectBestiary(getDb(), req.user!.id);
    return res.status(204).send();
  } catch (e) {
    return bFail(res, e);
  }
});

/* ───────────── Leitura em Áudio ───────────── */
export const podcastsRouter = Router();
podcastsRouter.use(requireAuth);
const pFail = handler("podcasts", "Não foi possível concluir a ação na Leitura em Áudio.");
const searchLimit = rateLimit({ windowMs: 60 * 1000, max: 30, message: "Muitas buscas seguidas. Aguarde um minuto." });
const NUM = z.coerce.number().int().positive().max(1e12);
podcastsRouter.get("/", async (req, res) => {
  try {
    return res.json(await getPodcastOverview(getDb(), req.user!.id));
  } catch (e) {
    return pFail(res, e);
  }
});
podcastsRouter.put("/keys", syncLimit, async (req, res) => {
  try {
    const p = z.object({ key: z.string().trim().min(10, "Cole a API Key.").max(100).regex(/^[A-Za-z0-9]+$/, "API Key inválida."), secret: z.string().trim().min(20, "Cole o API Secret.").max(200).regex(/^[A-Za-z0-9$#^]+$/, "API Secret inválido.") }).strict().parse(req.body);
    await savePodcastKeys(getDb(), req.user!.id, p.key, p.secret);
    return res.json({ ok: true });
  } catch (e) {
    return pFail(res, e);
  }
});
podcastsRouter.delete("/keys", async (req, res) => {
  try {
    await removePodcastKeys(getDb(), req.user!.id);
    return res.status(204).send();
  } catch (e) {
    return pFail(res, e);
  }
});
podcastsRouter.get("/search", searchLimit, async (req, res) => {
  try {
    const q = z.string().trim().min(2, "Digite pelo menos 2 letras.").max(100).parse(req.query.q);
    return res.json(await searchPodcasts(getDb(), req.user!.id, q));
  } catch (e) {
    return pFail(res, e);
  }
});
podcastsRouter.post("/follows", writeLimit, async (req, res) => {
  try {
    const { feedId } = z.object({ feedId: NUM }).strict().parse(req.body);
    return res.status(201).json(await followPodcast(getDb(), req.user!.id, feedId));
  } catch (e) {
    return pFail(res, e);
  }
});
podcastsRouter.delete("/follows/:feedId", async (req, res) => {
  try {
    await unfollowPodcast(getDb(), req.user!.id, NUM.parse(req.params.feedId));
    return res.status(204).send();
  } catch (e) {
    return pFail(res, e);
  }
});
podcastsRouter.post("/listens", writeLimit, async (req, res) => {
  try {
    const { episodeId } = z.object({ episodeId: NUM }).strict().parse(req.body);
    return res.status(201).json(await markListened(getDb(), req.user!.id, episodeId));
  } catch (e) {
    return pFail(res, e);
  }
});
podcastsRouter.delete("/listens/:episodeId", async (req, res) => {
  try {
    await unmarkListened(getDb(), req.user!.id, NUM.parse(req.params.episodeId));
    return res.status(204).send();
  } catch (e) {
    return pFail(res, e);
  }
});
podcastsRouter.put("/goal", async (req, res) => {
  try {
    const { goal } = z.object({ goal: z.number().int().min(1).max(200).nullable() }).strict().parse(req.body);
    await setPodcastGoal(getDb(), req.user!.id, goal);
    return res.json({ goal });
  } catch (e) {
    return pFail(res, e);
  }
});
