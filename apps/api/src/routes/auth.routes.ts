import { Router } from "express";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import {
  hashPassword,
  verifyPassword,
  signSessionToken,
  generatePasswordResetToken,
  hashToken,
} from "../services/authService.js";
import { registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from "../validators/auth.schema.js";
import { requireAuth, SESSION_COOKIE_NAME } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import type { User } from "../types/index.js";

export const authRouter = Router();

const COOKIE_BASE = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

/** POST /api/auth/register */
authRouter.post("/register", rateLimit(), async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const { name, email, password } = parsed.data;
  const db = getDb();

  const existing = await db.execute({
    sql: "SELECT id FROM users WHERE email = ?",
    args: [email],
  });
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: "Já existe uma conta com este e-mail." });
  }

  const id = nanoid();
  const passwordHash = await hashPassword(password);

  // O e-mail definido em ADMIN_EMAIL é sempre promovido a admin,
  // via propriedade real no banco — nunca por checagem no frontend.
  const adminEmail = (process.env.ADMIN_EMAIL ?? "").toLowerCase();
  const role = email === adminEmail ? "admin" : "user";

  await db.execute({
    sql: `INSERT INTO users (id, name, email, password_hash, role)
          VALUES (?, ?, ?, ?, ?)`,
    args: [id, name, email, passwordHash, role],
  });

  await db.execute({
    sql: `INSERT INTO user_settings (user_id) VALUES (?)`,
    args: [id],
  });

  const token = signSessionToken({ sub: id, role });
  res.cookie(SESSION_COOKIE_NAME, token, { ...COOKIE_BASE, maxAge: 7 * 24 * 60 * 60 * 1000 });

  return res.status(201).json({ id, name, email, role });
});

/** POST /api/auth/login */
authRouter.post("/login", rateLimit(), async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const { email, password, rememberMe } = parsed.data;
  const db = getDb();

  const result = await db.execute({
    sql: "SELECT * FROM users WHERE email = ?",
    args: [email],
  });
  const user = result.rows[0] as unknown as User | undefined;

  // Mensagem genérica de propósito: não revelar se foi o e-mail
  // ou a senha que estava incorreta.
  if (!user) {
    return res.status(401).json({ error: "E-mail ou senha inválidos." });
  }

  const valid = await verifyPassword(password, (user as any).password_hash);
  if (!valid) {
    return res.status(401).json({ error: "E-mail ou senha inválidos." });
  }

  const token = signSessionToken({ sub: user.id, role: user.role });
  const maxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  res.cookie(SESSION_COOKIE_NAME, token, { ...COOKIE_BASE, maxAge });

  return res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

/** POST /api/auth/logout */
authRouter.post("/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
  return res.status(204).send();
});

/** GET /api/auth/me */
authRouter.get("/me", requireAuth, async (req, res) => {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT id, name, email, role, avatar_url, language, timezone, theme, onboarding_done, created_at
          FROM users WHERE id = ?`,
    args: [req.user!.id],
  });
  const user = result.rows[0];
  if (!user) return res.status(404).json({ error: "Usuário não encontrado." });
  return res.json(user);
});

/** POST /api/auth/forgot-password */
authRouter.post("/forgot-password", rateLimit({ max: 5 }), async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "E-mail inválido." });
  }
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT id FROM users WHERE email = ?",
    args: [parsed.data.email],
  });
  const user = result.rows[0] as unknown as { id: string } | undefined;

  // Resposta idêntica exista ou não o e-mail, para não vazar
  // quais e-mails têm conta no LifeOS.
  const genericResponse = {
    message: "Se este e-mail estiver cadastrado, você receberá instruções em instantes.",
  };
  if (!user) return res.json(genericResponse);

  const { raw, hash } = generatePasswordResetToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1h de validade

  await db.execute({
    sql: `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
          VALUES (?, ?, ?, ?)`,
    args: [nanoid(), user.id, hash, expiresAt],
  });

  // TODO(fase 6): disparar e-mail real via services/emailService.ts
  // usando as configurações SMTP cadastradas no painel admin.
  // Por enquanto, o token é logado no servidor em desenvolvimento
  // para permitir testar o fluxo ponta a ponta.
  if (process.env.NODE_ENV !== "production") {
    console.log(`[dev] token de reset de senha para ${parsed.data.email}: ${raw}`);
  }

  return res.json(genericResponse);
});

/** POST /api/auth/reset-password */
authRouter.post("/reset-password", rateLimit({ max: 10 }), async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const tokenHash = hashToken(parsed.data.token);

  const result = await db.execute({
    sql: `SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ?`,
    args: [tokenHash],
  });
  const record = result.rows[0] as unknown as
    | { id: string; user_id: string; expires_at: string; used_at: string | null }
    | undefined;

  if (!record || record.used_at || new Date(record.expires_at) < new Date()) {
    return res.status(400).json({ error: "Link de recuperação inválido ou expirado." });
  }

  const newHash = await hashPassword(parsed.data.newPassword);
  await db.execute({
    sql: "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?",
    args: [newHash, record.user_id],
  });
  await db.execute({
    sql: "UPDATE password_reset_tokens SET used_at = datetime('now') WHERE id = ?",
    args: [record.id],
  });

  return res.json({ message: "Senha atualizada. Você já pode entrar com a nova senha." });
});
