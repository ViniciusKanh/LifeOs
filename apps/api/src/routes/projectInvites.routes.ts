import { Router, type Response } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { inviteRateLimit } from "../middleware/rateLimit.js";
import { ProjectSharingError, listMyProjectInvites, respondProjectInvite } from "../services/projectSharingService.js";

/**
 * Perspectiva do CONVIDADO em compartilhamento de projetos — convites
 * chegam de projetos de qualquer dono, por isso não cabem sob
 * /api/projects/:id/... (que já pressupõe acesso ao projeto). Ver
 * /api/projects/:id/invites para o lado do dono (convidar/revogar).
 */
export const projectInvitesRouter = Router();
projectInvitesRouter.use(requireAuth);

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Identificador inválido.");
const respondSchema = z.object({ accept: z.boolean() });

function handle(res: Response, e: unknown) {
  if (e instanceof ProjectSharingError) return res.status(e.status).json({ error: e.message });
  throw e;
}

/** GET /api/project-invites/mine — convites pendentes de qualquer projeto para o e-mail verificado de quem está logado. */
projectInvitesRouter.get("/mine", async (req, res) => {
  res.json(await listMyProjectInvites(getDb(), req.user!.id));
});

/** POST /api/project-invites/:id/respond — convidado aceita ou recusa. */
projectInvitesRouter.post("/:id/respond", inviteRateLimit(), async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: id.error.issues[0]?.message ?? "Dados inválidos." });
  const parsed = respondSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  try {
    await respondProjectInvite(getDb(), req.user!.id, id.data, parsed.data.accept);
    return res.json({ ok: true });
  } catch (e) {
    return handle(res, e);
  }
});
