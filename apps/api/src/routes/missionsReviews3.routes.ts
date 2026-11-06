import { Router, type Response } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { AdvisorError, apply, discard, getSession, listSessions, propose, recalc, type MissionProposal } from "../services/missionAdvisorService.js";
import { BoardError, getMissionsLoad, getMissionsOverview, reorderTask, setTaskArchived } from "../services/missionsBoardService.js";
import {
  REVIEW_KINDS,
  ReviewError,
  applyPlan,
  claimReward,
  getReview,
  listHistory,
  reviewAdvisor,
  saveReview,
  saveReviewSettings,
  sealReview,
  suggestBlocks,
  type ReviewKind,
} from "../services/journeyReviewService.js";

/**
 * Missões 3.0 (/api/missions3), Conselheiro de Missões (/api/mission-advisor)
 * e Revisões da Jornada 3.0 (/api/journey-reviews). Toda rota é do usuário
 * autenticado; cada serviço filtra por owner_id.
 */

function parse<T>(schema: z.ZodType<T>, body: unknown, res: Response): T | null {
  const r = schema.safeParse(body ?? {});
  if (!r.success) {
    res.status(400).json({ error: r.error.issues[0]?.message ?? "Dados inválidos." });
    return null;
  }
  return r.data;
}
function fail(res: Response, err: unknown) {
  if (err instanceof AdvisorError || err instanceof BoardError || err instanceof ReviewError) return res.status(err.status).json({ error: err.message });
  // Erros de serviços reaproveitados (ex.: Conselho de Guerra) também trazem status.
  const s = (err as { status?: unknown })?.status;
  if (typeof s === "number" && s >= 400 && s < 500 && err instanceof Error) return res.status(s).json({ error: err.message });
  console.error("[missoes/revisoes]", err instanceof Error ? err.message : "erro");
  return res.status(500).json({ error: "Não foi possível concluir a operação." });
}
const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/* ═════════════ Missões 3.0 ═════════════ */

export const missionsBoardRouter = Router();
missionsBoardRouter.use(requireAuth);

missionsBoardRouter.get("/overview", async (req, res) => {
  try {
    return res.json(await getMissionsOverview(getDb(), req.user!.id));
  } catch (e) {
    return fail(res, e);
  }
});
missionsBoardRouter.get("/load", async (req, res) => {
  try {
    return res.json(await getMissionsLoad(getDb(), req.user!.id, Number(req.query.days ?? 10)));
  } catch (e) {
    return fail(res, e);
  }
});
missionsBoardRouter.post("/reorder", async (req, res) => {
  const d = parse(z.object({ taskId: id, status: z.string().max(40), beforeId: id.nullable().optional(), afterId: id.nullable().optional() }), req.body, res);
  if (!d) return;
  try {
    return res.json(await reorderTask(getDb(), req.user!.id, d));
  } catch (e) {
    return fail(res, e);
  }
});
missionsBoardRouter.post("/tasks/:id/archive", async (req, res) => {
  const d = parse(z.object({ archived: z.boolean() }), req.body, res);
  if (!d || !id.safeParse(req.params.id).success) return d ? res.status(400).json({ error: "Missão inválida." }) : undefined;
  try {
    return res.json(await setTaskArchived(getDb(), req.user!.id, req.params.id, d.archived));
  } catch (e) {
    return fail(res, e);
  }
});

/* ═════════════ Conselheiro de Missões ═════════════ */

const link = z.object({ id: id.nullable(), title: z.string().max(300).nullable(), score: z.number().nullable(), reason: z.string().max(500), alternatives: z.array(z.object({ id, title: z.string().max(300), score: z.number() })).max(5) });
const proposalSchema = z.object({
  title: z.string().trim().min(1, "Dê um título à missão.").max(200),
  context: z.string().max(1000),
  objective: z.string().max(1000),
  scope: z.string().max(1000),
  deliverable: z.string().max(600),
  expectedResult: z.string().max(600),
  steps: z.array(z.string().max(300)).max(12),
  acceptanceCriteria: z.array(z.string().max(300)).max(10),
  category: z.string().max(60),
  tags: z.array(z.string().max(40)).max(8),
  lifeArea: z.string().max(40).nullable(),
  priority: z.enum(["Baixa", "Média", "Alta"]),
  difficulty: z.enum(["facil", "medio", "dificil", "epico"]),
  estimateMinutes: z.number().int().min(5).max(2400),
  startDate: day,
  dueDate: day.nullable(),
  status: z.enum(["Backlog", "A Fazer"]),
  recurrence: z.enum(["none", "daily", "weekly", "monthly"]),
  subtasks: z.array(z.object({ title: z.string().trim().min(1).max(200), description: z.string().max(800).nullable(), estimateMinutes: z.number().int().min(1).max(960).nullable(), dependsOn: z.number().int().min(0).nullable(), dueDate: day.nullable() })).max(20),
  dependsOn: z.number().int().min(0).nullable(),
  links: z.object({ project: link, goal: link, contract: link, campaign: link }),
  schedule: z.object({
    feasible: z.boolean(),
    hypothesis: z.boolean(),
    finishDate: day.nullable(),
    blocks: z.array(z.object({ date: day, start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/), minutes: z.number().int().min(1).max(600) })).max(12),
    freeMinutesUntilDue: z.number().nullable(),
    conflicts: z.array(z.string().max(400)).max(6),
    alternatives: z.array(z.object({ label: z.string().max(200), dueDate: day.optional(), estimateMinutes: z.number().int().optional() })).max(6),
  }),
  reward: z.object({ xp: z.number(), coins: z.number(), basis: z.string().max(300), bonuses: z.array(z.string().max(200)).max(6) }),
  justification: z.array(z.object({ field: z.string().max(40), text: z.string().max(500) })).max(12),
  confirmed: z.array(z.string().max(40)).max(30),
});
const mode = z.enum(["create", "improve", "sequence", "breakdown"]);

export const missionAdvisorRouter = Router();
missionAdvisorRouter.use(requireAuth);

missionAdvisorRouter.post("/propose", rateLimit({ windowMs: 10 * 60 * 1000, max: 40 }), async (req, res) => {
  const d = parse(
    z.object({
      mode,
      message: z.string().trim().min(2, "Descreva o que você quer fazer.").max(2000),
      detail: z.enum(["rapido", "padrao", "tecnico", "academico"]).default("padrao"),
      sessionId: id.nullable().optional(),
      taskId: id.nullable().optional(),
      current: z.array(proposalSchema).max(6).nullable().optional(),
      confirmed: z.array(z.string().max(40)).max(30).optional(),
      source: z.enum(["missions", "review"]).optional(),
      sourceRef: z.string().max(80).nullable().optional(),
    }),
    req.body,
    res,
  );
  if (!d) return;
  try {
    return res.json(await propose(getDb(), req.user!.id, { ...d, detail: d.detail ?? "padrao", current: (d.current ?? null) as MissionProposal[] | null }));
  } catch (e) {
    return fail(res, e);
  }
});
missionAdvisorRouter.post("/recalc", async (req, res) => {
  const d = parse(proposalSchema, req.body, res);
  if (!d) return;
  try {
    return res.json(await recalc(getDb(), req.user!.id, d as MissionProposal));
  } catch (e) {
    return fail(res, e);
  }
});
missionAdvisorRouter.post("/apply", async (req, res) => {
  const d = parse(z.object({ sessionId: id, mode, items: z.array(proposalSchema).min(1).max(6), targetTaskId: id.nullable().optional(), reserveBlocks: z.boolean().optional() }), req.body, res);
  if (!d) return;
  try {
    return res.json(await apply(getDb(), req.user!.id, { ...d, items: d.items as MissionProposal[] }));
  } catch (e) {
    return fail(res, e);
  }
});
missionAdvisorRouter.post("/sessions/:id/discard", async (req, res) => {
  if (!id.safeParse(req.params.id).success) return res.status(400).json({ error: "Sessão inválida." });
  await discard(getDb(), req.user!.id, req.params.id);
  return res.json({ ok: true });
});
missionAdvisorRouter.get("/sessions", async (req, res) => res.json(await listSessions(getDb(), req.user!.id)));
missionAdvisorRouter.get("/sessions/:id", async (req, res) => {
  if (!id.safeParse(req.params.id).success) return res.status(400).json({ error: "Sessão inválida." });
  try {
    return res.json(await getSession(getDb(), req.user!.id, req.params.id));
  } catch (e) {
    return fail(res, e);
  }
});

/* ═════════════ Revisões da Jornada ═════════════ */

export const journeyReviewsRouter = Router();
journeyReviewsRouter.use(requireAuth);

const kindOf = (raw: string, res: Response): ReviewKind | null => {
  if ((REVIEW_KINDS as string[]).includes(raw)) return raw as ReviewKind;
  res.status(400).json({ error: "Tipo de revisão inválido." });
  return null;
};
const keyRe = /^(\d{4}-\d{2}-\d{2}|\d{4}-\d{2}|\d{4}-Q[1-4]|\d{4})$/;

journeyReviewsRouter.get("/history", async (req, res) => res.json(await listHistory(getDb(), req.user!.id, 60)));
journeyReviewsRouter.put("/settings", async (req, res) => {
  const d = parse(z.object({ weekly: z.number().int().min(1).max(4).optional(), monthly: z.number().int().min(1).max(8).optional(), quarterly: z.number().int().min(1).max(6).optional(), annual: z.number().int().min(1).max(9).optional() }), req.body, res);
  if (!d) return;
  return res.json(await saveReviewSettings(getDb(), req.user!.id, d));
});

journeyReviewsRouter.get("/:kind", async (req, res) => {
  const kind = kindOf(req.params.kind, res);
  if (!kind) return;
  const key = typeof req.query.key === "string" && keyRe.test(req.query.key) ? req.query.key : null;
  try {
    return res.json(await getReview(getDb(), req.user!.id, kind, key));
  } catch (e) {
    return fail(res, e);
  }
});

const action = z.object({ id: z.string().max(40), text: z.string().trim().min(1).max(300), convertedTo: z.enum(["missao", "habito", "meta", "experimento", "protocolo"]).nullable(), refId: z.string().max(64).nullable() });
journeyReviewsRouter.put("/:kind/:key", async (req, res) => {
  const kind = kindOf(req.params.kind, res);
  if (!kind) return;
  if (!keyRe.test(req.params.key)) return res.status(400).json({ error: "Período inválido." });
  const d = parse(
    z.object({
      steps: z.array(z.string().max(30)).max(10).optional(),
      answers: z.record(z.string().max(30), z.string().max(8000)).optional(),
      reflection: z.string().max(40_000).optional(),
      actions: z.array(action).max(15).optional(),
      plan: z
        .object({
          objective: z.string().max(500).optional(),
          priorities: z.array(z.string().max(200)).max(5).optional(),
          focus: z.array(z.object({ type: z.enum(["campaign", "project", "goal"]), id })).max(3).optional(),
          goalIds: z.array(id).max(10).optional(),
          missionIds: z.array(id).max(20).optional(),
          habitIds: z.array(id).max(10).optional(),
          notes: z.string().max(2000).optional(),
        })
        .optional(),
      baseUpdatedAt: z.string().max(40).nullable().optional(),
    }),
    req.body,
    res,
  );
  if (!d) return;
  try {
    return res.json(await saveReview(getDb(), req.user!.id, kind, req.params.key, d));
  } catch (e) {
    return fail(res, e);
  }
});

const kk = (fn: (kind: ReviewKind, key: string, userId: string, body: unknown) => Promise<unknown>) => async (req: import("express").Request, res: Response) => {
  const kind = kindOf(req.params.kind ?? "", res);
  if (!kind) return;
  if (!keyRe.test(req.params.key ?? "")) return res.status(400).json({ error: "Período inválido." });
  try {
    return res.json(await fn(kind, req.params.key!, req.user!.id, req.body));
  } catch (e) {
    return fail(res, e);
  }
};
journeyReviewsRouter.post("/:kind/:key/seal", kk((kind, key, u) => sealReview(getDb(), u, kind, key)));
journeyReviewsRouter.post("/:kind/:key/claim", kk((kind, key, u) => claimReward(getDb(), u, kind, key)));
journeyReviewsRouter.post("/:kind/:key/apply-plan", kk((kind, key, u) => applyPlan(getDb(), u, kind, key)));
journeyReviewsRouter.get("/:kind/:key/blocks", kk((kind, key, u) => suggestBlocks(getDb(), u, kind, key)));
journeyReviewsRouter.post(
  "/:kind/:key/advisor",
  rateLimit({ windowMs: 10 * 60 * 1000, max: 30 }),
  kk(async (kind, key, u, body) => {
    const r = z.object({ mode: z.enum(["analyze", "reflection", "bottlenecks", "plan", "missions", "compare"]), question: z.string().max(500).nullable().optional() }).safeParse(body ?? {});
    if (!r.success) throw new ReviewError("Modo inválido.");
    return reviewAdvisor(getDb(), u, kind, key, r.data.mode, r.data.question);
  }),
);
