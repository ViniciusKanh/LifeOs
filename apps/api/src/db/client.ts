import { createClient, type Client } from "@libsql/client";
import "dotenv/config";

/**
 * Cliente único do libSQL, compartilhado por toda a API.
 *
 * Em desenvolvimento local, DATABASE_URL pode ser "file:./data/lifeos.db"
 * (sem precisar de conta Turso). Em produção, aponte para
 * "libsql://<seu-banco>.turso.io" com DATABASE_AUTH_TOKEN preenchido.
 */
let client: Client | null = null;

export function getDb(): Client {
  if (client) return client;

  const url = process.env.DATABASE_URL ?? "file:./data/lifeos.db";
  const authToken = process.env.DATABASE_AUTH_TOKEN || undefined;

  client = createClient({ url, authToken });
  return client;
}
