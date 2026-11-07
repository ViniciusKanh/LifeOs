import { Router, type Response } from "express";
import { z } from "zod";
import { LINK_KINDS, PROOF_KINDS, SKILL_DOMAINS, SKILL_ICONS, SKILL_LIMITS, PROOF_RULES } from "../config/personalSkills.js";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { SkillError, createSkill, createTree, deleteSkill, getSkill, linkOptions, skillsSummary, treeView, updateSkill, type TreeNodeInput } from "../services/personalSkillsService.js";
import { abandonProof, aiStatus, getProof, listProofs, planTree, saveDraft, startProof, submitProof, suggestLevels } from "../services/skillProofService.js";

/**
 * Árvore de Habilidades 2.0 (/api/habilidades). Toda rota exige login e o
 * serviço filtra por owner_id. O cliente nunca envia nível nem nota: o nível
 * só muda pela correção da prova no servidor.
 */
export const personalSkillsRouter = Router();
personalSkillsRouter.use(requireAuth);

const owner = (req: { user?: { id: string } }) => req.user!.id;

function parse<T>(schema: z.ZodType<T>, raw: unknown, res: Response): T | null {
  const r = schema.safeParse(raw ?? {});
  if (!r.success) {
    res.status(400).json({ error: r.error.issues[0]?.message ?? "Dados inválidos." });
    return null;
  }
  return r.data;
}
function fail(res: Response, err: unknown) {
  if (err instanceof SkillError) return res.status(err.status).json({ error: err.message });
  throw err;
}

const levelInput = z.object({ title: z.string().max(40).optional(), criteria: z.string().max(SKILL_LIMITS.criteriaMax).optional() });
const skillFields = {
  name: z.string().trim().min(1, "Dê um nome para a habilidade.").max(SKILL_LIMITS.nameMax),
  description: z.string().trim().max(SKILL_LIMITS.descriptionMax).nullable().optional(),
  icon: z.enum(SKILL_ICONS).optional(),
  maxLevel: z.number().int().min(1).max(10).optional(),
  levels: z.array(levelInput).max(10).optional(),
  proofMode: z.enum(PROOF_KINDS).optional(),
  linkKind: z.enum(LINK_KINDS).nullable().optional(),
  linkRef: z.string().max(80).nullable().optional(),
  practiceMinutesPerLevel: z.number().int().min(0).max(6000).nullable().optional(),
};
const createSchema = z.object({ ...skillFields, domain: z.enum(SKILL_DOMAINS), parentId: z.string().max(40).nullable().optional() });
const updateSchema = z.object({
  ...Object.fromEntries(Object.entries(skillFields).map(([k, v]) => [k, (v as z.ZodTypeAny).optional()])),
  name: skillFields.name.optional(),
  parentId: z.string().max(40).nullable().optional(),
  domain: z.enum(SKILL_DOMAINS).optional(),
  position: z.number().int().min(0).max(1000).optional(),
}) as z.ZodType<Parameters<typeof updateSkill>[3]>;

// Galho confirmado (manual ou proposta da IA revisada): até 4 níveis aninhados.
type NodeIn = TreeNodeInput;
const nodeSchema: z.ZodType<NodeIn> = z.lazy(() =>
  z.object({
    name: skillFields.name,
    description: skillFields.description,
    icon: z.string().max(30).optional(),
    maxLevel: skillFields.maxLevel,
    levels: skillFields.levels,
    proofMode: skillFields.proofMode,
    children: z.array(nodeSchema).max(SKILL_LIMITS.maxChildren).optional(),
  }),
) as z.ZodType<NodeIn>;
const treeSchema = z.object({ domain: z.enum(SKILL_DOMAINS), parentId: z.string().max(40).nullable().optional(), source: z.enum(["manual", "ia"]).optional(), nodes: z.array(nodeSchema).min(1).max(SKILL_LIMITS.maxChildren) });

personalSkillsRouter.get("/", async (req, res) => {
  const db = getDb();
  return res.json(await treeView(db, owner(req), await aiStatus(db, owner(req))));
});

personalSkillsRouter.get("/resumo", async (req, res) => res.json(await skillsSummary(getDb(), owner(req))));

personalSkillsRouter.get("/vinculos", async (req, res) => res.json(await linkOptions(getDb(), owner(req))));

personalSkillsRouter.post("/", rateLimit({ windowMs: 60_000, max: 60 }), async (req, res) => {
  const d = parse(createSchema, req.body, res);
  if (!d) return;
  try {
    const { domain, parentId, ...input } = d;
    const id = await createSkill(getDb(), owner(req), domain, parentId ?? null, input);
    return res.status(201).json(await getSkill(getDb(), owner(req), id));
  } catch (err) {
    return fail(res, err);
  }
});

personalSkillsRouter.post("/galho", rateLimit({ windowMs: 60_000, max: 20 }), async (req, res) => {
  const d = parse(treeSchema, req.body, res);
  if (!d) return;
  try {
    const ids = await createTree(getDb(), owner(req), d.domain, d.parentId ?? null, d.nodes, d.source ?? "manual");
    return res.status(201).json({ created: ids.length, ids });
  } catch (err) {
    return fail(res, err);
  }
});

personalSkillsRouter.patch("/:id", rateLimit({ windowMs: 60_000, max: 60 }), async (req, res) => {
  const d = parse(updateSchema, req.body, res);
  if (!d) return;
  try {
    return res.json(await updateSkill(getDb(), owner(req), req.params.id, d));
  } catch (err) {
    return fail(res, err);
  }
});

personalSkillsRouter.delete("/:id", rateLimit({ windowMs: 60_000, max: 30 }), async (req, res) => {
  try {
    return res.json(await deleteSkill(getDb(), owner(req), req.params.id));
  } catch (err) {
    return fail(res, err);
  }
});

/* ───────────── IA: propostas (nada é gravado aqui) ───────────── */

personalSkillsRouter.post("/ia/galho", rateLimit({ windowMs: 60 * 60_000, max: 15 }), async (req, res) => {
  const d = parse(z.object({ goal: z.string().trim().min(3, "Descreva o que você quer aprender.").max(SKILL_LIMITS.goalMax), domain: z.enum(SKILL_DOMAINS).nullable().optional(), parentId: z.string().max(40).nullable().optional() }), req.body, res);
  if (!d) return;
  try {
    return res.json(await planTree(getDb(), owner(req), d));
  } catch (err) {
    return fail(res, err);
  }
});

personalSkillsRouter.post("/ia/niveis", rateLimit({ windowMs: 60 * 60_000, max: 30 }), async (req, res) => {
  const d = parse(z.object({ name: skillFields.name, description: skillFields.description, domain: z.enum(SKILL_DOMAINS), maxLevel: z.number().int().min(1).max(10), path: z.array(z.string().max(60)).max(6).optional() }), req.body, res);
  if (!d) return;
  try {
    return res.json(await suggestLevels(getDb(), owner(req), d));
  } catch (err) {
    return fail(res, err);
  }
});

/* ───────────── Provas ───────────── */

personalSkillsRouter.get("/:id/provas", async (req, res) => {
  try {
    return res.json(await listProofs(getDb(), owner(req), req.params.id));
  } catch (err) {
    return fail(res, err);
  }
});

personalSkillsRouter.post("/:id/provas", rateLimit({ windowMs: 60 * 60_000, max: PROOF_RULES.maxPerDay * 2 }), async (req, res) => {
  const d = parse(z.object({ kind: z.enum(PROOF_KINDS).optional() }), req.body, res);
  if (!d) return;
  try {
    return res.status(201).json(await startProof(getDb(), owner(req), req.params.id, d));
  } catch (err) {
    return fail(res, err);
  }
});

const answersSchema = z.object({ answers: z.record(z.string().regex(/^q\d{1,2}$/), z.union([z.number().int().min(0).max(9), z.string().max(PROOF_RULES.answerMax)])) });

personalSkillsRouter.get("/provas/:proofId", async (req, res) => {
  try {
    return res.json(await getProof(getDb(), owner(req), req.params.proofId));
  } catch (err) {
    return fail(res, err);
  }
});

personalSkillsRouter.put("/provas/:proofId/rascunho", rateLimit({ windowMs: 60_000, max: 60 }), async (req, res) => {
  const d = parse(answersSchema, req.body, res);
  if (!d) return;
  try {
    return res.json(await saveDraft(getDb(), owner(req), req.params.proofId, d.answers));
  } catch (err) {
    return fail(res, err);
  }
});

personalSkillsRouter.post("/provas/:proofId/entregar", rateLimit({ windowMs: 60_000, max: 10 }), async (req, res) => {
  const d = parse(answersSchema, req.body, res);
  if (!d) return;
  try {
    return res.json(await submitProof(getDb(), owner(req), req.params.proofId, d.answers));
  } catch (err) {
    return fail(res, err);
  }
});

personalSkillsRouter.post("/provas/:proofId/abandonar", async (req, res) => {
  try {
    return res.json(await abandonProof(getDb(), owner(req), req.params.proofId));
  } catch (err) {
    return fail(res, err);
  }
});
