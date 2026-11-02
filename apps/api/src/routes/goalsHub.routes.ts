import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { aiRateLimit } from "../middleware/rateLimit.js";
import { getDb } from "../db/client.js";
import {
  applySuggestion,
  askGoalsCopilot,
  buildReplan,
  buildWeeklyPlan,
  getGoalInsights,
  getGoalsAnalytics,
  getGoalsHub,
  listPlanSuggestions,
  proposeBreakdown,
  rejectSuggestion,
  saveSuggestion,
} from "../services/goalsHubService.js";
import { getAutomation, mondayKey } from "../services/automationService.js";
import { todayKeyFor } from "../services/gamificationService.js";

/** /api/goals-hub — Metas 2.0 (visão geral, análises, copiloto e planos sugeridos). */
export const goalsHubRouter = Router();
goalsHubRouter.use(requireAuth);

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

goalsHubRouter.get("/overview", async (req, res) => res.json(await getGoalsHub(getDb(), req.user!.id)));
goalsHubRouter.get("/analytics", async (req, res) => res.json(await getGoalsAnalytics(getDb(), req.user!.id)));
goalsHubRouter.get("/insights", async (req, res) => res.json(await getGoalInsights(getDb(), req.user!.id)));

goalsHubRouter.post("/copilot", aiRateLimit(), async (req, res) => {
  const parsed = z.object({ question: z.string().trim().min(3, "Escreva uma pergunta.").max(500) }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Pergunta inválida." });
  return res.json(await askGoalsCopilot(getDb(), req.user!.id, parsed.data.question));
});

goalsHubRouter.get("/suggestions", async (req, res) => res.json(await listPlanSuggestions(getDb(), req.user!.id)));

/** Gera agora a sugestão do plano semanal (não altera nada até ser aplicada). */
goalsHubRouter.post("/weekly-plan", async (req, res) => {
  const db = getDb();
  const auto = await getAutomation(db, req.user!.id, "goals", "weekly_plan");
  const plan = await buildWeeklyPlan(db, req.user!.id, auto?.config ?? {});
  if (plan.days.every((d) => d.tasks.length === 0)) return res.status(422).json({ error: "Nenhuma tarefa aberta nas metas ativas para planejar." });
  const suggestionId = await saveSuggestion(db, req.user!.id, "weekly", plan, null, mondayKey(await todayKeyFor(db, req.user!.id)));
  return res.json({ id: suggestionId, payload: plan });
});

goalsHubRouter.post("/goals/:id/replan", async (req, res) => {
  const g = id.safeParse(req.params.id);
  if (!g.success) return res.status(400).json({ error: "Meta inválida." });
  const db = getDb();
  const plan = await buildReplan(db, req.user!.id, g.data);
  if (!plan) return res.status(404).json({ error: "Meta ativa não encontrada." });
  if (plan.tasks.length === 0 && !plan.newDueDate) return res.status(422).json({ error: "Esta meta não tem tarefas abertas para replanejar." });
  const suggestionId = await saveSuggestion(db, req.user!.id, "replan", plan, g.data, null);
  return res.json({ id: suggestionId, payload: plan });
});

goalsHubRouter.post("/goals/:id/plan-ai", aiRateLimit(), async (req, res) => {
  const g = id.safeParse(req.params.id);
  if (!g.success) return res.status(400).json({ error: "Meta inválida." });
  const db = getDb();
  const auto = await getAutomation(db, req.user!.id, "goals", "ai_breakdown");
  if (auto && !auto.enabled) return res.status(403).json({ error: "A automação “Gerar subtarefas com IA” está desligada." });
  const r = await proposeBreakdown(db, req.user!.id, g.data);
  if (!r.ok) return res.status(r.status).json({ error: r.message });
  const suggestionId = await saveSuggestion(db, req.user!.id, "breakdown", r.payload, g.data, null);
  return res.json({ id: suggestionId, payload: r.payload });
});

goalsHubRouter.post("/suggestions/:id/apply", async (req, res) => {
  const s = id.safeParse(req.params.id);
  if (!s.success) return res.status(400).json({ error: "Sugestão inválida." });
  const edited = req.body && typeof req.body === "object" && "payload" in req.body ? (req.body as { payload: unknown }).payload : undefined;
  const r = await applySuggestion(getDb(), req.user!.id, s.data, edited);
  if (!r.ok) return res.status(404).json({ error: r.message });
  return res.json(r);
});

goalsHubRouter.post("/suggestions/:id/reject", async (req, res) => {
  const s = id.safeParse(req.params.id);
  if (!s.success) return res.status(400).json({ error: "Sugestão inválida." });
  return (await rejectSuggestion(getDb(), req.user!.id, s.data)) ? res.status(204).end() : res.status(404).json({ error: "Sugestão não encontrada." });
});
