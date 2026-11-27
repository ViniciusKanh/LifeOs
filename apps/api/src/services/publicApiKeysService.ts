import type { Client } from "@libsql/client";
import { decryptSecret, encryptSecret } from "./cryptoService.js";

/**
 * Chaves das APIs públicas gratuitas (YouTube, NASA, TMDB, SPTrans).
 * Ordem de uso: chave pessoal do usuário (criptografada) → variável de ambiente
 * do servidor. A chave nunca volta ao frontend: só a origem e um final mascarado.
 */

export type PublicApiProvider = "youtube" | "nasa" | "tmdb" | "sptrans";

export const PUBLIC_API_ENV: Record<PublicApiProvider, string> = {
  youtube: "YOUTUBE_API_KEY",
  nasa: "NASA_API_KEY",
  tmdb: "TMDB_API_KEY",
  sptrans: "SPTRANS_TOKEN",
};

export interface KeyStatus {
  source: "pessoal" | "servidor" | null;
  masked: string | null;
}

const mask = (k: string) => (k.length <= 4 ? "••••" : `••••${k.slice(-4)}`);

export async function resolvePublicKey(db: Client, ownerId: string, provider: PublicApiProvider): Promise<{ key: string | null; status: KeyStatus }> {
  const r = await db.execute({ sql: "SELECT key_enc, masked FROM public_api_keys WHERE owner_id = ? AND provider = ?", args: [ownerId, provider] });
  const row = r.rows[0];
  if (row) {
    try {
      return { key: decryptSecret(String(row.key_enc)), status: { source: "pessoal", masked: row.masked == null ? null : String(row.masked) } };
    } catch {
      // Chave de criptografia trocada: cai para a do servidor, se houver.
    }
  }
  const env = process.env[PUBLIC_API_ENV[provider]]?.trim();
  return env ? { key: env, status: { source: "servidor", masked: null } } : { key: null, status: { source: null, masked: null } };
}

/** Tira espaços e aspas que vêm junto ao copiar (o portal da SPTrans mostra o token entre aspas). */
export const cleanPublicKey = (key: string) => key.trim().replace(/^["'`]+|["'`]+$/g, "").trim();

export async function savePublicKey(db: Client, ownerId: string, provider: PublicApiProvider, key: string) {
  const k = cleanPublicKey(key);
  await db.execute({
    sql: `INSERT INTO public_api_keys (owner_id, provider, key_enc, masked) VALUES (?, ?, ?, ?)
          ON CONFLICT (owner_id, provider) DO UPDATE SET key_enc = excluded.key_enc, masked = excluded.masked, updated_at = datetime('now')`,
    args: [ownerId, provider, encryptSecret(k), mask(k)],
  });
}

export async function deletePublicKey(db: Client, ownerId: string, provider: PublicApiProvider) {
  await db.execute({ sql: "DELETE FROM public_api_keys WHERE owner_id = ? AND provider = ?", args: [ownerId, provider] });
}

/**
 * Teste rápido da chave antes de salvar (chamada barata em cada API). Devolve
 * uma mensagem amigável quando a API recusa; nunca inclui a chave no erro.
 */
export async function validatePublicKey(provider: PublicApiProvider, key: string): Promise<string | null> {
  const { fetchJson, IntegrationError } = await import("./integrationsCore.js");
  const k = encodeURIComponent(cleanPublicKey(key));
  try {
    if (provider === "youtube") await fetchJson(`https://www.googleapis.com/youtube/v3/videos?part=id&id=jNQXAC9IVRw&key=${k}`, {}, { label: "YouTube", retries: 0 });
    else if (provider === "nasa") await fetchJson(`https://api.nasa.gov/planetary/apod?api_key=${k}&date=2024-01-01`, {}, { label: "NASA", retries: 0 });
    else if (provider === "tmdb") {
      const bearer = cleanPublicKey(key).startsWith("eyJ");
      await fetchJson(`https://api.themoviedb.org/3/configuration${bearer ? "" : `?api_key=${k}`}`, { headers: bearer ? { Authorization: `Bearer ${cleanPublicKey(key)}` } : {} }, { label: "TMDB", retries: 0 });
    } else {
      // Mesmo login usado nas consultas (https e http, resposta tolerante).
      const { sptransLogin, TransitError } = await import("./transitService.js");
      try {
        await sptransLogin(cleanPublicKey(key), true);
      } catch (e) {
        if (e instanceof TransitError) return e.message;
        throw e;
      }
    }
    return null;
  } catch (e) {
    if (e instanceof IntegrationError) {
      if ([400, 401, 403].includes(e.status)) return "A API recusou essa chave. Confira se copiou a chave completa.";
      if (e.status === 429) return null; // Limite atingido: a chave existe; salva assim mesmo.
      return "Não foi possível testar a chave agora (a API não respondeu). Tente de novo em instantes.";
    }
    throw e;
  }
}
