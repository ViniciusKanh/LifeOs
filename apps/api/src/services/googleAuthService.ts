import jwt from "jsonwebtoken";
import { getDb } from "../db/client.js";
import { decryptSecret } from "./cryptoService.js";

/**
 * Login/cadastro com Google (OAuth 2.0 "Authorization Code"). Client
 * ID/Secret vêm de admin_settings (integration = 'google_oauth'),
 * configurados pela tela de Configurações — mesmo mecanismo de
 * criptografia usado por Gemini/Turso/SMTP (ver cryptoService.ts).
 * Nada aqui usa uma lib de OAuth: são só duas chamadas HTTP simples
 * (troca do code por token, depois leitura do perfil).
 */

type Db = ReturnType<typeof getDb>;

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
}

async function readSetting(db: Db, keyName: string): Promise<string | null> {
  const result = await db.execute({
    sql: "SELECT encrypted_value FROM admin_settings WHERE integration = 'google_oauth' AND key_name = ? AND is_active = 1",
    args: [keyName],
  });
  const row = result.rows[0] as { encrypted_value?: string } | undefined;
  if (!row?.encrypted_value) return null;
  return decryptSecret(row.encrypted_value);
}

export async function getGoogleOAuthConfig(db: Db): Promise<GoogleOAuthConfig | null> {
  const [clientId, clientSecret] = await Promise.all([readSetting(db, "client_id"), readSetting(db, "client_secret")]);
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export const GOOGLE_OAUTH_CALLBACK_PATH = "/api/auth/google/callback";

/**
 * URL de callback usada tanto pra montar o link de autorização quanto na troca
 * do code — precisa ser IDÊNTICA à cadastrada no Google Cloud Console em
 * "Authorized redirect URIs". Por padrão deriva da própria requisição;
 * GOOGLE_REDIRECT_BASE_URL fixa explicitamente quando o host visto pelo
 * Express não é o domínio público real (ex.: atrás de certos proxies).
 */
export function googleRedirectUri(req: { protocol: string; get(name: string): string | undefined }): string {
  const base = process.env.GOOGLE_REDIRECT_BASE_URL ?? `${req.protocol}://${req.get("host")}`;
  return `${base}${GOOGLE_OAUTH_CALLBACK_PATH}`;
}

/**
 * O "state" do OAuth deixou de depender só do cookie de curta duração
 * (lifeos_google_oauth_state): em algumas redes/navegadores (proxy
 * corporativo, antivírus, extensões) o Set-Cookie da resposta de
 * /google/start pode não sobreviver até o redirect de volta do Google,
 * e o callback falhava com "state_invalido" mesmo em um fluxo legítimo.
 * Agora o próprio state é um JWT assinado e com expiração curta: o
 * callback consegue confirmar que foi este servidor quem o gerou e que
 * ainda está dentro da janela de validade, sem depender só do cookie
 * chegar de volta. O cookie continua sendo setado como camada extra,
 * mas não é mais obrigatório pra aceitar o retorno do Google.
 */
export function signOAuthState(purpose: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET não configurado");
  return jwt.sign({ purpose }, secret, { expiresIn: "10m" });
}

export type OAuthStateCheck = { ok: true } | { ok: false; reason: "chave_ausente" | "state_expirado" | "state_assinatura_invalida" | "state_propósito_invalido" };

/**
 * Versão detalhada de verifyOAuthState: em vez de só true/false, diz QUAL
 * motivo específico fez o state falhar. Existe porque "state_invalido"
 * genérico deixava impossível diferenciar, a partir do relato do usuário,
 * se era JWT_SECRET ausente/trocado, state expirado (usuário demorou mais
 * de 10min na tela de consentimento do Google) ou assinatura realmente
 * inválida (adulteração ou secret diferente do usado por outra instância
 * do servidor rodando em paralelo).
 */
export function verifyOAuthStateDetailed(state: string, purpose: string): OAuthStateCheck {
  const secret = process.env.JWT_SECRET;
  if (!secret) return { ok: false, reason: "chave_ausente" };
  try {
    const payload = jwt.verify(state, secret) as { purpose?: string };
    if (payload.purpose !== purpose) return { ok: false, reason: "state_propósito_invalido" };
    return { ok: true };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) return { ok: false, reason: "state_expirado" };
    return { ok: false, reason: "state_assinatura_invalida" };
  }
}

/** Mantido para compatibilidade — usa a versão detalhada por baixo. */
export function verifyOAuthState(state: string, purpose: string): boolean {
  return verifyOAuthStateDetailed(state, purpose).ok;
}

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export function buildGoogleAuthUrl(config: GoogleOAuthConfig, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
}

/** Troca o "code" que o Google devolveu pelo access_token e depois pelo perfil (id, e-mail, nome, foto). */
export async function exchangeGoogleCode(config: GoogleOAuthConfig, code: string, redirectUri: string): Promise<GoogleProfile> {
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    throw new Error("Não foi possível validar o código do Google (token inválido, expirado ou redirect_uri divergente).");
  }
  const tokenData = (await tokenRes.json()) as { access_token?: string };
  if (!tokenData.access_token) throw new Error("Google não retornou um access_token.");

  const profileRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!profileRes.ok) throw new Error("Não foi possível obter o perfil da conta Google.");
  const profile = (await profileRes.json()) as {
    sub: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  if (!profile.email) throw new Error("A conta Google usada não tem um e-mail associado.");

  return {
    sub: profile.sub,
    email: profile.email,
    emailVerified: profile.email_verified ?? true,
    name: profile.name?.trim() || profile.email.split("@")[0],
    picture: profile.picture ?? null,
  };
}
