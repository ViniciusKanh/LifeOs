import { Router, type Response } from "express";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import {
  CampaignError,
  addMilestone,
  completeCampaign,
  createCampaign,
  deleteCampaign,
  deleteMilestone,
  getCampaign,
  getCampaignLinks,
  loadCampaigns,
  reorderMilestones,
  rewardSuggestions,
  setCampaignStatus,
  setLinks,
  setMilestoneDone,
  updateCampaign,
  updateMilestone,
} from "../services/campaignsService.js";
import { suggestCampaignMissions } from "../services/campaignAIService.js";
import {
  createCampaignSchema,
  linksSchema,
  milestoneCreateSchema,
  milestoneDoneSchema,
  milestoneUpdateSchema,
  reorderSchema,
  statusSchema,
  suggestMissionsSchema,
  updateCampaignSchema,
} from "../validators/campaigns.schema.js";

/** Forja de Campanhas — toda rota isolada pelo usuário logado (owner_id no serviço). */
export const campaignsRouter = Router();
campaignsRouter.use(requireAuth);
const aiLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 20 });

function fail(res: Response, err: unknown) {
  if (err instanceof CampaignError) return res.status(err.status).json({ error: err.message });
  console.error("[campanhas] erro:", err instanceof Error ? err.message : "desconhecido");
  return res.status(500).json({ error: "Não foi possível concluir a ação." });
}
const bad = (res: Response, issues: Array<{ message: string }>) => res.status(400).json({ error: issues[0]?.message ?? "Dados inválidos." });

campaignsRouter.get("/", async (req, res) => {
  try {
    return res.json(await loadCampaigns(getDb(), req.user!.id));
  } catch (err) {
    return fail(res, err);
  }
});

/** GET /api/campaigns/rewards/suggest?term=medio&milestones=3 — sugestão do LifeOS para o wizard. */
campaignsRouter.get("/rewards/suggest", (req, res) => {
  const term = ["curto", "medio", "longo"].includes(String(req.query.term)) ? (String(req.query.term) as "curto" | "medio" | "longo") : "medio";
  const ms = Math.min(30, Math.max(0, Number(req.query.milestones) || 0));
  return res.json(rewardSuggestions(term, ms));
});

/** POST /api/campaigns/ai/missions — o Gemini sugere missões (nada é salvo). */
campaignsRouter.post("/ai/missions", aiLimit, async (req, res) => {
  const parsed = suggestMissionsSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues);
  const r = await suggestCampaignMissions(getDb(), req.user!.id, parsed.data);
  if (!r.ok) return res.status(422).json({ error: r.message });
  return res.json({ tasks: r.data });
});

campaignsRouter.post("/", async (req, res) => {
  const parsed = createCampaignSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues);
  try {
    return res.status(201).json(await createCampaign(getDb(), req.user!.id, parsed.data));
  } catch (err) {
    return fail(res, err);
  }
});

campaignsRouter.get("/:id", async (req, res) => {
  try {
    const db = getDb();
    const [campaign, links] = await Promise.all([getCampaign(db, req.user!.id, req.params.id), getCampaignLinks(db, req.user!.id, req.params.id)]);
    return res.json({ campaign, ...links });
  } catch (err) {
    return fail(res, err);
  }
});

campaignsRouter.patch("/:id", async (req, res) => {
  const parsed = updateCampaignSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues);
  try {
    return res.json(await updateCampaign(getDb(), req.user!.id, req.params.id, parsed.data));
  } catch (err) {
    return fail(res, err);
  }
});

campaignsRouter.delete("/:id", async (req, res) => {
  try {
    await deleteCampaign(getDb(), req.user!.id, req.params.id);
    return res.status(204).send();
  } catch (err) {
    return fail(res, err);
  }
});

campaignsRouter.post("/:id/status", async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues);
  try {
    return res.json(await setCampaignStatus(getDb(), req.user!.id, req.params.id, parsed.data.status));
  } catch (err) {
    return fail(res, err);
  }
});

/** POST /api/campaigns/:id/complete — conclusão confirmada pelo usuário (idempotente). */
campaignsRouter.post("/:id/complete", async (req, res) => {
  try {
    return res.json(await completeCampaign(getDb(), req.user!.id, req.params.id));
  } catch (err) {
    return fail(res, err);
  }
});

campaignsRouter.post("/:id/links", async (req, res) => {
  const parsed = linksSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues);
  try {
    return res.json(await setLinks(getDb(), req.user!.id, req.params.id, parsed.data.kind, parsed.data.ids, parsed.data.linked));
  } catch (err) {
    return fail(res, err);
  }
});

campaignsRouter.post("/:id/milestones", async (req, res) => {
  const parsed = milestoneCreateSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues);
  try {
    return res.status(201).json(await addMilestone(getDb(), req.user!.id, req.params.id, parsed.data));
  } catch (err) {
    return fail(res, err);
  }
});

campaignsRouter.post("/:id/milestones/reorder", async (req, res) => {
  const parsed = reorderSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues);
  try {
    return res.json(await reorderMilestones(getDb(), req.user!.id, req.params.id, parsed.data.ids));
  } catch (err) {
    return fail(res, err);
  }
});

campaignsRouter.patch("/:id/milestones/:mid", async (req, res) => {
  const parsed = milestoneUpdateSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues);
  try {
    return res.json(await updateMilestone(getDb(), req.user!.id, req.params.id, req.params.mid, parsed.data));
  } catch (err) {
    return fail(res, err);
  }
});

campaignsRouter.delete("/:id/milestones/:mid", async (req, res) => {
  try {
    return res.json(await deleteMilestone(getDb(), req.user!.id, req.params.id, req.params.mid));
  } catch (err) {
    return fail(res, err);
  }
});

/** POST /api/campaigns/:id/milestones/:mid/done — conclui/reabre (recompensa uma única vez). */
campaignsRouter.post("/:id/milestones/:mid/done", async (req, res) => {
  const parsed = milestoneDoneSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues);
  try {
    return res.json(await setMilestoneDone(getDb(), req.user!.id, req.params.id, req.params.mid, parsed.data.done));
  } catch (err) {
    return fail(res, err);
  }
});
