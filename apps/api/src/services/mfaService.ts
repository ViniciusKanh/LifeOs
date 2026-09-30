import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";
import QRCode from "qrcode";
import type { getDb } from "../db/client.js";
import { decryptSecret, encryptSecret } from "./cryptoService.js";
import { generateRecoveryCodes, generateTotpSecret, normalizeRecoveryCode, otpauthUri, verifyTotp } from "./totpService.js";

type Db = ReturnType<typeof getDb>;

/**
 * MFA por aplicativo autenticador (TOTP). Regras:
 * - o segredo fica criptografado no banco (AES-256-GCM);
 * - o cadastro só vale depois de um código correto (mfa_pending_secret →
 *   mfa_secret), então ninguém ativa MFA com o app mal configurado;
 * - cada código TOTP só pode ser usado uma vez (mfa_last_step);
 * - 8 códigos de recuperação de uso único, guardados só como hash.
 */

const MFA_LOGIN_TTL = "5m";
const hashCode = (code: string) => crypto.createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");

function jwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET não configurado");
  return s;
}

/** Token curto que liga a etapa 1 (senha/Google) à etapa 2 (código) do login. */
export function signMfaLoginToken(userId: string, remember: boolean): string {
  return jwt.sign({ purpose: "mfa_login", sub: userId, rm: remember }, jwtSecret(), { expiresIn: MFA_LOGIN_TTL });
}

export function readMfaLoginToken(token: string): { userId: string; remember: boolean } | null {
  try {
    const p = jwt.verify(token, jwtSecret()) as { purpose?: string; sub?: string; rm?: boolean };
    if (p.purpose !== "mfa_login" || !p.sub) return null;
    return { userId: p.sub, remember: p.rm !== false };
  } catch {
    return null;
  }
}

export async function getMfaStatus(db: Db, userId: string) {
  const row = (await db.execute({ sql: "SELECT mfa_enabled, mfa_enabled_at FROM users WHERE id = ?", args: [userId] })).rows[0] as unknown as
    | { mfa_enabled: number; mfa_enabled_at: string | null }
    | undefined;
  const remaining = await db.execute({ sql: "SELECT COUNT(*) AS c FROM mfa_recovery_codes WHERE user_id = ? AND used_at IS NULL", args: [userId] });
  return {
    enabled: Number(row?.mfa_enabled ?? 0) === 1,
    enabledAt: row?.mfa_enabled_at ?? null,
    recoveryCodesRemaining: Number((remaining.rows[0] as unknown as { c: number }).c ?? 0),
  };
}

/** Etapa 1 do cadastro: gera segredo pendente e o QR code para o app autenticador. */
export async function beginEnrollment(db: Db, userId: string, email: string) {
  const secret = generateTotpSecret();
  await db.execute({ sql: "UPDATE users SET mfa_pending_secret = ? WHERE id = ?", args: [encryptSecret(secret), userId] });
  const uri = otpauthUri(secret, email);
  const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 240, errorCorrectionLevel: "M" });
  // O segredo em texto é devolvido UMA vez (para quem não consegue ler o QR).
  return { secret: secret.replace(/(.{4})/g, "$1 ").trim(), otpauthUri: uri, qrDataUrl };
}

async function replaceRecoveryCodes(db: Db, userId: string): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await db.execute({ sql: "DELETE FROM mfa_recovery_codes WHERE user_id = ?", args: [userId] });
  for (const code of codes) {
    await db.execute({ sql: "INSERT INTO mfa_recovery_codes (id, user_id, code_hash) VALUES (?, ?, ?)", args: [nanoid(), userId, hashCode(code)] });
  }
  return codes;
}

/** Etapa 2: confirma com um código do app. Devolve os códigos de recuperação (mostrados uma única vez). */
export async function confirmEnrollment(db: Db, userId: string, code: string): Promise<string[] | null> {
  const row = (await db.execute({ sql: "SELECT mfa_pending_secret FROM users WHERE id = ?", args: [userId] })).rows[0] as unknown as
    | { mfa_pending_secret: string | null }
    | undefined;
  if (!row?.mfa_pending_secret) return null;
  const secret = decryptSecret(row.mfa_pending_secret);
  const step = verifyTotp(secret, code);
  if (step === null) return null;
  await db.execute({
    sql: `UPDATE users SET mfa_secret = ?, mfa_pending_secret = NULL, mfa_enabled = 1, mfa_enabled_at = datetime('now'),
          mfa_last_step = ?, updated_at = datetime('now') WHERE id = ?`,
    args: [row.mfa_pending_secret, step, userId],
  });
  return replaceRecoveryCodes(db, userId);
}

/** Confere um código TOTP ou de recuperação (este é consumido). */
export async function verifyUserMfa(db: Db, userId: string, code: string): Promise<{ ok: boolean; usedRecovery: boolean }> {
  const row = (await db.execute({ sql: "SELECT mfa_secret, mfa_last_step, mfa_enabled FROM users WHERE id = ?", args: [userId] })).rows[0] as unknown as
    | { mfa_secret: string | null; mfa_last_step: number | null; mfa_enabled: number }
    | undefined;
  if (!row?.mfa_secret || Number(row.mfa_enabled) !== 1) return { ok: false, usedRecovery: false };

  const digits = code.replace(/\s+/g, "");
  if (/^\d{6}$/.test(digits)) {
    const step = verifyTotp(decryptSecret(row.mfa_secret), digits, { lastStep: row.mfa_last_step == null ? null : Number(row.mfa_last_step) });
    if (step === null) return { ok: false, usedRecovery: false };
    await db.execute({ sql: "UPDATE users SET mfa_last_step = ? WHERE id = ?", args: [step, userId] });
    return { ok: true, usedRecovery: false };
  }

  const res = await db.execute({
    sql: "UPDATE mfa_recovery_codes SET used_at = datetime('now') WHERE user_id = ? AND code_hash = ? AND used_at IS NULL",
    args: [userId, hashCode(code)],
  });
  return { ok: res.rowsAffected > 0, usedRecovery: res.rowsAffected > 0 };
}

export async function regenerateRecoveryCodes(db: Db, userId: string) {
  return replaceRecoveryCodes(db, userId);
}

/** Desliga o MFA (pelo próprio usuário ou pelo admin) e apaga segredo e códigos. */
export async function disableMfa(db: Db, userId: string) {
  await db.execute({
    sql: `UPDATE users SET mfa_enabled = 0, mfa_secret = NULL, mfa_pending_secret = NULL, mfa_last_step = NULL,
          mfa_enabled_at = NULL, updated_at = datetime('now') WHERE id = ?`,
    args: [userId],
  });
  await db.execute({ sql: "DELETE FROM mfa_recovery_codes WHERE user_id = ?", args: [userId] });
}
