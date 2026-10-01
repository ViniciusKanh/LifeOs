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

/**
 * Grava a chave SÓ se ainda não existir (primeiro a gravar vence). Em
 * serverless, duas instâncias frias podiam gerar pares diferentes ao mesmo
 * tempo e a segunda sobrescrevia a primeira: o navegador se inscrevia com
 * a chave pública de um par e o envio era assinado com a privada de outro,
 * e o serviço de push recusava (401/403) — era o erro "a inscrição existe,
 * mas o serviço de push não conseguiu entregar".
 */
async function insertPushSettingIfMissing(db: Db, keyName: string, value: string): Promise<void> {
  const encrypted = encryptSecret(value);
  await db.execute({
    sql: `INSERT INTO admin_settings (id, integration, key_name, encrypted_value, masked_preview, is_active)
          VALUES (?, 'push', ?, ?, ?, 1)
          ON CONFLICT (integration, key_name) DO NOTHING`,
    args: [nanoid(), keyName, encrypted, `${value.slice(0, 6)}…`],
  });
}

async function forcePushSetting(db: Db, keyName: string, value: string): Promise<void> {
  const encrypted = encryptSecret(value);
  await db.execute({
    sql: `INSERT INTO admin_settings (id, integration, key_name, encrypted_value, masked_preview, is_active)
          VALUES (?, 'push', ?, ?, ?, 1)
          ON CONFLICT (integration, key_name) DO UPDATE SET encrypted_value = excluded.encrypted_value, masked_preview = excluded.masked_preview, is_active = 1`,
    args: [nanoid(), keyName, encrypted, `${value.slice(0, 6)}…`],
  });
}

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

// Cache curto: o par é relido do banco periodicamente para que todas as
// instâncias convirjam para o MESMO par salvo (nunca um par só em memória).
const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: { keys: VapidKeys; at: number } | null = null;

function vapidSubject() {
  const email = (process.env.ADMIN_EMAIL ?? "").trim();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? `mailto:${email}` : "mailto:contato@lifeos.app";
}

async function readKeyPair(db: Db): Promise<VapidKeys | null> {
  const [publicKey, privateKey] = await Promise.all([readPushSetting(db, "vapid_public_key"), readPushSetting(db, "vapid_private_key")]);
  return publicKey && privateKey ? { publicKey, privateKey } : null;
}

/** Garante um par VAPID persistido — sempre o par que está no banco. */
export async function getVapidKeys(): Promise<VapidKeys> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.keys;

  const db = getDb();
  let keys = await readKeyPair(db);
  if (!keys) {
    const generated = webpush.generateVAPIDKeys();
    await insertPushSettingIfMissing(db, "vapid_public_key", generated.publicKey);
    await insertPushSettingIfMissing(db, "vapid_private_key", generated.privateKey);
    keys = await readKeyPair(db);
    if (!keys) {
      // Linhas antigas inativas ou par incompleto: grava o par novo inteiro.
      await forcePushSetting(db, "vapid_public_key", generated.publicKey);
      await forcePushSetting(db, "vapid_private_key", generated.privateKey);
      keys = { publicKey: generated.publicKey, privateKey: generated.privateKey };
    }
  }

  cached = { keys, at: Date.now() };
  return keys;
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

export type PushFailureKind = "auth" | "gone" | "invalid" | "rate_limited" | "network" | "unknown";

export interface PushFailure {
  /** Só o host do serviço (fcm.googleapis.com, *.notify.windows.com…) — o endpoint completo é um identificador e não sai daqui. */
  service: string;
  statusCode: number | null;
  kind: PushFailureKind;
}

function classifyFailure(statusCode: number | null): PushFailureKind {
  if (statusCode === null) return "network";
  if (statusCode === 404 || statusCode === 410) return "gone";
  if (statusCode === 401 || statusCode === 403) return "auth";
  if (statusCode === 400 || statusCode === 413) return "invalid";
  if (statusCode === 429) return "rate_limited";
  return "unknown";
}

function serviceHost(endpoint: string) {
  try {
    return new URL(endpoint).host;
  } catch {
    return "desconhecido";
  }
}

/**
 * Envia um push para todas as inscrições de um usuário, sempre assinado com
 * o par VAPID persistido (passado por envio, sem depender de estado global).
 *
 * Inscrições que nunca mais vão funcionar são removidas na hora:
 *  - 404/410: o navegador descartou a inscrição;
 *  - 401/403: a inscrição foi criada com outra chave pública — o app
 *    recria a inscrição automaticamente na próxima sincronização.
 */
export async function sendPushToUser(
  ownerId: string,
  payload: PushPayload
): Promise<{ sent: number; removed: number; failures: PushFailure[] }> {
  const keys = await getVapidKeys();
  const db = getDb();

  const result = await db.execute({
    sql: "SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE owner_id = ?",
    args: [ownerId],
  });

  let sent = 0;
  let removed = 0;
  const failures: PushFailure[] = [];

  await Promise.all(
    result.rows.map(async (row) => {
      const sub = row as unknown as { id: string; endpoint: string; p256dh: string; auth: string };
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), {
          vapidDetails: { subject: vapidSubject(), publicKey: keys.publicKey, privateKey: keys.privateKey },
          TTL: 60 * 60 * 24,
          urgency: "high",
        });
        sent += 1;
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode ?? null;
        const kind = classifyFailure(statusCode);
        failures.push({ service: serviceHost(sub.endpoint), statusCode, kind });
        if (kind === "gone" || kind === "auth") {
          await db.execute({ sql: "DELETE FROM push_subscriptions WHERE id = ?", args: [sub.id] });
          removed += 1;
        }
        // Log sem endpoint/chaves: só serviço, status e a mensagem curta do provedor.
        const body = String((err as { body?: unknown })?.body ?? (err as Error)?.message ?? "").slice(0, 200);
        console.error(`[push] falha ao enviar (${serviceHost(sub.endpoint)}, status ${statusCode ?? "rede"}): ${body}`);
      }
    })
  );

  return { sent, removed, failures };
}

/** Mensagem amigável para o teste de push, a partir das falhas observadas. */
export function describePushFailures(failures: PushFailure[]): string {
  const kinds = new Set(failures.map((f) => f.kind));
  const services = [...new Set(failures.map((f) => f.service))].join(", ");
  if (kinds.has("auth")) {
    return `O serviço de push (${services}) recusou a assinatura: a inscrição deste navegador foi criada com outra chave. Ela foi descartada — toque em "Enviar teste" de novo para recriá-la automaticamente.`;
  }
  if (kinds.has("gone")) {
    return `A inscrição deste navegador expirou no serviço de push (${services}) e foi removida. Toque em "Enviar teste" de novo para criar uma nova.`;
  }
  if (kinds.has("network")) return `Não foi possível conectar ao serviço de push (${services}). Tente novamente em instantes.`;
  if (kinds.has("rate_limited")) return `O serviço de push (${services}) limitou os envios. Aguarde alguns minutos e tente de novo.`;
  if (kinds.has("invalid")) return `O serviço de push (${services}) rejeitou a inscrição como inválida. Desative e ative as notificações neste navegador.`;
  const codes = [...new Set(failures.map((f) => f.statusCode ?? "rede"))].join(", ");
  return `O serviço de push (${services}) não entregou a notificação (status ${codes}). Tente novamente.`;
}
