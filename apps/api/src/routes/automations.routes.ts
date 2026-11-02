import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { getDb } from "../db/client.js";
import { AUTOMATION_MODULES, AutomationConfigError, listAutomations, listRuns, updateAutomation, type AutomationModule } from "../services/automationService.js";
import { runAutomationNow } from "../services/automationRunner.js";

/**
 * /api/automations — central de automações do Grimório e de Metas.
 * Todas as rotas exigem login e operam só nas automações do próprio usuário.
 */
export const automationsRouter = Router();
automationsRouter.use(requireAuth);

const moduleSchema = z.enum(AUTOMATION_MODULES);
const keySchema = z.string().regex(/^[a-z_]{2,40}$/);
const patchSchema = z.object({
  enabled: z.boolean().optional(),
  config: z.record(z.union([z.string().max(64), z.number(), z.boolean(), z.null()])).optional(),
});

automationsRouter.get("/:module", async (req, res) => {
  const m = moduleSchema.safeParse(req.params.module);
  if (!m.success) return res.status(400).json({ error: "Módulo inválido." });
  return res.json(await listAutomations(getDb(), req.user!.id, m.data as AutomationModule));
});

automationsRouter.patch("/:module/:key", async (req, res) => {
  const m = moduleSchema.safeParse(req.params.module);
  const k = keySchema.safeParse(req.params.key);
  const body = patchSchema.safeParse(req.body ?? {});
  if (!m.success || !k.success) return res.status(400).json({ error: "Automação inválida." });
  if (!body.success) return res.status(400).json({ error: body.error.issues[0]?.message ?? "Dados inválidos." });
  let view;
  try {
    view = await updateAutomation(getDb(), req.user!.id, m.data, k.data, body.data);
  } catch (err) {
    if (err instanceof AutomationConfigError) return res.status(400).json({ error: err.message });
    throw err;
  }
  if (!view) return res.status(404).json({ error: "Automação não encontrada." });
  return res.json(view);
});

automationsRouter.post("/:module/:key/run", async (req, res) => {
  const m = moduleSchema.safeParse(req.params.module);
  const k = keySchema.safeParse(req.params.key);
  if (!m.success || !k.success) return res.status(400).json({ error: "Automação inválida." });
  const out = await runAutomationNow(getDb(), req.user!.id, m.data, k.data);
  if (!out) return res.status(404).json({ error: "Automação não encontrada." });
  return res.json(out);
});

automationsRouter.get("/:module/:key/runs", async (req, res) => {
  const m = moduleSchema.safeParse(req.params.module);
  const k = keySchema.safeParse(req.params.key);
  if (!m.success || !k.success) return res.status(400).json({ error: "Automação inválida." });
  return res.json(await listRuns(getDb(), req.user!.id, m.data, k.data));
});
