import { Router, type Response } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { CODE_KINDS, CodeForgeError, connectGithub, disconnectGithub, getForgeOverview, syncGithub, updateRepo, updateRules } from "../services/codeForgeService.js";

/** Forja do Código (/api/code-forge): GitHub → XP, Crônica e oficina na Vila. */
export const codeForgeRouter = Router();
codeForgeRouter.use(requireAuth);

function fail(res: Response, err: unknown) {
  if (err instanceof CodeForgeError) return res.status(err.status).json({ error: err.message });
  if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues[0]?.message ?? "Dados inválidos." });
  console.error("[forja-codigo] erro:", err instanceof Error ? err.message : "desconhecido");
  return res.status(500).json({ error: "Não foi possível concluir a ação na Forja do Código." });
}

codeForgeRouter.get("/", async (req, res) => {
  try {
    const range = z.enum(["90d", "6m", "12m"]).catch("12m").parse(req.query.range);
    return res.json(await getForgeOverview(getDb(), req.user!.id, range));
  } catch (err) {
    return fail(res, err);
  }
});

const connectSchema = z
  .object({
    username: z.string().trim().max(39).optional(),
    // Token pessoal (fine-grained, só leitura). Nunca é logado nem devolvido.
    token: z.string().trim().min(20).max(255).optional().nullable(),
  })
  .strict()
  .refine((v) => !!v.username || !!v.token, "Informe o usuário do GitHub ou um token.");

const syncLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 12, message: "Muitas sincronizações seguidas. Aguarde alguns minutos." });

codeForgeRouter.post("/connect", syncLimit, async (req, res) => {
  try {
    const p = connectSchema.parse(req.body);
    const r = await connectGithub(getDb(), req.user!.id, p);
    // Primeira sincronização logo após conectar (falha aqui não desfaz a conexão).
    const sync = await syncGithub(getDb(), req.user!.id, { force: true }).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Falha ao sincronizar." }));
    return res.status(201).json({ ...r, sync });
  } catch (err) {
    return fail(res, err);
  }
});

codeForgeRouter.post("/sync", syncLimit, async (req, res) => {
  try {
    return res.json(await syncGithub(getDb(), req.user!.id));
  } catch (err) {
    return fail(res, err);
  }
});

codeForgeRouter.delete("/connect", async (req, res) => {
  try {
    await disconnectGithub(getDb(), req.user!.id);
    return res.status(204).send();
  } catch (err) {
    return fail(res, err);
  }
});

codeForgeRouter.put("/rules", async (req, res) => {
  try {
    const p = z.object(Object.fromEntries(CODE_KINDS.map((k) => [k, z.boolean()])) as Record<(typeof CODE_KINDS)[number], z.ZodBoolean>).partial().strict().parse(req.body);
    return res.json(await updateRules(getDb(), req.user!.id, p));
  } catch (err) {
    return fail(res, err);
  }
});

codeForgeRouter.patch("/repos/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const p = z.object({ monitored: z.boolean().optional(), favorite: z.boolean().optional() }).strict().parse(req.body);
    await updateRepo(getDb(), req.user!.id, id, p);
    return res.status(204).send();
  } catch (err) {
    return fail(res, err);
  }
});
