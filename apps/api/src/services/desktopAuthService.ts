import crypto from "node:crypto";
import { nanoid } from "nanoid";
import type { getDb } from "../db/client.js";

type Db = ReturnType<typeof getDb>;

/** Validade do código entregue ao app pelo deep link (o usuário só precisa voltar ao app). */
export const DESKTOP_CODE_TTL_MS = 3 * 60 * 1000;

/** Desafio PKCE (S256): base64url de SHA-256 = 43 caracteres. */
export const DESKTOP_CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest();

export function challengeFromVerifier(verifier: string): string {
  return sha256(verifier).toString("base64url");
}

/**
 * Cria o código de uso único do login Desktop. Devolve o código em claro
 * (vai só para o deep link); no banco fica apenas o hash.
 */
export async function createDesktopHandoff(db: Db, userId: string, challenge: string): Promise<string> {
  const code = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + DESKTOP_CODE_TTL_MS).toISOString();
  // Limpeza oportunista: códigos vencidos não servem para nada.
  await db.execute({ sql: "DELETE FROM desktop_auth_codes WHERE expires_at < ?", args: [new Date().toISOString()] });
  await db.execute({
    sql: "INSERT INTO desktop_auth_codes (id, code_hash, user_id, challenge, expires_at) VALUES (?, ?, ?, ?, ?)",
    args: [nanoid(), sha256(code).toString("hex"), userId, challenge, expiresAt],
  });
  return code;
}

/**
 * Troca código + verificador pelo id do usuário. O código é consumido de forma
 * atômica (UPDATE ... RETURNING) — uma segunda tentativa, ou um código
 * interceptado sem o verificador do app, nunca gera sessão.
 */
export async function consumeDesktopHandoff(db: Db, code: string, verifier: string): Promise<string | null> {
  const result = await db.execute({
    sql: `UPDATE desktop_auth_codes SET used_at = datetime('now')
          WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?
          RETURNING user_id, challenge`,
    args: [sha256(code).toString("hex"), new Date().toISOString()],
  });
  const row = result.rows[0] as unknown as { user_id: string; challenge: string } | undefined;
  if (!row) return null;
  const expected = Buffer.from(String(row.challenge));
  const received = Buffer.from(challengeFromVerifier(verifier));
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;
  return String(row.user_id);
}
