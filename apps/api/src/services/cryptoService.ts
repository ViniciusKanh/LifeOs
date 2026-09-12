import crypto from "node:crypto";

/**
 * Criptografia simétrica (AES-256-GCM) para credenciais sensíveis
 * armazenadas em admin_settings (Gemini API Key, Turso Auth Token,
 * senha SMTP). O valor bruto NUNCA é devolvido para o frontend —
 * apenas maskPreview() é exposto na UI.
 *
 * CREDENTIALS_ENCRYPTION_KEY deve ter 32 bytes em hex (64 caracteres).
 */
function getKey(): Buffer {
  const hex = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!hex || hex.length < 64) {
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY ausente ou inválida. Gere 32 bytes com `openssl rand -hex 32`."
    );
  }
  return Buffer.from(hex.slice(0, 64), "hex");
}

export function encryptSecret(plain: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // formato: iv:authTag:cipherText, tudo em base64
  return [iv, authTag, encrypted].map((b) => b.toString("base64")).join(":");
}

export function decryptSecret(payload: string): string {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = payload.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

/** Gera algo como "••••••••••••AB23" para exibir na UI sem revelar o segredo. */
export function maskPreview(plain: string): string {
  const last = plain.slice(-4);
  return `${"•".repeat(12)}${last}`;
}
