import { Router, type Response } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { inviteRateLimit } from "../middleware/rateLimit.js";
import {
  GUILD_LIMITS,
  GuildError,
  addCheer,
  createInvite,
  leaveShare,
  listMyInvites,
  listOwnerShares,
  listSharedWithMe,
  pendingInviteCount,
  respondInvite,
  revokeShare,
} from "../services/guildService.js";

/**
 * Guilda — parceiro de compromisso. Toda autorização acontece no service
 * (filtro por owner_id para o dono; invitee_user_id/e-mail verificado para
 * o convidado). As rotas só validam formato e traduzem erros.
 */
export const guildRouter = Router();
guildRouter.use(requireAuth);

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Identificador inválido.");
const entityTypeSchema = z.enum(["contract", "goal"]);

const inviteSchema = z.object({
  entityType: entityTypeSchema,
  entityId: idSchema,
  email: z.string().trim().email("Informe um e-mail válido.").max(254),
  message: z.string().max(GUILD_LIMITS.messageMax, `Mensagem de até ${GUILD_LIMITS.messageMax} caracteres.`).nullish(),
});

const respondSchema = z.object({ accept: z.boolean() });

const cheerSchema = z.object({
  kind: z.enum(["testemunho", "incentivo"]),
  text: z.string().max(GUILD_LIMITS.cheerTextMax, `Até ${GUILD_LIMITS.cheerTextMax} caracteres.`).nullish(),
});

const ownerFilterSchema = z.object({
  entityType: entityTypeSchema.optional(),
  entityId: idSchema.optional(),
});

function handle(res: Response, e: unknown) {
  if (e instanceof GuildError) return res.status(e.status).json({ error: e.message });
  throw e;
}

function badRequest(res: Response, error: z.ZodError) {
  return res.status(400).json({ error: error.issues[0]?.message ?? "Dados inválidos." });
}

/** GET /api/guild/overview — tudo da página Guilda em uma chamada. */
guildRouter.get("/overview", async (req, res) => {
  const db = getDb();
  const userId = req.user!.id;
  const [invites, sharedWithMe, myShares] = await Promise.all([
    listMyInvites(db, userId),
    listSharedWithMe(db, userId),
    listOwnerShares(db, userId),
  ]);
  res.json({ emailVerified: invites.emailVerified, invites: invites.invites, sharedWithMe, myShares, limits: GUILD_LIMITS });
});

/** GET /api/guild/pending-count — badge de convites pendentes. */
guildRouter.get("/pending-count", async (req, res) => {
  res.json({ count: await pendingInviteCount(getDb(), req.user!.id) });
});

/** GET /api/guild/shares?entityType=&entityId= — parceiros de um item do dono. */
guildRouter.get("/shares", async (req, res) => {
  const parsed = ownerFilterSchema.safeParse(req.query);
  if (!parsed.success) return badRequest(res, parsed.error);
  res.json({ shares: await listOwnerShares(getDb(), req.user!.id, parsed.data) });
});

/** POST /api/guild/shares — convida um parceiro (por e-mail) para um contrato/meta do dono. */
guildRouter.post("/shares", inviteRateLimit(), async (req, res) => {
  const parsed = inviteSchema.safeParse(req.body ?? {});
  if (!parsed.success) return badRequest(res, parsed.error);
  try {
    return res.status(201).json(await createInvite(getDb(), req.user!.id, parsed.data));
  } catch (e) {
    return handle(res, e);
  }
});

/** DELETE /api/guild/shares/:id — dono revoga (o parceiro perde o acesso na hora). */
guildRouter.delete("/shares/:id", async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return badRequest(res, id.error);
  try {
    await revokeShare(getDb(), req.user!.id, id.data);
    return res.status(204).end();
  } catch (e) {
    return handle(res, e);
  }
});

/** POST /api/guild/invites/:id/respond — convidado aceita ou recusa. */
guildRouter.post("/invites/:id/respond", inviteRateLimit(), async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return badRequest(res, id.error);
  const parsed = respondSchema.safeParse(req.body ?? {});
  if (!parsed.success) return badRequest(res, parsed.error);
  try {
    await respondInvite(getDb(), req.user!.id, id.data, parsed.data.accept);
    return res.json({ ok: true });
  } catch (e) {
    return handle(res, e);
  }
});

/** POST /api/guild/shared/:id/leave — convidado deixa de acompanhar. */
guildRouter.post("/shared/:id/leave", async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return badRequest(res, id.error);
  try {
    await leaveShare(getDb(), req.user!.id, id.data);
    return res.json({ ok: true });
  } catch (e) {
    return handle(res, e);
  }
});

/** POST /api/guild/shared/:id/cheers — testemunho (1/dia) ou incentivo. */
guildRouter.post("/shared/:id/cheers", async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return badRequest(res, id.error);
  const parsed = cheerSchema.safeParse(req.body ?? {});
  if (!parsed.success) return badRequest(res, parsed.error);
  try {
    return res.status(201).json(await addCheer(getDb(), req.user!.id, id.data, parsed.data));
  } catch (e) {
    return handle(res, e);
  }
});
