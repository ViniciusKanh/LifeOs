import { Router } from "express";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { encryptSecret, maskPreview } from "../services/cryptoService.js";

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
 * Implementação real (chamada ao Gemini, ping no Turso, envio de
 * e-mail de teste via SMTP) fica para a Fase 6, quando os serviços
 * externos (services/geminiService.ts, services/emailService.ts)
 * forem implementados. Aqui a rota já existe e já audita a tentativa,
 * então o frontend pode ser construído contra este contrato agora.
 */
adminRouter.post("/settings/:integration/test", async (req, res) => {
  const db = getDb();
  await logAudit(db, req.user!.id, "admin_settings.test", req.params.integration, req);
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
