import { Redis } from "@upstash/redis";
import { getDb } from "../db/client.js";
import { decryptSecret } from "./cryptoService.js";

/**
 * Backend compartilhado (Upstash Redis, via REST — funciona em serverless
 * sem conexão TCP persistente) para o rate limiter. Credenciais ficam em
 * admin_settings (integration = 'redis'), mesmo mecanismo já usado para
 * Gemini/Turso/SMTP/Push. Lido com cache curto (mesmo padrão de
 * pushService) para não bater no banco a cada requisição — o rate limiter
 * roda em TODA chamada à API.
 *
 * Se não houver credenciais configuradas, ou se o Redis falhar/der timeout,
 * o rate limiter precisa continuar funcionando: ver fallback em
 * rateLimit.ts, que nunca deixa uma falha do Redis derrubar a API.
 */

type Db = ReturnType<typeof getDb>;

interface RedisConfig {
  url: string;
  token: string;
}

async function readRedisSetting(db: Db, keyName: string): Promise<string | null> {
  const result = await db.execute({
    sql: "SELECT encrypted_value FROM admin_settings WHERE integration = 'redis' AND key_name = ? AND is_active = 1",
    args: [keyName],
  });
  const row = result.rows[0] as { encrypted_value?: string } | undefined;
  if (!row?.encrypted_value) return null;
  return decryptSecret(row.encrypted_value);
}

const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedConfig: { config: RedisConfig | null; at: number } | null = null;
let cachedClient: Redis | null = null;

async function readRedisConfig(db: Db): Promise<RedisConfig | null> {
  const now = Date.now();
  if (cachedConfig && now - cachedConfig.at < CONFIG_CACHE_TTL_MS) return cachedConfig.config;

  const [url, token] = await Promise.all([readRedisSetting(db, "rest_url"), readRedisSetting(db, "rest_token")]);
  const config = url && token ? { url, token } : null;
  cachedConfig = { config, at: now };
  cachedClient = null; // credenciais podem ter mudado — recria o client na próxima chamada.
  return config;
}

/** Client Upstash (ou null se não configurado). Reaproveitado entre chamadas enquanto o cache de config valer. */
export async function getRedisClient(): Promise<Redis | null> {
  const config = await readRedisConfig(getDb());
  if (!config) return null;
  if (!cachedClient) cachedClient = new Redis({ url: config.url, token: config.token });
  return cachedClient;
}

/** Força recarregar a config no próximo uso — chamado após salvar/remover a credencial em Configurações. */
export function invalidateRedisConfigCache() {
  cachedConfig = null;
  cachedClient = null;
}

/**
 * Contador de janela fixa atômico via EVAL (INCR + PEXPIRE só na criação +
 * PTTL numa única chamada) — evita condição de corrida entre instâncias
 * concorrentes, que é exatamente o problema que motivou sair do Map local.
 */
const INCR_WITH_EXPIRY_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
return {current, ttl}
`;

export async function redisIncrWithExpiry(client: Redis, key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
  const [count, ttlMs] = (await client.eval(INCR_WITH_EXPIRY_SCRIPT, [key], [String(windowMs)])) as [number, number];
  return { count, resetAt: Date.now() + Math.max(ttlMs, 0) };
}

/** POST /api/admin/settings/redis/test — round-trip real (SET/GET/DEL), não só checar se as credenciais existem. */
export async function testRedisConnection(): Promise<{ ok: boolean; message: string }> {
  invalidateRedisConfigCache();
  const config = await readRedisConfig(getDb());
  if (!config) {
    return { ok: false, message: "Configure a REST URL e o REST Token do Upstash antes de testar." };
  }

  try {
    const client = new Redis({ url: config.url, token: config.token });
    const probeKey = "lifeos:ratelimit:test-connection";
    await client.set(probeKey, "ok", { px: 5000 });
    const value = await client.get(probeKey);
    await client.del(probeKey);
    if (value !== "ok") {
      return { ok: false, message: "Conectou, mas a leitura de teste não bateu com o valor gravado." };
    }
    return { ok: true, message: "Conexão com o Redis (Upstash) verificada com sucesso." };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? `Falha ao conectar ao Redis: ${err.message}` : "Falha ao conectar ao Redis.",
    };
  }
}
