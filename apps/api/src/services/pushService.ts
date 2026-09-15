import webpush from "web-push";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { encryptSecret, decryptSecret } from "./cryptoService.js";

/**
 * Web Push (VAPID) — envia notificações reais para o navegador/celular
 * do usuário mesmo com o LifeOS fechado. As chaves VAPID (par
 * público/privado) são geradas uma única vez, na primeira necessidade,
 * e guardadas em admin_settings (integration = 'push') reaproveitando
 * o mesmo mecanismo de criptografia usado para Gemini/Turso/SMTP —
 * nenhuma delas é secreta o bastante pra justificar um esquema
 * separado, e a pública é só devolvida em texto puro ao frontend.
 */

type Db = ReturnType<typeof getDb>;

async function readPushSetting(db: Db, keyName: string): Promise<string | null> {
  const result = await db.execute({
    sql: "SELECT encrypted_value FROM admin_settings WHERE integration = 'push' AND key_name = ? AND is_active = 1",
    args: [keyName],
  });
  const row = result.rows[0] as { encrypted_value?: string } | undefined;
  if (!row?.encrypted_value) return null;
  return decryptSecret(row.encrypted_value);
}

async function writePushSetting(db: Db, keyName: string, value: string): Promise<void> {
  const encrypted = encryptSecret(value);
  await db.execute({
    sql: `INSERT INTO admin_settings (id, integration, key_name, encrypted_value, masked_preview, is_active)
          VALUES (?, 'push', ?, ?, ?, 1)
          ON CONFLICT (integration, key_name) DO UPDATE SET encrypted_value = excluded.encrypted_value, is_active = 1`,
    args: [nanoid(), keyName, encrypted, `${value.slice(0, 6)}…`],
  });
}

let cachedKeys: { publicKey: string; privateKey: string } | null = null;

/**
 * Garante que existe um par de chaves VAPID, gerando na primeira
 * chamada se ainda não existir. `webpush.setVapidDetails` precisa ser
 * chamado antes de qualquer sendNotification — feito aqui dentro pra
 * nunca esquecer de configurar antes de usar.
 */
export async function getVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  if (cachedKeys) return cachedKeys;

  const db = getDb();
  let publicKey = await readPushSetting(db, "vapid_public_key");
  let privateKey = await readPushSetting(db, "vapid_private_key");

  if (!publicKey || !privateKey) {
    const generated = webpush.generateVAPIDKeys();
    publicKey = generated.publicKey;
    privateKey = generated.privateKey;
    await writePushSetting(db, "vapid_public_key", publicKey);
    await writePushSetting(db, "vapid_private_key", privateKey);
  }

  const keys = { publicKey, privateKey };

  webpush.setVapidDetails(
    `mailto:${process.env.ADMIN_EMAIL ?? "contato@lifeos.app"}`,
    keys.publicKey,
    keys.privateKey
  );

  cachedKeys = keys;
  return cachedKeys;
}

export async function getVapidPublicKey(): Promise<string> {
  const { publicKey } = await getVapidKeys();
  return publicKey;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * Envia um push para todas as inscrições de um usuário. Inscrições
 * "mortas" (410 Gone / 404) são removidas do banco na hora — é assim
 * que o navegador avisa que aquele endpoint nunca mais vai receber
 * nada (usuário desinstalou o PWA, trocou de navegador, etc.).
 */
export async function sendPushToUser(ownerId: string, payload: PushPayload): Promise<{ sent: number; removed: number }> {
  await getVapidKeys();
  const db = getDb();

  const result = await db.execute({
    sql: "SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE owner_id = ?",
    args: [ownerId],
  });

  let sent = 0;
  let removed = 0;

  await Promise.all(
    result.rows.map(async (row) => {
      const sub = row as unknown as { id: string; endpoint: string; p256dh: string; auth: string };
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
        sent += 1;
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await db.execute({ sql: "DELETE FROM push_subscriptions WHERE id = ?", args: [sub.id] });
          removed += 1;
        } else {
          console.error("[push] falha ao enviar notificação:", err);
        }
      }
    })
  );

  return { sent, removed };
}
