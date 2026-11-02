import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { aiRateLimit } from "../middleware/rateLimit.js";
import { getDb } from "../db/client.js";
import {
  HeroError,
  addRewardGoal,
  getAchievementsHub,
  getJourneyHub,
  getTreasureHub,
  listBuildSnapshots,
  momentCandidates,
  narrateJourney,
  recordBuildSnapshot,
  removeRewardGoal,
  setMoment,
  toggleMark,
} from "../services/heroHubService.js";

/**
 * /api/hero — Perfil do Herói 3.0 e Crônica 2.0. Tudo isolado por usuário;
 * nenhuma rota concede XP ou moedas (os resgates continuam em /gamification).
 */
export const heroRouter = Router();
heroRouter.use(requireAuth);

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function fail(res: Response, err: unknown) {
  if (err instanceof HeroError) return res.status(err.status).json({ error: err.message });
  throw err;
}

heroRouter.get("/achievements", async (req, res) => res.json(await getAchievementsHub(getDb(), req.user!.id)));
heroRouter.get("/treasure", async (req, res) => res.json(await getTreasureHub(getDb(), req.user!.id)));

heroRouter.post("/treasure/goals", async (req, res) => {
  const body = z.object({ kind: z.enum(["reward", "title", "relic", "set"]), targetId: z.string().min(1).max(64) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Meta inválida." });
  try {
    await addRewardGoal(getDb(), req.user!.id, body.data.kind, body.data.targetId);
    return res.status(201).json({ ok: true });
  } catch (e) {
    return fail(res, e);
  }
});

heroRouter.delete("/treasure/goals/:id", async (req, res) => {
  const p = id.safeParse(req.params.id);
  if (!p.success) return res.status(400).json({ error: "Meta inválida." });
  try {
    await removeRewardGoal(getDb(), req.user!.id, p.data);
    return res.json({ ok: true });
  } catch (e) {
    return fail(res, e);
  }
});

heroRouter.get("/build/snapshots", async (req, res) => res.json(await listBuildSnapshots(getDb(), req.user!.id)));

/** POST /api/hero/build/snapshots — "Registrar marco" manual (1 por dia; nunca sobrescreve). */
heroRouter.post("/build/snapshots", async (req, res) => {
  try {
    return res.json(await recordBuildSnapshot(getDb(), req.user!.id, "manual"));
  } catch (e) {
    return fail(res, e);
  }
});

heroRouter.get("/journey", async (req, res) => {
  const from = day.safeParse(req.query.from);
  const to = day.safeParse(req.query.to);
  return res.json(await getJourneyHub(getDb(), req.user!.id, from.success ? from.data : undefined, to.success ? to.data : undefined));
});

heroRouter.post("/journey/marks/toggle", async (req, res) => {
  const body = z.object({ eventKey: z.string().max(140), label: z.string().min(1).max(200), at: z.string().min(10).max(40) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Marco inválido." });
  try {
    return res.json(await toggleMark(getDb(), req.user!.id, body.data));
  } catch (e) {
    return fail(res, e);
  }
});

heroRouter.get("/journey/moments/candidates", async (req, res) => res.json(await momentCandidates(getDb(), req.user!.id)));

/** PUT /api/hero/journey/moments/:mediaId { authorized } — o usuário decide quais fotos aparecem. */
heroRouter.put("/journey/moments/:mediaId", async (req, res) => {
  const p = id.safeParse(req.params.mediaId);
  const body = z.object({ authorized: z.boolean() }).safeParse(req.body);
  if (!p.success || !body.success) return res.status(400).json({ error: "Pedido inválido." });
  try {
    await setMoment(getDb(), req.user!.id, p.data, body.data.authorized);
    return res.json({ ok: true });
  } catch (e) {
    return fail(res, e);
  }
});

heroRouter.post("/journey/narrate", aiRateLimit(), async (req, res) => {
  const body = z
    .object({ from: day.optional(), to: day.optional(), mode: z.enum(["rpg", "objetivo", "analitico"]).default("rpg"), useAi: z.boolean().default(false) })
    .safeParse(req.body ?? {});
  if (!body.success) return res.status(400).json({ error: "Pedido inválido." });
  return res.json(await narrateJourney(getDb(), req.user!.id, body.data));
});
