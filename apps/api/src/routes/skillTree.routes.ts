import { Router, type Response } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import {
  SkillTreeError,
  activeEffects,
  agendaPreview,
  analysisPanel,
  applyPlan,
  deletePreset,
  duplicatePreset,
  getSkillTree,
  oracle,
  resetPreview,
  resetTree,
  saveDesired,
  savePreset,
  saveTreeSettings,
  simulate,
  upgradeSkill,
} from "../services/skillTreeService.js";

/**
 * Árvore de Habilidades (/api/skill-tree). Toda rota é do usuário autenticado e o
 * serviço filtra por owner_id; nenhuma regra (custo, requisito, saldo) vem do cliente.
 */
export const skillTreeRouter = Router();
skillTreeRouter.use(requireAuth);

const target = z.object({ key: z.string().min(1).max(60), level: z.number().int().min(1).max(5) });
const targets = z.array(target).max(80);

function body<T>(schema: z.ZodType<T>, raw: unknown, res: Response): T | null {
  const r = schema.safeParse(raw ?? {});
  if (!r.success) {
    res.status(400).json({ error: r.error.issues[0]?.message ?? "Dados inválidos." });
    return null;
  }
  return r.data;
}
function fail(res: Response, err: unknown) {
  if (err instanceof SkillTreeError) return res.status(err.status).json({ error: err.message, data: err.data ?? null });
  throw err;
}
const owner = (req: { user?: { id: string } }) => req.user!.id;

skillTreeRouter.get("/", async (req, res) => {
  try {
    res.json(await getSkillTree(getDb(), owner(req)));
  } catch (e) {
    fail(res, e);
  }
});

skillTreeRouter.get("/effects", async (req, res) => {
  res.json(await activeEffects(getDb(), owner(req)));
});

skillTreeRouter.post("/upgrade", rateLimit({ windowMs: 60 * 1000, max: 60 }), async (req, res) => {
  const d = body(z.object({ key: z.string().min(1).max(60), expectedLevel: z.number().int().min(0).max(5) }), req.body, res);
  if (!d) return;
  try {
    res.json(await upgradeSkill(getDb(), owner(req), d.key, d.expectedLevel));
  } catch (e) {
    fail(res, e);
  }
});

skillTreeRouter.post("/simulate", async (req, res) => {
  const d = body(z.object({ targets }), req.body, res);
  if (!d) return;
  try {
    res.json(await simulate(getDb(), owner(req), d.targets));
  } catch (e) {
    fail(res, e);
  }
});

skillTreeRouter.post("/apply", rateLimit({ windowMs: 60 * 1000, max: 20 }), async (req, res) => {
  const d = body(z.object({ targets, confirmed: targets, origin: z.enum(["build", "preset", "oracle"]).default("build") }), req.body, res);
  if (!d) return;
  try {
    res.json(await applyPlan(getDb(), owner(req), d.targets, d.confirmed, d.origin ?? "build"));
  } catch (e) {
    fail(res, e);
  }
});

skillTreeRouter.get("/reset", async (req, res) => {
  res.json(await resetPreview(getDb(), owner(req)));
});
skillTreeRouter.post("/reset", rateLimit({ windowMs: 60 * 1000, max: 5 }), async (req, res) => {
  const d = body(z.object({ confirm: z.literal(true), expectedEpoch: z.number().int().min(0) }), req.body, res);
  if (!d) return;
  try {
    res.json(await resetTree(getDb(), owner(req), d.expectedEpoch));
  } catch (e) {
    fail(res, e);
  }
});
skillTreeRouter.put("/settings", async (req, res) => {
  const d = body(z.object({ cooldownDays: z.number().int().min(0).max(90).optional(), refundPct: z.union([z.literal(50), z.literal(75), z.literal(100)]).optional() }), req.body, res);
  if (!d) return;
  res.json(await saveTreeSettings(getDb(), owner(req), d));
});

const presetBody = z.object({ name: z.string().trim().min(2).max(60), description: z.string().max(200).optional().nullable(), targets: targets.min(1) });
skillTreeRouter.post("/presets", async (req, res) => {
  const d = body(presetBody, req.body, res);
  if (!d) return;
  try {
    res.json(await savePreset(getDb(), owner(req), null, d));
  } catch (e) {
    fail(res, e);
  }
});
skillTreeRouter.put("/presets/:id", async (req, res) => {
  const d = body(presetBody, req.body, res);
  if (!d) return;
  try {
    res.json(await savePreset(getDb(), owner(req), req.params.id, d));
  } catch (e) {
    fail(res, e);
  }
});
skillTreeRouter.post("/presets/:id/duplicate", async (req, res) => {
  try {
    res.json(await duplicatePreset(getDb(), owner(req), req.params.id));
  } catch (e) {
    fail(res, e);
  }
});
skillTreeRouter.delete("/presets/:id", async (req, res) => {
  try {
    res.json(await deletePreset(getDb(), owner(req), req.params.id));
  } catch (e) {
    fail(res, e);
  }
});

skillTreeRouter.put("/desired", async (req, res) => {
  const d = body(z.object({ targets }), req.body, res);
  if (!d) return;
  res.json(await saveDesired(getDb(), owner(req), d.targets));
});

skillTreeRouter.get("/analysis/:panel", async (req, res) => {
  try {
    res.json(await analysisPanel(getDb(), owner(req), req.params.panel));
  } catch (e) {
    fail(res, e);
  }
});

skillTreeRouter.post("/agenda-preview", async (req, res) => {
  const d = body(z.object({ effectKey: z.string().min(1).max(80) }), req.body, res);
  if (!d) return;
  try {
    res.json(await agendaPreview(getDb(), owner(req), d.effectKey));
  } catch (e) {
    fail(res, e);
  }
});

skillTreeRouter.post("/oracle", rateLimit({ windowMs: 10 * 60 * 1000, max: 30 }), async (req, res) => {
  const d = body(z.object({ message: z.string().max(600).default("") }), req.body, res);
  if (!d) return;
  try {
    res.json(await oracle(getDb(), owner(req), d.message ?? ""));
  } catch (e) {
    fail(res, e);
  }
});
