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

export async function savePublicKey(db: Client, ownerId: string, provider: PublicApiProvider, key: string) {
  const k = key.trim();
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
  const k = encodeURIComponent(key.trim());
  try {
    if (provider === "youtube") await fetchJson(`https://www.googleapis.com/youtube/v3/videos?part=id&id=jNQXAC9IVRw&key=${k}`, {}, { label: "YouTube", retries: 0 });
    else if (provider === "nasa") await fetchJson(`https://api.nasa.gov/planetary/apod?api_key=${k}&date=2024-01-01`, {}, { label: "NASA", retries: 0 });
    else if (provider === "tmdb") {
      const bearer = key.trim().startsWith("eyJ");
      await fetchJson(`https://api.themoviedb.org/3/configuration${bearer ? "" : `?api_key=${k}`}`, { headers: bearer ? { Authorization: `Bearer ${key.trim()}` } : {} }, { label: "TMDB", retries: 0 });
    } else {
      const body = await fetchJson<string>(`https://api.olhovivo.sptrans.com.br/v2.1/Login/Autenticar?token=${k}`, { method: "POST" }, { label: "SPTrans", retries: 0, responseType: "text" }).catch(async (e: unknown) => {
        // O Olho Vivo historicamente só responde em http.
        if (e instanceof IntegrationError && e.code === "indisponivel") return fetchJson<string>(`http://api.olhovivo.sptrans.com.br/v2.1/Login/Autenticar?token=${k}`, { method: "POST" }, { label: "SPTrans", retries: 0, responseType: "text" });
        throw e;
      });
      if (String(body).trim() !== "true") return "A SPTrans recusou o token.";
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
