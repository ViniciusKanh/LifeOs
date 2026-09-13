import { Router } from "express";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { encryptSecret, maskPreview } from "../services/cryptoService.js";
import { hashPassword } from "../services/authService.js";
import { verifySmtpConnection } from "../services/emailService.js";

export const adminRouter = Router();

// Toda rota administrativa exige sessão válida E role='admin'
// verificado no banco/JWT assinado pelo servidor.
adminRouter.use(requireAuth, requireAdmin);

const upsertSettingSchema = z.object({
  integration: z.enum(["gemini", "turso", "smtp"]),
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

/** GET /api/admin/settings — nunca retorna o valor bruto, só o preview mascarado */
adminRouter.get("/settings", async (req, res) => {
  const db = getDb();
  const result = await db.execute(
    `SELECT id, integration, key_name, masked_preview, is_active, extra_config, updated_at
     FROM admin_settings ORDER BY integration, key_name`
  );
  return res.json(result.rows);
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
 * POST /api/admin/settings/:integration/test — testa a conexão.
 * SMTP já testa de verdade (conecta no servidor com as credenciais
 * salvas). Gemini e Turso ainda não têm teste real implementado —
 * a rota audita a tentativa e devolve 501 para esses dois casos.
 */
adminRouter.post("/settings/:integration/test", async (req, res) => {
  const db = getDb();
  await logAudit(db, req.user!.id, "admin_settings.test", req.params.integration, req);

  if (req.params.integration === "smtp") {
    const result = await verifySmtpConnection();
    if (!result.ok) {
      return res.status(400).json({ error: result.message });
    }
    return res.json({ ok: true, message: result.message });
  }

  return res.status(501).json({
    error: `Teste de conexão para "${req.params.integration}" ainda não implementado (Fase 6).`,
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
