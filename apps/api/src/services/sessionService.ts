import type { Response } from "express";
import jwt from "jsonwebtoken";
import { getDb } from "../db/client.js";

/**
 * Sessões do LifeOS.
 *
 * - "Permanecer conectado" (remember): cookie e JWT de 30 dias; sem ele,
 *   12 horas. Nos dois casos a sessão é RENOVADA sozinha enquanto o
 *   usuário usa o app (janela deslizante em requireAuth), então quem usa
 *   todo dia não é deslogado.
 * - session_version (sv) no JWT: quando o banco tem um valor maior
 *   (troca/reset de senha, admin removeu o MFA, "sair de todos os
 *   dispositivos"), o token antigo deixa de valer.
 * - O estado do usuário (versão, papel, existência) é lido do banco com
 *   um cache curto em memória por instância — revogação e troca de papel
 *   passam a valer em no máximo AUTH_CACHE_TTL_MS, sem uma consulta
 *   extra por requisição.
 */

export const SESSION_COOKIE = "lifeos_session";
const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;
const SHORT_MS = 12 * 60 * 60 * 1000;
/** Renova o token quando já passou disto desde a emissão. */
const RENEW_AFTER_MS = 6 * 60 * 60 * 1000;
const AUTH_CACHE_TTL_MS = 30 * 1000;

// Em produção com o proxy da Vercel, front e API são same-site: "lax" basta.
const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE as "lax" | "strict" | "none" | undefined) ?? "lax";

export const COOKIE_BASE = {
  httpOnly: true,
  sameSite: COOKIE_SAMESITE,
  secure: process.env.NODE_ENV === "production" || COOKIE_SAMESITE === "none",
  path: "/",
};

export interface SessionClaims {
  sub: string;
  role: "user" | "admin";
  sv: number;
  rm: boolean;
  iat?: number;
}

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET não configurado");
  return s;
}

export function issueSession(res: Response, user: { id: string; role: "user" | "admin"; session_version?: number | null }, remember: boolean) {
  const claims: SessionClaims = { sub: user.id, role: user.role, sv: Number(user.session_version ?? 0), rm: remember };
  const ttl = remember ? REMEMBER_MS : SHORT_MS;
  const token = jwt.sign(claims, secret(), { expiresIn: Math.floor(ttl / 1000) });
  res.cookie(SESSION_COOKIE, token, { ...COOKIE_BASE, maxAge: ttl });
}

export function clearSession(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function readSession(token: string): SessionClaims {
  const payload = jwt.verify(token, secret()) as SessionClaims;
  return { ...payload, sv: Number(payload.sv ?? 0), rm: payload.rm !== false };
}

export function shouldRenew(claims: SessionClaims): boolean {
  return !!claims.iat && Date.now() - claims.iat * 1000 > RENEW_AFTER_MS;
}

/* -------- cache do estado de autenticação do usuário -------- */

interface AuthState {
  exists: boolean;
  role: "user" | "admin";
  sessionVersion: number;
  at: number;
}

const cache = new Map<string, AuthState>();

export async function getAuthState(userId: string): Promise<AuthState> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < AUTH_CACHE_TTL_MS) return hit;
  const res = await getDb().execute({ sql: "SELECT role, session_version FROM users WHERE id = ?", args: [userId] });
  const row = res.rows[0] as unknown as { role: "user" | "admin"; session_version: number } | undefined;
  const state: AuthState = row
    ? { exists: true, role: row.role, sessionVersion: Number(row.session_version ?? 0), at: Date.now() }
    : { exists: false, role: "user", sessionVersion: 0, at: Date.now() };
  cache.set(userId, state);
  return state;
}

/** Chamar sempre que papel, versão de sessão ou existência do usuário mudar. */
export function invalidateAuthState(userId: string) {
  cache.delete(userId);
}

/** Invalida todas as sessões do usuário (em todos os dispositivos). */
export async function revokeAllSessions(userId: string) {
  await getDb().execute({ sql: "UPDATE users SET session_version = session_version + 1, updated_at = datetime('now') WHERE id = ?", args: [userId] });
  invalidateAuthState(userId);
}

/** Registra atividade no máximo 1x por renovação — sem escrita a cada requisição. */
export async function touchLastSeen(userId: string) {
  await getDb().execute({ sql: "UPDATE users SET last_seen_at = datetime('now') WHERE id = ?", args: [userId] });
}
