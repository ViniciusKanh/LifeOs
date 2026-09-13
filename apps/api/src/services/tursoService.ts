import { createClient } from "@libsql/client";
import { getDb } from "../db/client.js";
import { decryptSecret } from "./cryptoService.js";

/**
 * Teste de credenciais do Turso cadastradas em Configurações. Abre
 * uma conexão À PARTE (não mexe na conexão real da API, que continua
 * vindo de DATABASE_URL/DATABASE_AUTH_TOKEN via variável de ambiente)
 * só para confirmar que a URL e o token salvos aqui são válidos —
 * útil para conferir credenciais antes de colocá-las na Vercel.
 */

type Db = ReturnType<typeof getDb>;

async function readSetting(db: Db, keyName: string): Promise<string | null> {
  const result = await db.execute({
    sql: "SELECT encrypted_value FROM admin_settings WHERE integration = 'turso' AND key_name = ? AND is_active = 1",
    args: [keyName],
  });
  const row = result.rows[0] as { encrypted_value?: string } | undefined;
  if (!row?.encrypted_value) return null;
  return decryptSecret(row.encrypted_value);
}

export async function testTursoConnection(): Promise<{ ok: boolean; message: string }> {
  const db = getDb();
  const [url, authToken] = await Promise.all([readSetting(db, "database_url"), readSetting(db, "auth_token")]);

  if (!url || !authToken) {
    return { ok: false, message: "Configure a Database URL e o Auth Token do Turso antes de testar." };
  }

  let client: ReturnType<typeof createClient> | undefined;
  try {
    client = createClient({ url, authToken });
    await client.execute("SELECT 1");
    return { ok: true, message: "Conexão com o banco Turso verificada com sucesso." };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? `Falha ao conectar ao Turso: ${err.message}` : "Falha ao conectar ao Turso.",
    };
  } finally {
    client?.close();
  }
}
