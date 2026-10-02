import { Router } from "express";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { PERIODIC_KINDS, PERIOD_KEY_REGEX, periodicReviewSchema, visionSchema, wheelSchema } from "../validators/direction.schema.js";
import { getDirectionOverview, getVision, getWheel, getWhyChain, saveVision, saveWheel } from "../services/directionService.js";
import { getPeriodicReview, listPeriodicReviews, savePeriodicReview, type PeriodicKind } from "../services/periodicReviewService.js";

/** Direção: visão, valores, roda da vida, metas por ciclo, "por quê" e revisões periódicas. */
export const directionRouter = Router();
directionRouter.use(requireAuth);

const bad = (issues: { message: string }[]) => ({ error: issues[0]?.message ?? "Dados inválidos." });

directionRouter.get("/", async (req, res) => {
  res.json(await getDirectionOverview(getDb(), req.user!.id));
});

directionRouter.get("/vision", async (req, res) => res.json(await getVision(getDb(), req.user!.id)));
directionRouter.put("/vision", async (req, res) => {
  const parsed = visionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(bad(parsed.error.issues));
  return res.json(await saveVision(getDb(), req.user!.id, parsed.data));
});

directionRouter.get("/wheel", async (req, res) => res.json(await getWheel(getDb(), req.user!.id)));
directionRouter.put("/wheel", async (req, res) => {
  const parsed = wheelSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(bad(parsed.error.issues));
  const assessedOn = parsed.data.assessedOn ?? new Date().toISOString().slice(0, 10);
  return res.json(await saveWheel(getDb(), req.user!.id, assessedOn, parsed.data.scores));
});

/** GET /why?type=task|project|goal&id= — cadeia de propósito do item. */
directionRouter.get("/why", async (req, res) => {
  const type = req.query.type;
  const id = typeof req.query.id === "string" ? req.query.id : "";
  if ((type !== "task" && type !== "project" && type !== "goal") || !id) return res.status(400).json({ error: "Informe type e id." });
  const chain = await getWhyChain(getDb(), req.user!.id, type, id);
  if (!chain) return res.status(404).json({ error: "Item não encontrado." });
  return res.json(chain);
});

function parsePeriod(kind: unknown, key: unknown): { kind: PeriodicKind; key: string } | null {
  if (typeof kind !== "string" || !(PERIODIC_KINDS as readonly string[]).includes(kind) || typeof key !== "string") return null;
  return PERIOD_KEY_REGEX[kind as PeriodicKind].test(key) ? { kind: kind as PeriodicKind, key } : null;
}

directionRouter.get("/reviews", async (req, res) => {
  const kind = typeof req.query.kind === "string" && (PERIODIC_KINDS as readonly string[]).includes(req.query.kind) ? (req.query.kind as PeriodicKind) : undefined;
  return res.json(await listPeriodicReviews(getDb(), req.user!.id, kind));
});

directionRouter.get("/reviews/:kind/:key", async (req, res) => {
  const p = parsePeriod(req.params.kind, req.params.key);
  if (!p) return res.status(400).json({ error: "Período inválido." });
  return res.json(await getPeriodicReview(getDb(), req.user!.id, p.kind, p.key));
});

directionRouter.put("/reviews/:kind/:key", async (req, res) => {
  const p = parsePeriod(req.params.kind, req.params.key);
  if (!p) return res.status(400).json({ error: "Período inválido." });
  const parsed = periodicReviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(bad(parsed.error.issues));
  return res.json(await savePeriodicReview(getDb(), req.user!.id, p.kind, p.key, parsed.data));
});
