import type { Client } from "@libsql/client";
import { decryptSecret } from "./cryptoService.js";
import { readOAuthState, signOAuthState } from "./googleAuthService.js";

/**
 * Infra comum das integrações externas (Strava, Spotify, Steam, Nominatim).
 * - Credenciais de app: admin_settings (criptografadas, tela de Configurações)
 *   com fallback para variáveis de ambiente. Nunca vão para o frontend.
 * - fetchJson: timeout, retry com backoff em 429/5xx e erro tipado sem vazar token.
 * - state do OAuth: JWT assinado e curto (mesmo mecanismo do login com Google).
 */

export type IntegrationKey = "strava" | "spotify" | "steam";

export class IntegrationError extends Error {
  constructor(public status: number, message: string, public code = "erro_integracao") {
    super(message);
  }
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
let fetchImpl: FetchLike = (url, init) => fetch(url, init);

/** Só para testes: substitui o fetch de todas as integrações. */
export function setIntegrationFetchForTests(fn: FetchLike | null) {
  fetchImpl = fn ?? ((url, init) => fetch(url, init));
}

export async function getIntegrationSecret(db: Client, integration: IntegrationKey, keyName: string, envName: string): Promise<string | null> {
  try {
    const r = await db.execute({
      sql: "SELECT encrypted_value FROM admin_settings WHERE integration = ? AND key_name = ? AND is_active = 1",
      args: [integration, keyName],
    });
    const enc = r.rows[0]?.encrypted_value;
    if (enc) return decryptSecret(String(enc));
  } catch {
    // Sem chave de criptografia ou tabela indisponível: tenta o ambiente.
  }
  const env = process.env[envName]?.trim();
  return env ? env : null;
}

export interface FetchJsonOptions {
  timeoutMs?: number;
  retries?: number;
  /** Rótulo usado nas mensagens de erro (ex.: "Strava"). */
  label: string;
  /** Mensagem específica para 403 (ex.: conta fora da lista de usuários do app). */
  forbiddenMessage?: string;
}

async function apiErrorDetail(res: Response): Promise<string> {
  try {
    const text = (await res.text()).slice(0, 500);
    const j = JSON.parse(text) as { error?: string | { message?: string }; message?: string; error_description?: string };
    const msg = typeof j.error === "object" ? j.error?.message : j.error_description ?? j.message ?? j.error;
    return msg ? ` (${String(msg).slice(0, 160)})` : "";
  } catch {
    return "";
  }
}

export async function fetchJson<T>(url: string, init: RequestInit, opts: FetchJsonOptions): Promise<T> {
  const retries = opts.retries ?? 2;
  let lastErr: IntegrationError | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 10_000);
    try {
      const res = await fetchImpl(url, { ...init, signal: ctrl.signal });
      if (res.ok) {
        if (res.status === 204) return null as T;
        const text = await res.text();
        return (text ? JSON.parse(text) : null) as T;
      }
      // Motivo devolvido pela própria API (sem tokens), para a mensagem não ficar genérica.
      const detail = await apiErrorDetail(res);
      if (res.status === 401) throw new IntegrationError(401, `${opts.label}: autorização expirada ou revogada.${detail}`, "nao_autorizado");
      if (res.status === 403) throw new IntegrationError(403, opts.forbiddenMessage ?? `${opts.label}: acesso negado.${detail}`, "acesso_negado");
      if (res.status === 404) throw new IntegrationError(404, `${opts.label}: recurso não encontrado.`, "nao_encontrado");
      // 4xx que não seja limite: erro definitivo (ex.: Steam "app sem estatísticas"). Não repete.
      if (res.status !== 429 && res.status < 500) throw new IntegrationError(400, `${opts.label} recusou a requisição (${res.status}).${detail}`, "requisicao_invalida");
      lastErr =
        res.status === 429
          ? new IntegrationError(429, `${opts.label}: limite de requisições atingido. Tente mais tarde.`, "limite")
          : new IntegrationError(502, `${opts.label} respondeu com erro ${res.status}.${detail}`, "indisponivel");
    } catch (err) {
      if (err instanceof IntegrationError && err.code !== "indisponivel" && err.code !== "limite") throw err;
      lastErr = err instanceof IntegrationError ? err : new IntegrationError(503, `${opts.label} indisponível no momento.`, "indisponivel");
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
  }
  throw lastErr ?? new IntegrationError(503, `${opts.label} indisponível no momento.`, "indisponivel");
}

/** Base pública da API para montar redirect_uri (precisa bater com o cadastro no portal). */
export function integrationRedirectBase(req: { protocol: string; get(name: string): string | undefined }): string {
  const fixed = (process.env.INTEGRATIONS_REDIRECT_BASE_URL ?? process.env.GOOGLE_REDIRECT_BASE_URL)?.trim().replace(/\/+$/, "");
  if (fixed) return fixed;
  const host = (req.get("x-forwarded-host") ?? req.get("host") ?? "").split(",")[0]!.trim();
  const proto = (req.get("x-forwarded-proto") ?? req.protocol ?? "https").split(",")[0]!.trim();
  return `${proto}://${host}`;
}

export function signIntegrationState(integration: IntegrationKey, userId: string): string {
  return signOAuthState(`integracao:${integration}`, { uid: userId });
}

/** Devolve o usuário dono do state ou null (expirado, assinatura ruim, outro propósito). */
export function readIntegrationState(integration: IntegrationKey, state: string): string | null {
  const r = readOAuthState(state);
  if (!r.ok || r.purpose !== `integracao:${integration}` || !r.uid) return null;
  return r.uid;
}

export function parseSettings<T extends object>(raw: unknown, defaults: T): T {
  try {
    const obj = raw ? JSON.parse(String(raw)) : {};
    return { ...defaults, ...(obj && typeof obj === "object" ? obj : {}) };
  } catch {
    return { ...defaults };
  }
}
