import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { aiRateLimit } from "../middleware/rateLimit.js";
import { getDb } from "../db/client.js";
import { getBankHub } from "../services/bankHubService.js";
import { applyStageTemplate, createStage, decideStudyPlan, deleteStage, getEducationHub, runWeeklyStudyPlan, updateStage } from "../services/educationHubService.js";
import { getHealthHub } from "../services/healthHubService.js";
import { askAdvisor, type AdvisorModule } from "../services/moduleAdvisorService.js";
import { automationConfig } from "../services/automationService.js";

/**
 * /api/hub — camada RPG de Banco, Educação e Saúde (indicadores derivados,
 * campanha acadêmica, plano de estudo e conselheiros). Tudo por usuário
 * autenticado; nenhuma rota cria moedas ou XP.
 */
export const moduleHubRouter = Router();
moduleHubRouter.use(requireAuth);

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

moduleHubRouter.get("/bank", async (req, res) => res.json(await getBankHub(getDb(), req.user!.id)));
moduleHubRouter.get("/education", async (req, res) => res.json(await getEducationHub(getDb(), req.user!.id)));
moduleHubRouter.get("/health", async (req, res) => res.json(await getHealthHub(getDb(), req.user!.id)));

const advisorSchema = z.object({ useAi: z.boolean().default(false), question: z.string().max(400).optional(), research: z.boolean().optional() });
moduleHubRouter.post("/:module(bank|education|health|agenda|council|missions|quests|diary|lab|hero|treasure|habits|library|admin|today|contracts|tavern|forge)/advisor", aiRateLimit(), async (req, res) => {
  const body = advisorSchema.safeParse(req.body ?? {});
  if (!body.success) return res.status(400).json({ error: "Pergunta inválida." });
  const module = req.params.module as AdvisorModule;
  if (module === "education" && body.data.research) {
    const a = await automationConfig(getDb(), req.user!.id, "education", "research_assistant");
    if (!a.enabled) return res.status(403).json({ error: "O Assistente de pesquisa está desligado nas automações." });
  }
  return res.json(await askAdvisor(getDb(), req.user!.id, module, body.data));
});

// ---------------- Campanha acadêmica (etapas) ----------------
const stageCreate = z.object({ educationId: id, title: z.string().trim().min(1).max(160), dueDate: day.nullable().optional() });
const stagePatch = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  status: z.enum(["pending", "active", "done"]).optional(),
  dueDate: day.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  position: z.number().int().min(0).max(500).optional(),
});

moduleHubRouter.post("/education/stages", async (req, res) => {
  const b = stageCreate.safeParse(req.body ?? {});
  if (!b.success) return res.status(400).json({ error: b.error.issues[0]?.message ?? "Etapa inválida." });
  const s = await createStage(getDb(), req.user!.id, b.data);
  return s ? res.status(201).json(s) : res.status(404).json({ error: "Formação não encontrada." });
});
moduleHubRouter.post("/education/:educationId/stages/template", async (req, res) => {
  const e = id.safeParse(req.params.educationId);
  if (!e.success) return res.status(400).json({ error: "Formação inválida." });
  const list = await applyStageTemplate(getDb(), req.user!.id, e.data);
  return list ? res.json(list) : res.status(404).json({ error: "Formação não encontrada." });
});
moduleHubRouter.patch("/education/stages/:id", async (req, res) => {
  const i = id.safeParse(req.params.id);
  const b = stagePatch.safeParse(req.body ?? {});
  if (!i.success || !b.success) return res.status(400).json({ error: "Etapa inválida." });
  const s = await updateStage(getDb(), req.user!.id, i.data, b.data);
  return s ? res.json(s) : res.status(404).json({ error: "Etapa não encontrada." });
});
moduleHubRouter.delete("/education/stages/:id", async (req, res) => {
  const i = id.safeParse(req.params.id);
  if (!i.success) return res.status(400).json({ error: "Etapa inválida." });
  return (await deleteStage(getDb(), req.user!.id, i.data)) ? res.status(204).end() : res.status(404).json({ error: "Etapa não encontrada." });
});

// ---------------- Plano semanal de estudo ----------------
moduleHubRouter.post("/education/plan/generate", async (req, res) => {
  const a = await automationConfig(getDb(), req.user!.id, "education", "weekly_study_plan");
  return res.json(await runWeeklyStudyPlan(getDb(), req.user!.id, a.config));
});
const planDecision = z.object({
  decision: z.enum(["apply", "reject"]),
  items: z
    .array(z.object({ date: day, subjectId: id.nullable().optional(), minutes: z.number().int().min(5).max(240), title: z.string().trim().min(1).max(200) }))
    .max(42)
    .optional(),
});
moduleHubRouter.post("/education/plan/:id/decide", async (req, res) => {
  const i = id.safeParse(req.params.id);
  const b = planDecision.safeParse(req.body ?? {});
  if (!i.success || !b.success) return res.status(400).json({ error: "Decisão inválida." });
  const out = await decideStudyPlan(getDb(), req.user!.id, i.data, b.data.decision, b.data.items);
  return out.ok ? res.json(out) : res.status(409).json({ error: out.message });
});
