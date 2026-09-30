import crypto from "node:crypto";

/**
 * TOTP (RFC 6238) sobre HOTP (RFC 4226) — implementação própria com
 * node:crypto, compatível com Google Authenticator, Microsoft
 * Authenticator, Authy, 1Password etc. (SHA-1, 6 dígitos, 30 s).
 * Sem dependência externa: é pouco código e fácil de auditar.
 */

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_PERIOD = 30;
export const TOTP_DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) throw new Error("Segredo base32 inválido.");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Segredo novo de 160 bits (recomendação da RFC 4226), em base32. */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export function hotp(secretBase32: string, counter: number): string {
  const key = base32Decode(secretBase32);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** TOTP_DIGITS).toString();
  return code.padStart(TOTP_DIGITS, "0");
}

export function currentStep(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD);
}

/**
 * Confere o código aceitando ±1 passo (tolerância de relógio do celular).
 * Devolve o passo que bateu (para gravar em mfa_last_step e bloquear
 * reutilização) ou null. Comparação em tempo constante.
 */
export function verifyTotp(secretBase32: string, code: string, opts: { nowMs?: number; lastStep?: number | null; window?: number } = {}): number | null {
  const clean = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const now = currentStep(opts.nowMs);
  const window = opts.window ?? 1;
  for (let delta = -window; delta <= window; delta++) {
    const step = now + delta;
    if (opts.lastStep != null && step <= opts.lastStep) continue;
    const expected = Buffer.from(hotp(secretBase32, step));
    const given = Buffer.from(clean);
    if (expected.length === given.length && crypto.timingSafeEqual(expected, given)) return step;
  }
  return null;
}

/** URI padrão lida pelos apps autenticadores (vira o QR code). */
export function otpauthUri(secretBase32: string, accountEmail: string, issuer = "LifeOS"): string {
  const label = encodeURIComponent(`${issuer}:${accountEmail}`);
  const params = new URLSearchParams({ secret: secretBase32, issuer, algorithm: "SHA1", digits: String(TOTP_DIGITS), period: String(TOTP_PERIOD) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Códigos de recuperação legíveis: XXXX-XXXX (sem caracteres ambíguos). */
export function generateRecoveryCodes(count = 8): string[] {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: count }, () => {
    const bytes = crypto.randomBytes(8);
    const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
    return `${chars.slice(0, 4)}-${chars.slice(4, 8)}`;
  });
}

export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^(.{4})(.{4})$/, "$1-$2");
}
