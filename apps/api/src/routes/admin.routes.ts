import { Router } from "express";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { encryptSecret, decryptSecret, maskPreview } from "../services/cryptoService.js";
import { hashPassword } from "../services/authService.js";
import { verifySmtpConnection, sendMail, testEmail } from "../services/emailService.js";
import { testGeminiConnection, GEMINI_MODELS, DEFAULT_GEMINI_MODEL } from "../services/geminiService.js";
import { testTursoConnection } from "../services/tursoService.js";
import { googleRedirectUri } from "../services/googleAuthService.js";

export const adminRouter = Router();

// Toda rota administrativa exige sessão válida E role='admin'
// verificado no banco/JWT assinado pelo servidor.
adminRouter.use(requireAuth, requireAdmin);

const upsertSettingSchema = z.object({
  integration: z.enum(["gemini", "turso", "smtp", "google_oauth"]),
  keyName: z.string().min(1).max(60),
  value: z.string().min(1).max(4000),
  extraConfig: z.record(z.unknown()).optional(),
});

const createUserSchema = z.object({
  name: z.string().trim().min(2, "Nome muito curto").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  password: z
    .string()
    .min(8, "A senha precisa ter pelo menos 8 caracteres")
    .max(72)
    .regex(/[a-z]/, "A senha precisa de uma letra minúscula")
    .regex(/[A-Z]/, "A senha precisa de uma letra maiúscula")
    .regex(/[0-9]/, "A senha precisa de um número"),
  role: z.enum(["user", "admin"]).optional().default("user"),
});

const updateUserRoleSchema = z.object({
  role: z.enum(["user", "admin"]),
});

async function logAudit(db: ReturnType<typeof getDb>, actorId: string, action: string, resource: string, req: any) {
  await db.execute({
    sql: `INSERT INTO audit_logs (id, actor_id, action, resource, ip_address, context)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [nanoid(), actorId, action, resource, req.ip ?? null, JSON.stringify({})],
  });
}

/**
 * GET /api/admin/settings — nunca retorna o valor bruto de credenciais
 * (senha, token, api key), só o preview mascarado. A única exceção é
 * key_name = 'model' (ex.: qual modelo do Gemini usar): não é um
 * segredo, é só uma escolha — devolvido em texto puro em `value` pra
 * a UI conseguir marcar a opção certa no seletor.
 */
adminRouter.get("/settings", async (req, res) => {
  const db = getDb();
  const result = await db.execute(
    `SELECT id, integration, key_name, encrypted_value, masked_preview, is_active, extra_config, updated_at
     FROM admin_settings ORDER BY integration, key_name`
  );
  const rows = result.rows.map((row: any) => {
    const { encrypted_value, ...rest } = row;
    if (row.key_name === "model" && encrypted_value) {
      return { ...rest, value: decryptSecret(encrypted_value as string) };
    }
    return rest;
  });
  return res.json(rows);
});

/**
 * GET /api/admin/settings/google/redirect-uri — a URL exata que precisa
 * ser cadastrada em "Authorized redirect URIs" no Google Cloud Console
 * pra login com Google funcionar. Calculada a partir da própria
 * requisição (mesma lógica usada de verdade no callback), pra nunca
 * divergir do que o backend realmente vai usar.
 */
adminRouter.get("/settings/google/redirect-uri", async (req, res) => {
  return res.json({ redirectUri: googleRedirectUri(req) });
});

/** PUT /api/admin/settings — cria ou atualiza uma credencial */
adminRouter.put("/settings", async (req, res) => {
  const parsed = upsertSettingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const { integration, keyName, value, extraConfig } = parsed.data;
  const db = getDb();

  const encrypted = encryptSecret(value);
  const preview = maskPreview(value);

  await db.execute({
    sql: `INSERT INTO admin_settings (id, integration, key_name, encrypted_value, masked_preview, is_active, extra_config, updated_by, updated_at)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?, datetime('now'))
          ON CONFLICT (integration, key_name) DO UPDATE SET
            encrypted_value = excluded.encrypted_value,
            masked_preview = excluded.masked_preview,
            is_active = 1,
            extra_config = excluded.extra_config,
            updated_by = excluded.updated_by,
            updated_at = datetime('now')`,
    args: [nanoid(), integration, keyName, encrypted, preview, extraConfig ? JSON.stringify(extraConfig) : null, req.user!.id],
  });

  await logAudit(db, req.user!.id, "admin_settings.update", `${integration}.${keyName}`, req);

  return res.json({ integration, keyName, maskedPreview: preview });
});

/** DELETE /api/admin/settings/:integration/:keyName */
adminRouter.delete("/settings/:integration/:keyName", async (req, res) => {
  const db = getDb();
  await db.execute({
    sql: "DELETE FROM admin_settings WHERE integration = ? AND key_name = ?",
    args: [req.params.integration, req.params.keyName],
  });
  await logAudit(db, req.user!.id, "admin_settings.remove", `${req.params.integration}.${req.params.keyName}`, req);
  return res.status(204).send();
});

/**
 * POST /api/admin/settings/:integration/test — testa a conexão de
 * verdade em todos os três casos: SMTP conecta no servidor, Gemini
 * chama a API com um prompt real, Turso abre uma conexão separada
 * e roda um SELECT 1 — nenhum deles é só validação de formato.
 */
adminRouter.post("/settings/:integration/test", async (req, res) => {
  const db = getDb();
  await logAudit(db, req.user!.id, "admin_settings.test", req.params.integration, req);

  let result: { ok: boolean; message: string };
  if (req.params.integration === "smtp") {
    result = await verifySmtpConnection();
  } else if (req.params.integration === "gemini") {
    result = await testGeminiConnection();
  } else if (req.params.integration === "turso") {
    result = await testTursoConnection();
  } else {
    return res.status(400).json({ error: `Integração "${req.params.integration}" desconhecida.` });
  }

  if (!result.ok) {
    return res.status(400).json({ error: result.message });
  }
  return res.json({ ok: true, message: result.message });
});

/** GET /api/admin/settings/gemini/models — lista de modelos válidos hoje (ver geminiService.ts). */
adminRouter.get("/settings/gemini/models", (_req, res) => {
  return res.json({ models: GEMINI_MODELS, default: DEFAULT_GEMINI_MODEL });
});

/**
 * POST /api/admin/settings/email/send-test — envia um e-mail de
 * teste de verdade (não só o handshake SMTP) para o próprio e-mail
 * do admin logado, pra confirmar entrega ponta a ponta.
 */
adminRouter.post("/settings/email/send-test", async (req, res) => {
  const db = getDb();
  const userRow = await db.execute({ sql: "SELECT email FROM users WHERE id = ?", args: [req.user!.id] });
  const to = (userRow.rows[0] as { email?: string } | undefined)?.email;
  if (!to) {
    return res.status(400).json({ error: "Não foi possível identificar seu e-mail." });
  }

  const email = testEmail();
  const sent = await sendMail({ to, ...email }).catch((err) => {
    console.error("[email] falha ao enviar e-mail de teste:", err);
    return false;
  });

  await logAudit(db, req.user!.id, "admin_settings.send_test_email", to, req);

  if (!sent) {
    return res.status(400).json({ error: "SMTP não configurado, ou o envio falhou — confira as credenciais e tente 'Testar conexão' primeiro." });
  }
  return res.json({ ok: true, message: `E-mail de teste enviado para ${to}. Confira sua caixa de entrada (e o spam).` });
});

/**
 * GET /api/admin/settings/security — configurações de segurança
 * efetivas hoje. Só leitura: esses valores vêm de variáveis de
 * ambiente (JWT_SECRET, AUTH_RATE_LIMIT_*, etc.) definidas na Vercel
 * ou no .env local — mudar aqui exigiria redeploy de qualquer forma,
 * então esta seção é só um painel de conferência, não um formulário.
 */
adminRouter.get("/settings/security", (_req, res) => {
  return res.json({
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
    cookieSameSite: process.env.COOKIE_SAMESITE ?? "lax",
    authRateLimitWindowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? 900000),
    authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX ?? 10),
    credentialsEncryptionConfigured: Boolean(process.env.CREDENTIALS_ENCRYPTION_KEY),
    nodeEnv: process.env.NODE_ENV ?? "development",
  });
});

/** GET /api/admin/audit-logs */
adminRouter.get("/audit-logs", async (req, res) => {
  const db = getDb();
  const result = await db.execute(
    `SELECT al.id, al.action, al.resource, al.ip_address, al.created_at, u.name AS actor_name
     FROM audit_logs al LEFT JOIN users u ON u.id = al.actor_id
     ORDER BY al.created_at DESC LIMIT 200`
  );
  return res.json(result.rows);
});

/* ============================ Usuários (admin) ============================ */

/** GET /api/admin/users — nunca inclui password_hash */
adminRouter.get("/users", async (_req, res) => {
  const db = getDb();
  const result = await db.execute(
    `SELECT id, name, email, role, avatar_url, created_at, updated_at FROM users ORDER BY created_at ASC`
  );
  return res.json(result.rows);
});

/** POST /api/admin/users — admin cria uma conta diretamente (sem passar por /register) */
adminRouter.post("/users", async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const { name, email, password, role } = parsed.data;
  const db = getDb();

  const existing = await db.execute({ sql: "SELECT id FROM users WHERE email = ?", args: [email] });
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: "Já existe uma conta com este e-mail." });
  }

  const id = nanoid();
  const passwordHash = await hashPassword(password);
  await db.execute({
    sql: `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)`,
    args: [id, name, email, passwordHash, role],
  });
  await db.execute({ sql: `INSERT INTO user_settings (user_id) VALUES (?)`, args: [id] });

  await logAudit(db, req.user!.id, "admin_users.create", email, req);

  const created = await db.execute({
    sql: "SELECT id, name, email, role, avatar_url, created_at, updated_at FROM users WHERE id = ?",
    args: [id],
  });
  return res.status(201).json(created.rows[0]);
});

/** PATCH /api/admin/users/:id/role */
adminRouter.patch("/users/:id/role", async (req, res) => {
  const parsed = updateUserRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Papel inválido." });
  }
  if (req.params.id === req.user!.id && parsed.data.role !== "admin") {
    return res.status(400).json({ error: "Você não pode remover seu próprio acesso de administrador." });
  }
  const db = getDb();
  const result = await db.execute({
    sql: "UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?",
    args: [parsed.data.role, req.params.id],
  });
  if (result.rowsAffected === 0) {
    return res.status(404).json({ error: "Usuário não encontrado." });
  }
  await logAudit(db, req.user!.id, "admin_users.update_role", req.params.id, req);

  const updated = await db.execute({
    sql: "SELECT id, name, email, role, avatar_url, created_at, updated_at FROM users WHERE id = ?",
    args: [req.params.id],
  });
  return res.json(updated.rows[0]);
});

/** DELETE /api/admin/users/:id — nunca permite apagar a própria conta por aqui */
adminRouter.delete("/users/:id", async (req, res) => {
  if (req.params.id === req.user!.id) {
    return res.status(400).json({ error: "Você não pode remover sua própria conta por aqui." });
  }
  const db = getDb();
  const result = await db.execute({ sql: "DELETE FROM users WHERE id = ?", args: [req.params.id] });
  if (result.rowsAffected === 0) {
    return res.status(404).json({ error: "Usuário não encontrado." });
  }
  await logAudit(db, req.user!.id, "admin_users.delete", req.params.id, req);
  return res.status(204).send();
});
