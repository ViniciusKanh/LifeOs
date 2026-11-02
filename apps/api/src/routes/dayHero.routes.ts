import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { getDb } from "../db/client.js";
import {
  RITUAL_KINDS,
  TodayError,
  dayCloseSummary,
  focusBlocks,
  getTimer,
  getTodayHub,
  listRitualSteps,
  nextBestAction,
  pauseTimer,
  saveDayCloseToJournal,
  saveRitual,
  setMainMission,
  startTimer,
  stopTimer,
  toggleRitualStep,
  type RitualKind,
} from "../services/todayHubService.js";
import { PERIODS, getHeroDashboard, type Period } from "../services/heroDashboardService.js";

/**
 * /api/today-hub e /api/hero-dashboard — Hoje 3.0 e Painel do Herói.
 * Concluir missões, hábitos e subtarefas continua nas rotas oficiais desses
 * módulos; aqui ficam agregação, ritual, cronômetro e missão principal.
 */
export const todayHubRouter = Router();
export const heroDashboardRouter = Router();
todayHubRouter.use(requireAuth);
heroDashboardRouter.use(requireAuth);

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function fail(res: Response, err: unknown) {
  if (err instanceof TodayError) return res.status(err.status).json({ error: err.message });
  throw err;
}
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
  try {
    await fn(req, res);
  } catch (e) {
    fail(res, e);
  }
};

todayHubRouter.get("/", async (req, res) => {
  const hub = await getTodayHub(getDb(), req.user!.id);
  const nowMin = Number(z.coerce.number().min(0).max(1440).catch(-1).parse(req.query.now));
  return res.json({ ...hub, nextAction: nextBestAction(hub), focusBlocks: nowMin >= 0 ? focusBlocks(hub, nowMin) : [] });
});

todayHubRouter.post(
  "/main",
  wrap(async (req, res) => {
    const body = z.object({ taskId: id.nullable() }).safeParse(req.body ?? {});
    if (!body.success) return res.status(400).json({ error: "Missão inválida." });
    await setMainMission(getDb(), req.user!.id, body.data.taskId);
    return res.json({ ok: true });
  }),
);

todayHubRouter.get("/ritual", async (req, res) => res.json(await listRitualSteps(getDb(), req.user!.id)));
todayHubRouter.put(
  "/ritual",
  wrap(async (req, res) => {
    const body = z
      .object({ steps: z.array(z.object({ id: id.optional(), label: z.string().trim().min(2).max(80), kind: z.enum(RITUAL_KINDS as [RitualKind, ...RitualKind[]]), refId: id.nullable().optional() })).min(1).max(12) })
      .safeParse(req.body ?? {});
    if (!body.success) return res.status(400).json({ error: "Etapas inválidas." });
    await saveRitual(getDb(), req.user!.id, body.data.steps);
    return res.json({ ok: true });
  }),
);
todayHubRouter.post(
  "/ritual/:id/toggle",
  wrap(async (req, res) => {
    const p = id.safeParse(req.params.id);
    const body = z.object({ done: z.boolean() }).safeParse(req.body ?? {});
    if (!p.success || !body.success) return res.status(400).json({ error: "Pedido inválido." });
    await toggleRitualStep(getDb(), req.user!.id, p.data, body.data.done);
    return res.json({ ok: true });
  }),
);

todayHubRouter.get("/timer", async (req, res) => res.json(await getTimer(getDb(), req.user!.id)));
todayHubRouter.post(
  "/timer/start",
  wrap(async (req, res) => {
    const body = z
      .object({ mode: z.enum(["pomodoro", "free", "block"]), plannedMinutes: z.number().int().min(5).max(480).nullable().optional(), linkType: z.enum(["task", "subject", "deck", "project"]).nullable().optional(), linkId: id.nullable().optional() })
      .safeParse(req.body ?? {});
    if (!body.success) return res.status(400).json({ error: "Cronômetro inválido." });
    return res.status(201).json(await startTimer(getDb(), req.user!.id, body.data));
  }),
);
todayHubRouter.post(
  "/timer/pause",
  wrap(async (req, res) => {
    const body = z.object({ pause: z.boolean() }).safeParse(req.body ?? {});
    if (!body.success) return res.status(400).json({ error: "Pedido inválido." });
    return res.json(await pauseTimer(getDb(), req.user!.id, body.data.pause));
  }),
);
todayHubRouter.post(
  "/timer/stop",
  wrap(async (req, res) => res.json(await stopTimer(getDb(), req.user!.id))),
);

todayHubRouter.get("/close", async (req, res) => {
  const hub = await getTodayHub(getDb(), req.user!.id);
  return res.json({ text: dayCloseSummary(hub) });
});
/** POST /api/today-hub/close — grava no Diário SÓ o texto que o usuário revisou e aprovou. */
todayHubRouter.post("/close", async (req, res) => {
  const body = z.object({ text: z.string().trim().min(5).max(2000) }).safeParse(req.body ?? {});
  if (!body.success) return res.status(400).json({ error: "Texto inválido." });
  await saveDayCloseToJournal(getDb(), req.user!.id, body.data.text);
  return res.json({ ok: true });
});

heroDashboardRouter.get("/", async (req, res) => {
  const p = z.enum(Object.keys(PERIODS) as [Period, ...Period[]]).catch("30d").parse(req.query.period);
  const from = day.safeParse(req.query.from);
  const to = day.safeParse(req.query.to);
  return res.json(await getHeroDashboard(getDb(), req.user!.id, p, from.success && to.success ? { from: from.data, to: to.data } : undefined));
});
