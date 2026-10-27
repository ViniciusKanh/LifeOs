import { Router } from "express";
import { getDb } from "../db/client.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { resolveOwnerByIcsToken, buildIcsFeedForOwner } from "../services/icsFeedService.js";

/**
 * Feed de assinatura de calendário (.ics) — rota PÚBLICA de propósito: quem
 * consome é o próprio Google/Apple/Outlook Calendar buscando a URL
 * periodicamente, não o navegador do usuário logado (não há cookie de
 * sessão nessa requisição). A segurança vem só do token — por isso o
 * rate limit por IP aqui, mais generoso que o de login (clientes de
 * calendário de vários usuários podem compartilhar IP/proxy) mas ainda
 * protegendo contra varredura/abuso.
 */
export const icsRouter = Router();

icsRouter.get("/:token.ics", rateLimit({ windowMs: 15 * 60 * 1000, max: 60 }), async (req, res) => {
  const token = req.params.token;
  const db = getDb();
  const ownerId = await resolveOwnerByIcsToken(db, token);
  if (!ownerId) return res.status(404).send("Calendário não encontrado.");

  const ics = await buildIcsFeedForOwner(db, ownerId);
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", 'inline; filename="lifeos.ics"');
  return res.send(ics);
});
