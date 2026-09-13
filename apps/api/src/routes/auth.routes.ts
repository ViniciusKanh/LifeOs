import { Router } from "express";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import {
  hashPassword,
  verifyPassword,
  signSessionToken,
  generatePasswordResetToken,
  generateVerificationToken,
  hashToken,
} from "../services/authService.js";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  updateProfileSchema,
  changePasswordSchema,
} from "../validators/auth.schema.js";
import { requireAuth, SESSION_COOKIE_NAME } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import {
  sendMail,
  passwordResetEmail,
  welcomeEmail,
  passwordChangedEmail,
  verificationEmail,
} from "../services/emailService.js";
import type { User } from "../types/index.js";

const APP_URL = process.env.APP_URL ?? "http://localhost:5173";

export const authRouter = Router();

// Em produção com o proxy documentado em DEPLOY.md (front reescrevendo
// /api/* para o backend), front e back são same-site e "lax" funciona
// normalmente. Só quem optar por publicar os dois em domínios
// realmente separados, sem proxy, precisa de COOKIE_SAMESITE=none
// (exige HTTPS nos dois lados — sempre o caso na Vercel).
const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE as "lax" | "strict" | "none" | undefined) ?? "lax";

const COOKIE_BASE = {
  httpOnly: true,
  sameSite: COOKIE_SAMESITE,
  secure: process.env.NODE_ENV === "production" || COOKIE_SAMESITE === "none",
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

  // Todo cadastro feito pelo próprio usuário nasce não-verificado —
  // só contas criadas por um admin (POST /admin/users) já nascem
  // verificadas (email_verified tem DEFAULT 1 na tabela). Sem sessão
  // criada aqui: só depois de clicar no link de confirmação.
  await db.execute({
    sql: `INSERT INTO users (id, name, email, password_hash, role, email_verified)
          VALUES (?, ?, ?, ?, ?, 0)`,
    args: [id, name, email, passwordHash, role],
  });

  await db.execute({
    sql: `INSERT INTO user_settings (user_id) VALUES (?)`,
    args: [id],
  });

  const { raw, hash } = generateVerificationToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h de validade

  await db.execute({
    sql: `INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at)
          VALUES (?, ?, ?, ?)`,
    args: [nanoid(), id, hash, expiresAt],
  });

  const verifyUrl = `${APP_URL}/verificar-email?token=${raw}`;
  const verification = verificationEmail(verifyUrl);
  const sent = await sendMail({ to: email, ...verification }).catch((err) => {
    console.error("[email] falha ao enviar verificação de e-mail:", err);
    return false;
  });

  // Sem SMTP configurado (ou falha no envio), o token ainda é devolvido
  // na resposta, só fora de produção — para permitir testar o fluxo
  // ponta a ponta sem e-mail real, igual ao forgot-password.
  if (!sent && process.env.NODE_ENV !== "production") {
    console.log(`[dev] SMTP não configurado — token de verificação de e-mail para ${email}: ${raw}`);
    return res.status(201).json({
      message: "Cadastro realizado! Verifique seu e-mail para ativar sua conta.",
      email,
      devToken: raw,
    });
  }

  return res.status(201).json({
    message: "Cadastro realizado! Verifique seu e-mail para ativar sua conta.",
    email,
  });
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

  if (Number((user as any).email_verified) === 0) {
    return res.status(403).json({
      error: "Confirme seu e-mail para entrar. Verifique sua caixa de entrada ou reenvie o link de confirmação.",
      code: "EMAIL_NOT_VERIFIED",
    });
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
  // Um JWT assinado pode continuar "válido" mesmo depois que o usuário
  // some do banco (ex: troca de banco de dados em desenvolvimento, ou
  // conta apagada). Nesse caso a sessão deve ser tratada como inválida
  // (401 + cookie limpo), nunca um 404 solto — é assim que o frontend
  // (useAuth) já sabe tratar "deslogado" sem quebrar a tela.
  if (!user) {
    res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    return res.status(401).json({ error: "Sessão inválida. Faça login novamente." });
  }
  return res.json(user);
});

/** PATCH /api/auth/me — o próprio usuário edita seu perfil (nunca outro id) */
authRouter.patch("/me", requireAuth, async (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const data = parsed.data;
  const db = getDb();

  const fieldMap: Record<string, string> = {
    name: "name",
    avatarUrl: "avatar_url",
    theme: "theme",
    language: "language",
    timezone: "timezone",
    onboardingDone: "onboarding_done",
  };
  const sets: string[] = [];
  const args: Array<string | number | null> = [];
  for (const [key, column] of Object.entries(fieldMap)) {
    if (key in data) {
      const value = (data as Record<string, string | boolean | null | undefined>)[key];
      sets.push(`${column} = ?`);
      args.push(typeof value === "boolean" ? (value ? 1 : 0) : (value ?? null));
    }
  }
  if (sets.length === 0) {
    return res.status(400).json({ error: "Nenhum campo para atualizar." });
  }
  sets.push("updated_at = datetime('now')");
  args.push(req.user!.id);

  await db.execute({ sql: `UPDATE users SET ${sets.join(", ")} WHERE id = ?`, args });

  const updated = await db.execute({
    sql: `SELECT id, name, email, role, avatar_url, language, timezone, theme, onboarding_done, created_at
          FROM users WHERE id = ?`,
    args: [req.user!.id],
  });
  return res.json(updated.rows[0]);
});

/** POST /api/auth/change-password — sempre exige a senha atual, mesmo sendo admin */
authRouter.post("/change-password", requireAuth, rateLimit({ max: 5 }), async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT password_hash FROM users WHERE id = ?",
    args: [req.user!.id],
  });
  const row = result.rows[0] as unknown as { password_hash: string } | undefined;
  if (!row) {
    return res.status(401).json({ error: "Sessão inválida. Faça login novamente." });
  }

  const valid = await verifyPassword(parsed.data.currentPassword, row.password_hash);
  if (!valid) {
    return res.status(401).json({ error: "Senha atual incorreta." });
  }

  const newHash = await hashPassword(parsed.data.newPassword);
  await db.execute({
    sql: "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?",
    args: [newHash, req.user!.id],
  });

  const userRow = await db.execute({ sql: "SELECT email FROM users WHERE id = ?", args: [req.user!.id] });
  const userEmail = (userRow.rows[0] as { email?: string } | undefined)?.email;
  if (userEmail) {
    const notice = passwordChangedEmail();
    sendMail({ to: userEmail, ...notice }).catch((err) => console.error("[email] falha ao enviar aviso de troca de senha:", err));
  }

  return res.json({ message: "Senha atualizada com sucesso." });
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

  const resetUrl = `${APP_URL}/redefinir-senha?token=${raw}`;
  const email = passwordResetEmail(resetUrl);
  const sent = await sendMail({ to: parsed.data.email, ...email }).catch((err) => {
    console.error("[email] falha ao enviar reset de senha:", err);
    return false;
  });

  // Sem SMTP configurado (ou falha no envio), o token ainda é logado
  // em desenvolvimento — e devolvido na própria resposta, só fora de
  // produção — para permitir testar o fluxo ponta a ponta sem e-mail real.
  if (!sent && process.env.NODE_ENV !== "production") {
    console.log(`[dev] SMTP não configurado — token de reset de senha para ${parsed.data.email}: ${raw}`);
    return res.json({ ...genericResponse, devToken: raw });
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

/** POST /api/auth/verify-email — confirma o cadastro e já loga o usuário */
authRouter.post("/verify-email", rateLimit({ max: 10 }), async (req, res) => {
  const parsed = verifyEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Link de confirmação inválido." });
  }
  const db = getDb();
  const tokenHash = hashToken(parsed.data.token);

  const result = await db.execute({
    sql: `SELECT id, user_id, expires_at, used_at FROM email_verification_tokens WHERE token_hash = ?`,
    args: [tokenHash],
  });
  const record = result.rows[0] as unknown as
    | { id: string; user_id: string; expires_at: string; used_at: string | null }
    | undefined;

  if (!record || record.used_at || new Date(record.expires_at) < new Date()) {
    return res.status(400).json({ error: "Link de confirmação inválido ou expirado. Peça um novo link." });
  }

  await db.execute({
    sql: "UPDATE users SET email_verified = 1, updated_at = datetime('now') WHERE id = ?",
    args: [record.user_id],
  });
  await db.execute({
    sql: "UPDATE email_verification_tokens SET used_at = datetime('now') WHERE id = ?",
    args: [record.id],
  });

  const userRow = await db.execute({
    sql: "SELECT id, name, email, role FROM users WHERE id = ?",
    args: [record.user_id],
  });
  const user = userRow.rows[0] as unknown as { id: string; name: string; email: string; role: "user" | "admin" } | undefined;
  if (!user) {
    return res.status(404).json({ error: "Usuário não encontrado." });
  }

  const token = signSessionToken({ sub: user.id, role: user.role });
  res.cookie(SESSION_COOKIE_NAME, token, { ...COOKIE_BASE, maxAge: 7 * 24 * 60 * 60 * 1000 });

  // E-mail de boas-vindas só depois da confirmação — melhor esforço,
  // não bloqueia a resposta.
  const welcome = welcomeEmail(user.name);
  sendMail({ to: user.email, ...welcome }).catch((err) => console.error("[email] falha ao enviar boas-vindas:", err));

  return res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

/** POST /api/auth/resend-verification */
authRouter.post("/resend-verification", rateLimit({ max: 5 }), async (req, res) => {
  const parsed = resendVerificationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "E-mail inválido." });
  }
  const db = getDb();

  // Resposta idêntica em todos os casos, para não vazar quais e-mails
  // têm conta no LifeOS nem se já estão verificados.
  const genericResponse = {
    message: "Se este e-mail tiver um cadastro pendente de confirmação, reenviamos o link agora.",
  };

  const result = await db.execute({
    sql: "SELECT id, name, email_verified FROM users WHERE email = ?",
    args: [parsed.data.email],
  });
  const user = result.rows[0] as unknown as { id: string; name: string; email_verified: number } | undefined;
  if (!user || Number(user.email_verified) === 1) {
    return res.json(genericResponse);
  }

  const { raw, hash } = generateVerificationToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await db.execute({
    sql: `INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at)
          VALUES (?, ?, ?, ?)`,
    args: [nanoid(), user.id, hash, expiresAt],
  });

  const verifyUrl = `${APP_URL}/verificar-email?token=${raw}`;
  const verification = verificationEmail(verifyUrl);
  const sent = await sendMail({ to: parsed.data.email, ...verification }).catch((err) => {
    console.error("[email] falha ao reenviar verificação de e-mail:", err);
    return false;
  });

  if (!sent && process.env.NODE_ENV !== "production") {
    console.log(`[dev] SMTP não configurado — token de verificação (reenvio) para ${parsed.data.email}: ${raw}`);
    return res.json({ ...genericResponse, devToken: raw });
  }

  return res.json(genericResponse);
});
