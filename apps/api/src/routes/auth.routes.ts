import { Router } from "express";
import { isTitleUnlocked } from "../services/codexService.js";
import { isEmblemUnlocked, isFrameUnlocked } from "../services/inventoryService.js";
import { CLASSES } from "../config/codex.js";
import { nanoid } from "nanoid";
import crypto from "node:crypto";
import { getDb } from "../db/client.js";
import {
  getGoogleOAuthConfig,
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  googleRedirectUri,
  readOAuthState,
  resolveAppUrl,
  signOAuthState,
  verifyOAuthStateDetailed,
} from "../services/googleAuthService.js";
import {
  hashPassword,
  verifyPassword,
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
  rpgPrefsSchema,
  changePasswordSchema,
  setPasswordSchema,
  unlinkGoogleSchema,
  mfaLoginSchema,
  mfaCodeSchema,
  mfaDisableSchema,
  acceptTermsSchema,
  deleteAccountSchema,
  desktopExchangeSchema,
} from "../validators/auth.schema.js";
import { DESKTOP_CHALLENGE_RE, consumeDesktopHandoff, createDesktopHandoff } from "../services/desktopAuthService.js";
import { requireAuth, SESSION_COOKIE_NAME } from "../middleware/auth.js";
import { COOKIE_BASE, clearSession, invalidateAuthState, issueSession, revokeAllSessions } from "../services/sessionService.js";
import {
  beginEnrollment,
  confirmEnrollment,
  disableMfa,
  getMfaStatus,
  readMfaLoginToken,
  regenerateRecoveryCodes,
  signMfaLoginToken,
  verifyUserMfa,
} from "../services/mfaService.js";
import { CURRENT_TERMS_VERSION } from "../config/legal.js";
import { rateLimit } from "../middleware/rateLimit.js";
import {
  sendMail,
  passwordResetEmail,
  welcomeEmail,
  passwordChangedEmail,
  verificationEmail,
} from "../services/emailService.js";
import type { User } from "../types/index.js";


export const authRouter = Router();

/** Finaliza um login bem-sucedido (senha, Google ou 2ª etapa do MFA). */
async function completeLogin(
  db: ReturnType<typeof getDb>,
  res: import("express").Response,
  user: { id: string; role: "user" | "admin"; session_version?: number | null },
  remember: boolean
) {
  await db.execute({ sql: "UPDATE users SET last_login_at = datetime('now'), last_seen_at = datetime('now') WHERE id = ?", args: [user.id] });
  issueSession(res, user, remember);
}

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
    sql: `INSERT INTO users (id, name, email, password_hash, role, email_verified, terms_version, terms_accepted_at)
          VALUES (?, ?, ?, ?, ?, 0, ?, datetime('now'))`,
    // O cadastro exige aceitar o Termo e a Política (registerSchema.acceptTerms).
    args: [id, name, email, passwordHash, role, CURRENT_TERMS_VERSION],
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

  const verifyUrl = `${resolveAppUrl(req)}/verificar-email?token=${raw}`;
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

  // Com MFA ligado, a senha certa ainda não cria sessão: devolve um token
  // curto (5 min) e o login termina em POST /login/mfa com o código do app.
  if (Number((user as any).mfa_enabled) === 1) {
    return res.json({ mfaRequired: true, mfaToken: signMfaLoginToken(user.id, rememberMe) });
  }

  await completeLogin(db, res, { id: user.id, role: user.role, session_version: (user as any).session_version }, rememberMe);
  return res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

/** POST /api/auth/login/mfa — 2ª etapa: código do app autenticador ou de recuperação. */
authRouter.post("/login/mfa", rateLimit({ max: 10 }), async (req, res) => {
  const parsed = mfaLoginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  const pending = readMfaLoginToken(parsed.data.mfaToken);
  if (!pending) return res.status(401).json({ error: "A verificação expirou. Entre com sua senha novamente.", code: "MFA_EXPIRED" });

  const db = getDb();
  const check = await verifyUserMfa(db, pending.userId, parsed.data.code);
  if (!check.ok) return res.status(401).json({ error: "Código inválido. Confira o app autenticador e tente de novo." });

  const row = (await db.execute({ sql: "SELECT id, name, email, role, session_version FROM users WHERE id = ?", args: [pending.userId] })).rows[0] as unknown as
    | { id: string; name: string; email: string; role: "user" | "admin"; session_version: number }
    | undefined;
  if (!row) return res.status(401).json({ error: "Conta não encontrada." });

  await completeLogin(db, res, row, pending.remember);
  return res.json({ id: row.id, name: row.name, email: row.email, role: row.role, usedRecoveryCode: check.usedRecovery });
});

/** POST /api/auth/logout-all — encerra a sessão em todos os dispositivos. */
authRouter.post("/logout-all", requireAuth, async (req, res) => {
  await revokeAllSessions(req.user!.id);
  clearSession(res);
  return res.status(204).send();
});

/** POST /api/auth/logout */
authRouter.post("/logout", (_req, res) => {
  clearSession(res);
  return res.status(204).send();
});

/** Preferências RPG salvas (JSON validado na escrita); inválido vira objeto vazio. */
function parseRpgPrefs(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || !raw) return {};
  try {
    const parsed = rpgPrefsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

/** GET /api/auth/me */
authRouter.get("/me", requireAuth, async (req, res) => {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT id, name, email, role, avatar_url, language, timezone, theme, onboarding_done, created_at, google_id, password_set,
                 mfa_enabled, terms_version, terms_accepted_at, rpg_avatar_image, rpg_prefs_json
          FROM users WHERE id = ?`,
    args: [req.user!.id],
  });
  const row = result.rows[0] as unknown as { google_id?: string | null } | undefined;
  // Um JWT assinado pode continuar "válido" mesmo depois que o usuário
  // some do banco (ex: troca de banco de dados em desenvolvimento, ou
  // conta apagada). Nesse caso a sessão deve ser tratada como inválida
  // (401 + cookie limpo), nunca um 404 solto — é assim que o frontend
  // (useAuth) já sabe tratar "deslogado" sem quebrar a tela.
  if (!row) {
    res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    return res.status(401).json({ error: "Sessão inválida. Faça login novamente." });
  }
  // google_id nunca é exposto (é só um identificador interno do Google) — só se
  // a conta está vinculada, pra frontend mostrar "Conectado com Google" no perfil.
  const { google_id, password_set, mfa_enabled, terms_version, rpg_prefs_json, ...user } = row as Record<string, unknown>;
  return res.json({
    ...user,
    rpg_prefs: parseRpgPrefs(rpg_prefs_json),
    google_linked: !!google_id,
    has_password: Number(password_set ?? 1) === 1,
    mfa_enabled: Number(mfa_enabled ?? 0) === 1,
    terms_version: terms_version ?? null,
    terms_current_version: CURRENT_TERMS_VERSION,
    // true quando o usuário ainda não aceitou a versão vigente do termo.
    terms_pending: terms_version !== CURRENT_TERMS_VERSION,
  });
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
  if ("rpgAvatarImage" in data) {
    sets.push("rpg_avatar_image = ?");
    args.push(data.rpgAvatarImage ?? null);
  }
  if (data.rpgPrefs) {
    // Cosméticos do Códex: só equipa título desbloqueado e classe do catálogo.
    if (data.rpgPrefs.title && !(await isTitleUnlocked(db, req.user!.id, data.rpgPrefs.title))) {
      return res.status(403).json({ error: "Este título ainda não foi desbloqueado." });
    }
    if (data.rpgPrefs.classId && !CLASSES.some((c) => c.id === data.rpgPrefs!.classId)) {
      return res.status(400).json({ error: "Classe inválida." });
    }
    // Moldura e emblema também só se conquistados (validação no servidor, não só na UI).
    if (data.rpgPrefs.frame && !(await isFrameUnlocked(db, req.user!.id, data.rpgPrefs.frame))) {
      return res.status(403).json({ error: "Esta moldura ainda não foi conquistada." });
    }
    if (data.rpgPrefs.emblem && !(await isEmblemUnlocked(db, req.user!.id, data.rpgPrefs.emblem))) {
      return res.status(403).json({ error: "Este emblema ainda não foi conquistado." });
    }
    // Mescla com o que já está salvo: cada tela envia só o que mudou.
    const current = await db.execute({ sql: "SELECT rpg_prefs_json FROM users WHERE id = ?", args: [req.user!.id] });
    sets.push("rpg_prefs_json = ?");
    args.push(JSON.stringify({ ...parseRpgPrefs(current.rows[0]?.rpg_prefs_json), ...data.rpgPrefs }));
  }
  if (sets.length === 0) {
    return res.status(400).json({ error: "Nenhum campo para atualizar." });
  }
  sets.push("updated_at = datetime('now')");
  args.push(req.user!.id);

  await db.execute({ sql: `UPDATE users SET ${sets.join(", ")} WHERE id = ?`, args });

  const updated = await db.execute({
    sql: `SELECT id, name, email, role, avatar_url, language, timezone, theme, onboarding_done, created_at, rpg_avatar_image, rpg_prefs_json
          FROM users WHERE id = ?`,
    args: [req.user!.id],
  });
  const { rpg_prefs_json, ...user } = updated.rows[0] as unknown as Record<string, unknown>;
  return res.json({ ...user, rpg_prefs: parseRpgPrefs(rpg_prefs_json) });
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
    sql: "UPDATE users SET password_hash = ?, password_set = 1, updated_at = datetime('now') WHERE id = ?",
    args: [newHash, req.user!.id],
  });
  // Senha nova encerra as sessões de outros dispositivos; esta continua (novo token).
  await revokeAllSessions(req.user!.id);
  const fresh = (await db.execute({ sql: "SELECT session_version FROM users WHERE id = ?", args: [req.user!.id] })).rows[0] as unknown as { session_version: number };
  issueSession(res, { id: req.user!.id, role: req.user!.role, session_version: fresh.session_version }, true);

  const userRow = await db.execute({ sql: "SELECT email FROM users WHERE id = ?", args: [req.user!.id] });
  const userEmail = (userRow.rows[0] as { email?: string } | undefined)?.email;
  if (userEmail) {
    const notice = passwordChangedEmail();
    sendMail({ to: userEmail, ...notice }).catch((err) => console.error("[email] falha ao enviar aviso de troca de senha:", err));
  }

  return res.json({ message: "Senha atualizada com sucesso." });
});

/**
 * POST /api/auth/set-password — define a PRIMEIRA senha de quem só entrava
 * com o Google (password_set = 0). Quem já tem senha usa change-password,
 * que sempre exige a senha atual.
 */
authRouter.post("/set-password", requireAuth, rateLimit({ max: 5 }), async (req, res) => {
  const parsed = setPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const row = (await db.execute({ sql: "SELECT email, password_set FROM users WHERE id = ?", args: [req.user!.id] })).rows[0] as unknown as
    | { email: string; password_set: number }
    | undefined;
  if (!row) return res.status(401).json({ error: "Sessão inválida. Faça login novamente." });
  if (Number(row.password_set) === 1) {
    return res.status(409).json({ error: "Sua conta já tem senha. Use “Alterar senha”." });
  }
  const newHash = await hashPassword(parsed.data.newPassword);
  await db.execute({
    sql: "UPDATE users SET password_hash = ?, password_set = 1, updated_at = datetime('now') WHERE id = ?",
    args: [newHash, req.user!.id],
  });
  const notice = passwordChangedEmail();
  sendMail({ to: row.email, ...notice }).catch((err) => console.error("[email] falha ao enviar aviso de nova senha:", err));
  return res.json({ message: "Senha definida. Agora você também pode entrar com e-mail e senha." });
});

/**
 * GET /api/auth/google/link/start — vincula uma conta Google ao usuário
 * LOGADO (a partir do Perfil). O id do usuário vai dentro do state
 * assinado, então o callback sabe a quem vincular sem confiar em nada
 * vindo do navegador.
 */
authRouter.get("/google/link/start", requireAuth, async (req, res) => {
  const db = getDb();
  const config = await getGoogleOAuthConfig(db);
  if (!config) return res.redirect(`${resolveAppUrl(req)}/perfil?google=nao_configurado`);
  const state = signOAuthState("google_link", { uid: req.user!.id });
  return res.redirect(buildGoogleAuthUrl(config, googleRedirectUri(req), state));
});

/**
 * POST /api/auth/google/unlink — desvincula o Google. Só é permitido se a
 * conta tiver senha cadastrada (senão o usuário ficaria sem forma de
 * entrar) e exige a senha atual como confirmação.
 */
authRouter.post("/google/unlink", requireAuth, rateLimit({ max: 5 }), async (req, res) => {
  const parsed = unlinkGoogleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const db = getDb();
  const row = (await db.execute({ sql: "SELECT password_hash, password_set, google_id FROM users WHERE id = ?", args: [req.user!.id] })).rows[0] as unknown as
    | { password_hash: string; password_set: number; google_id: string | null }
    | undefined;
  if (!row) return res.status(401).json({ error: "Sessão inválida. Faça login novamente." });
  if (!row.google_id) return res.status(409).json({ error: "Sua conta não está vinculada ao Google." });
  if (Number(row.password_set) !== 1) {
    return res.status(409).json({ error: "Defina uma senha antes de desvincular o Google — senão você ficaria sem como entrar." });
  }
  if (!(await verifyPassword(parsed.data.password, row.password_hash))) {
    return res.status(401).json({ error: "Senha incorreta." });
  }
  await db.execute({ sql: "UPDATE users SET google_id = NULL, updated_at = datetime('now') WHERE id = ?", args: [req.user!.id] });
  return res.json({ message: "Conta Google desvinculada." });
});

/* ============================ MFA (app autenticador) ============================ */

/** GET /api/auth/mfa/status */
authRouter.get("/mfa/status", requireAuth, async (req, res) => {
  return res.json(await getMfaStatus(getDb(), req.user!.id));
});

/** POST /api/auth/mfa/setup — gera QR code e segredo pendente (ainda não ativa nada). */
authRouter.post("/mfa/setup", requireAuth, rateLimit({ max: 10 }), async (req, res) => {
  const db = getDb();
  const row = (await db.execute({ sql: "SELECT email, mfa_enabled FROM users WHERE id = ?", args: [req.user!.id] })).rows[0] as unknown as
    | { email: string; mfa_enabled: number }
    | undefined;
  if (!row) return res.status(401).json({ error: "Sessão inválida." });
  if (Number(row.mfa_enabled) === 1) return res.status(409).json({ error: "A verificação em duas etapas já está ativa." });
  return res.json(await beginEnrollment(db, req.user!.id, row.email));
});

/** POST /api/auth/mfa/enable — confirma o 1º código e ativa. Devolve os códigos de recuperação (uma vez só). */
authRouter.post("/mfa/enable", requireAuth, rateLimit({ max: 10 }), async (req, res) => {
  const parsed = mfaCodeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Código inválido." });
  const codes = await confirmEnrollment(getDb(), req.user!.id, parsed.data.code);
  if (!codes) return res.status(400).json({ error: "Código incorreto. Confira se o relógio do celular está certo e tente de novo." });
  return res.json({ recoveryCodes: codes });
});

/** POST /api/auth/mfa/disable — exige um código válido e, se a conta tem senha, a senha. */
authRouter.post("/mfa/disable", requireAuth, rateLimit({ max: 5 }), async (req, res) => {
  const parsed = mfaDisableSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  const db = getDb();
  const row = (await db.execute({ sql: "SELECT password_hash, password_set FROM users WHERE id = ?", args: [req.user!.id] })).rows[0] as unknown as
    | { password_hash: string; password_set: number }
    | undefined;
  if (!row) return res.status(401).json({ error: "Sessão inválida." });
  if (Number(row.password_set) === 1 && !(await verifyPassword(parsed.data.password ?? "", row.password_hash))) {
    return res.status(401).json({ error: "Senha incorreta." });
  }
  if (!(await verifyUserMfa(db, req.user!.id, parsed.data.code)).ok) return res.status(401).json({ error: "Código inválido." });
  await disableMfa(db, req.user!.id);
  return res.json({ ok: true });
});

/** POST /api/auth/mfa/recovery-codes — gera novos códigos (os antigos deixam de valer). */
authRouter.post("/mfa/recovery-codes", requireAuth, rateLimit({ max: 5 }), async (req, res) => {
  const parsed = mfaCodeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Código inválido." });
  const db = getDb();
  if (!(await verifyUserMfa(db, req.user!.id, parsed.data.code)).ok) return res.status(401).json({ error: "Código inválido." });
  return res.json({ recoveryCodes: await regenerateRecoveryCodes(db, req.user!.id) });
});

/* ============================ Termos e conta ============================ */

/** POST /api/auth/accept-terms — registra o aceite da versão vigente do Termo e da Política. */
authRouter.post("/accept-terms", requireAuth, async (req, res) => {
  const parsed = acceptTermsSchema.safeParse(req.body);
  if (!parsed.success || parsed.data.version !== CURRENT_TERMS_VERSION) {
    return res.status(400).json({ error: "Versão do termo desatualizada. Recarregue a página." });
  }
  await getDb().execute({
    sql: "UPDATE users SET terms_version = ?, terms_accepted_at = datetime('now') WHERE id = ?",
    args: [CURRENT_TERMS_VERSION, req.user!.id],
  });
  return res.json({ ok: true, version: CURRENT_TERMS_VERSION });
});

/**
 * DELETE /api/auth/me — o próprio usuário exclui a conta e TODOS os dados
 * (LGPD, art. 18, VI). Confirma com o e-mail digitado, a senha (se houver)
 * e o código do MFA (se ativo). As tabelas usam ON DELETE CASCADE.
 */
authRouter.delete("/me", requireAuth, rateLimit({ max: 5 }), async (req, res) => {
  const parsed = deleteAccountSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  const db = getDb();
  const row = (await db.execute({ sql: "SELECT email, role, password_hash, password_set, mfa_enabled FROM users WHERE id = ?", args: [req.user!.id] })).rows[0] as unknown as
    | { email: string; role: string; password_hash: string; password_set: number; mfa_enabled: number }
    | undefined;
  if (!row) return res.status(401).json({ error: "Sessão inválida." });
  if (parsed.data.confirmEmail.trim().toLowerCase() !== row.email.toLowerCase()) {
    return res.status(400).json({ error: "O e-mail digitado não confere com o da conta." });
  }
  if (Number(row.password_set) === 1 && !(await verifyPassword(parsed.data.password ?? "", row.password_hash))) {
    return res.status(401).json({ error: "Senha incorreta." });
  }
  if (Number(row.mfa_enabled) === 1 && !(await verifyUserMfa(db, req.user!.id, parsed.data.code ?? "")).ok) {
    return res.status(401).json({ error: "Código de verificação inválido." });
  }
  if (row.role === "admin") {
    const admins = await db.execute("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'");
    if (Number((admins.rows[0] as unknown as { c: number }).c) <= 1) {
      return res.status(409).json({ error: "Você é o único administrador. Promova outra pessoa antes de excluir a conta." });
    }
  }
  await db.execute({ sql: "DELETE FROM users WHERE id = ?", args: [req.user!.id] });
  invalidateAuthState(req.user!.id);
  clearSession(res);
  return res.status(204).send();
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

  const resetUrl = `${resolveAppUrl(req)}/redefinir-senha?token=${raw}`;
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
    sql: "UPDATE users SET password_hash = ?, password_set = 1, updated_at = datetime('now') WHERE id = ?",
    args: [newHash, record.user_id],
  });
  await revokeAllSessions(record.user_id);
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

  await completeLogin(db, res, user, true);

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

  const verifyUrl = `${resolveAppUrl(req)}/verificar-email?token=${raw}`;
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

const GOOGLE_STATE_COOKIE = "lifeos_google_oauth_state";

/** GET /api/auth/google/status — só diz se o login com Google está configurado (nunca expõe as credenciais). */
authRouter.get("/google/status", async (_req, res) => {
  const db = getDb();
  const config = await getGoogleOAuthConfig(db);
  return res.json({ available: !!config });
});

/**
 * GET /api/auth/google/start — inicia o login/cadastro com Google:
 * redireciona pra tela de consentimento do Google com um "state"
 * aleatório guardado em cookie de curta duração (proteção CSRF,
 * conferido de volta no callback).
 * Com ?desktop=<desafio PKCE>, o fluxo foi aberto pelo LifeOS Desktop no
 * navegador do sistema (o Google bloqueia OAuth dentro de webviews): o
 * desafio viaja assinado no state e o callback devolve ao app um código de
 * uso único em vez de criar a sessão neste navegador.
 */
authRouter.get("/google/start", async (req, res) => {
  const db = getDb();
  const config = await getGoogleOAuthConfig(db);
  if (!config) {
    return res
      .status(503)
      .send("Login com Google ainda não foi configurado. Peça a um administrador para configurar em Configurações → Login com Google.");
  }
  const desktop = typeof req.query.desktop === "string" ? req.query.desktop : null;
  if (desktop !== null && !DESKTOP_CHALLENGE_RE.test(desktop)) return res.status(400).send("Pedido de login do Desktop inválido.");
  const state = signOAuthState("google_oauth", desktop ? { dc: desktop } : {});
  // O cookie ainda é setado como camada extra (liga o state a esta aba/navegador
  // quando o cookie sobrevive ao redirect), mas o callback não depende mais dele.
  res.cookie(GOOGLE_STATE_COOKIE, state, { ...COOKIE_BASE, maxAge: 10 * 60 * 1000 });
  return res.redirect(buildGoogleAuthUrl(config, googleRedirectUri(req), state));
});

/**
 * GET /api/auth/google/callback — o Google volta pra cá com ?code&state.
 * Localiza o usuário pelo google_id; se não existir ainda, tenta achar
 * por e-mail (associa a conta Google a um cadastro já existente, como
 * pedido); senão cria um cadastro novo, já com e-mail verificado (o
 * Google já confirmou o e-mail) e uma senha aleatória que o usuário
 * nunca usa (pode definir uma de verdade depois via "Esqueci minha
 * senha", se quiser entrar também com e-mail/senha).
 */
authRouter.get("/google/callback", async (req, res) => {
  // Alguns proxies/navegadores podem entregar code/state como array — normaliza defensivamente.
  const rawCode = req.query.code as string | string[] | undefined;
  const rawState = req.query.state as string | string[] | undefined;
  const code = Array.isArray(rawCode) ? rawCode[0] : rawCode;
  const state = Array.isArray(rawState) ? rawState[0] : rawState;
  const error = req.query.error as string | undefined;
  // O cookie (quando presente) é só uma camada extra de confirmação — não é mais
  // obrigatório, porque em alguns navegadores/redes ele pode não sobreviver ao
  // redirect de volta do Google (ver comentário em signOAuthState).
  res.clearCookie(GOOGLE_STATE_COOKIE, { path: "/" });

  const appUrl = resolveAppUrl(req);
  const failRedirect = (reason: string) => res.redirect(`${appUrl}/login?google_error=${encodeURIComponent(reason)}`);

  // Erros específicos por etapa (em vez de um único "state_invalido" genérico)
  // para dar um diagnóstico claro caso o problema volte a acontecer.
  if (error) return failRedirect(`google_${error}`);
  if (!code) return failRedirect("code_ausente");
  if (!state) return failRedirect("state_ausente");
  const stateCheck = readOAuthState(state);
  if (!stateCheck.ok) return failRedirect(stateCheck.reason);
  const isLinkFlow = stateCheck.purpose === "google_link";
  if (!isLinkFlow && stateCheck.purpose !== "google_oauth") return failRedirect("state_propósito_invalido");
  const profileRedirect = (status: string) => res.redirect(`${appUrl}/perfil?google=${encodeURIComponent(status)}`);

  const db = getDb();
  const config = await getGoogleOAuthConfig(db);
  if (!config) return failRedirect("nao_configurado");

  let profile;
  try {
    profile = await exchangeGoogleCode(config, code, googleRedirectUri(req));
  } catch (err) {
    console.error("[google-oauth] falha na troca de código:", err);
    return failRedirect("falha_google");
  }

  // Vínculo iniciado pelo Perfil: associa a conta Google ao usuário que
  // estava logado quando o fluxo começou (uid vem do state assinado, nunca
  // da query), mesmo que o e-mail do Google seja diferente do cadastro.
  if (isLinkFlow) {
    if (!stateCheck.uid) return profileRedirect("erro");
    const owner = await db.execute({ sql: "SELECT id, google_id FROM users WHERE google_id = ?", args: [profile.sub] });
    const ownerRow = owner.rows[0] as unknown as { id: string } | undefined;
    if (ownerRow && ownerRow.id !== stateCheck.uid) return profileRedirect("em_uso");
    const upd = await db.execute({
      sql: "UPDATE users SET google_id = ?, updated_at = datetime('now') WHERE id = ?",
      args: [profile.sub, stateCheck.uid],
    });
    return profileRedirect(upd.rowsAffected > 0 ? "vinculado" : "erro");
  }

  const byGoogleId = await db.execute({ sql: "SELECT * FROM users WHERE google_id = ?", args: [profile.sub] });
  let user = byGoogleId.rows[0] as unknown as { id: string; name: string; email: string; role: "user" | "admin" } | undefined;

  if (!user) {
    const byEmail = await db.execute({ sql: "SELECT * FROM users WHERE email = ?", args: [profile.email] });
    const existing = byEmail.rows[0] as unknown as { id: string; name: string; email: string; role: "user" | "admin" } | undefined;
    if (existing) {
      // Conta já existia com esse e-mail (cadastro normal) — associa o Google a ela em vez de duplicar.
      await db.execute({
        sql: "UPDATE users SET google_id = ?, email_verified = 1, updated_at = datetime('now') WHERE id = ?",
        args: [profile.sub, existing.id],
      });
      user = existing;
    } else {
      const id = nanoid();
      // Senha aleatória que o usuário nunca vê nem usa — login por Google não passa por ela;
      // existe só porque users.password_hash é NOT NULL. Se quiser, define uma de verdade via "Esqueci minha senha".
      const randomPasswordHash = await hashPassword(crypto.randomBytes(32).toString("hex"));
      const adminEmail = (process.env.ADMIN_EMAIL ?? "").toLowerCase();
      const role = profile.email.toLowerCase() === adminEmail ? "admin" : "user";
      await db.execute({
        sql: `INSERT INTO users (id, name, email, password_hash, role, avatar_url, google_id, email_verified, password_set)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        args: [id, profile.name, profile.email, randomPasswordHash, role, profile.picture, profile.sub, profile.emailVerified ? 1 : 0],
      });
      await db.execute({ sql: "INSERT INTO user_settings (user_id) VALUES (?)", args: [id] });
      user = { id, name: profile.name, email: profile.email, role };

      const welcome = welcomeEmail(profile.name);
      sendMail({ to: profile.email, ...welcome }).catch((err) => console.error("[email] falha ao enviar boas-vindas (google):", err));
    }
  }

  // Login iniciado no Desktop: nenhuma sessão neste navegador — o app recebe
  // um código de uso único (deep link) e troca em /desktop/exchange, onde o MFA é exigido.
  if (stateCheck.dc) {
    const handoff = await createDesktopHandoff(db, user.id, stateCheck.dc);
    return res.redirect(`${appUrl}/auth/desktop-handoff?code=${encodeURIComponent(handoff)}`);
  }

  // Google também respeita o MFA: sem sessão até o código do app ser confirmado.
  const secState = (await db.execute({ sql: "SELECT mfa_enabled, session_version FROM users WHERE id = ?", args: [user.id] })).rows[0] as unknown as
    | { mfa_enabled: number; session_version: number }
    | undefined;
  if (Number(secState?.mfa_enabled ?? 0) === 1) {
    return res.redirect(`${appUrl}/login?mfa=${encodeURIComponent(signMfaLoginToken(user.id, true))}`);
  }
  await completeLogin(db, res, { ...user, session_version: secState?.session_version ?? 0 }, true);
  return res.redirect(`${appUrl}/dashboard`);
});

/**
 * POST /api/auth/desktop/exchange — chamado pela janela do LifeOS Desktop
 * depois do deep link: código de uso único + verificador PKCE (que só o app
 * conhece) viram a sessão normal (cookie httpOnly) dentro do app. Com MFA
 * ativo, devolve a 2ª etapa como no login por senha.
 */
authRouter.post("/desktop/exchange", rateLimit({ max: 10 }), async (req, res) => {
  const parsed = desktopExchangeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  const db = getDb();
  const userId = await consumeDesktopHandoff(db, parsed.data.code, parsed.data.verifier);
  if (!userId) return res.status(401).json({ error: "Login expirado ou inválido. Tente entrar com o Google novamente." });

  const user = (await db.execute({ sql: "SELECT id, name, email, role, mfa_enabled, session_version FROM users WHERE id = ?", args: [userId] }))
    .rows[0] as unknown as { id: string; name: string; email: string; role: "user" | "admin"; mfa_enabled: number; session_version: number } | undefined;
  if (!user) return res.status(401).json({ error: "Conta não encontrada." });
  if (Number(user.mfa_enabled ?? 0) === 1) {
    return res.json({ mfaRequired: true, mfaToken: signMfaLoginToken(user.id, true) });
  }
  await completeLogin(db, res, user, true);
  return res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
});
