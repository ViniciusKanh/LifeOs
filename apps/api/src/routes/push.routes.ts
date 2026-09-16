import { Router } from "express";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { getVapidPublicKey, sendPushToUser } from "../services/pushService.js";

export const pushRouter = Router();

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

/**
 * GET /api/push/vapid-public-key — pública, sem exigir sessão: o
 * frontend precisa dela antes mesmo do usuário estar logado em alguns
 * fluxos (ex.: pedir permissão de notificação já na tela de login não
 * faz sentido, mas mantemos a rota simples e sem fricção).
 */
pushRouter.get("/vapid-public-key", async (_req, res) => {
  try {
    const publicKey = await getVapidPublicKey();
    return res.json({ publicKey });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível preparar as notificações push.";
    return res.status(400).json({ error: message });
  }
});

pushRouter.use(requireAuth);

/** POST /api/push/subscribe — grava (ou atualiza) a inscrição deste navegador/dispositivo. */
pushRouter.post("/subscribe", async (req, res) => {
  const parsed = subscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Inscrição de push inválida." });
  }
  const { endpoint, keys } = parsed.data;
  const db = getDb();

  await db.execute({
    sql: `INSERT INTO push_subscriptions (id, owner_id, endpoint, p256dh, auth, user_agent)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (endpoint) DO UPDATE SET owner_id = excluded.owner_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent`,
    args: [nanoid(), req.user!.id, endpoint, keys.p256dh, keys.auth, req.headers["user-agent"] ?? null],
  });

  return res.status(201).json({ ok: true });
});

/** DELETE /api/push/subscribe — remove a inscrição deste navegador (usuário desativou nas configurações). */
pushRouter.delete("/subscribe", async (req, res) => {
  const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : undefined;
  if (!endpoint) {
    return res.status(400).json({ error: "Informe o endpoint da inscrição a remover." });
  }
  const db = getDb();
  await db.execute({
    sql: "DELETE FROM push_subscriptions WHERE owner_id = ? AND endpoint = ?",
    args: [req.user!.id, endpoint],
  });
  return res.status(204).send();
});

/** GET /api/push/subscribe — diz se este usuário tem alguma inscrição ativa (qualquer dispositivo). */
pushRouter.get("/subscribe", async (req, res) => {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM push_subscriptions WHERE owner_id = ?",
    args: [req.user!.id],
  });
  const n = Number((result.rows[0] as unknown as { n: number })?.n ?? 0);
  return res.json({ subscribed: n > 0, count: n });
});

/** POST /api/push/test — envia um push de teste de verdade para todos os dispositivos inscritos do usuário logado. */
pushRouter.post("/test", async (req, res) => {
  const db = getDb();
  const subscriptions = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM push_subscriptions WHERE owner_id = ?",
    args: [req.user!.id],
  });
  if (Number(subscriptions.rows[0]?.n ?? 0) === 0) {
    return res.status(409).json({ error: "Este navegador ainda não foi inscrito. Ative as notificações no Perfil e tente novamente." });
  }
  let result: Awaited<ReturnType<typeof sendPushToUser>>;
  try {
    result = await sendPushToUser(req.user!.id, {
      title: "LifeOS",
      body: "Notificações push estão funcionando!",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível enviar a notificação de teste.";
    return res.status(400).json({ error: message });
  }
  if (result.sent === 0) {
    return res.status(502).json({ error: "A inscrição existe, mas o serviço de push não conseguiu entregar. Reative as notificações neste navegador e tente novamente." });
  }
  return res.json({ ok: true, ...result });
});
