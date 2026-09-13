import nodemailer from "nodemailer";
import { getDb } from "../db/client.js";
import { decryptSecret } from "./cryptoService.js";

/**
 * Envio real de e-mail via SMTP (Gmail ou qualquer provedor
 * compatível), usando as credenciais cadastradas pelo admin em
 * /configuracoes (tabela admin_settings, integration = 'smtp').
 * Nunca guardamos a senha em texto puro — ela é descriptografada só
 * no momento do envio, dentro do processo do servidor.
 */

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  appPassword: string;
}

type Db = ReturnType<typeof getDb>;

async function readSetting(db: Db, keyName: string): Promise<string | null> {
  const result = await db.execute({
    sql: "SELECT encrypted_value FROM admin_settings WHERE integration = 'smtp' AND key_name = ? AND is_active = 1",
    args: [keyName],
  });
  const row = result.rows[0] as { encrypted_value?: string } | undefined;
  if (!row?.encrypted_value) return null;
  return decryptSecret(row.encrypted_value);
}

/** Lê e descriptografa a configuração SMTP completa; null se algo essencial faltar. */
export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const db = getDb();
  const [host, port, user, appPassword] = await Promise.all([
    readSetting(db, "host"),
    readSetting(db, "port"),
    readSetting(db, "user"),
    readSetting(db, "app_password"),
  ]);
  if (!host || !user || !appPassword) return null;
  const portNum = Number(port) || 587;
  return { host, port: portNum, secure: portNum === 465, user, appPassword };
}

function buildTransport(config: SmtpConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.appPassword },
  });
}

/** Envia um e-mail; retorna false (sem lançar) se o SMTP não estiver configurado. */
export async function sendMail(input: { to: string; subject: string; html: string; text?: string }): Promise<boolean> {
  const config = await getSmtpConfig();
  if (!config) return false;

  const transport = buildTransport(config);
  await transport.sendMail({
    from: `"LifeOS" <${config.user}>`,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text ?? input.html.replace(/<[^>]+>/g, " "),
  });
  return true;
}

/** Testa a conexão SMTP (usado pelo botão "Testar conexão" em Configurações). */
export async function verifySmtpConnection(): Promise<{ ok: boolean; message: string }> {
  const config = await getSmtpConfig();
  if (!config) {
    return { ok: false, message: "Configure servidor, porta, e-mail e senha de app antes de testar." };
  }
  try {
    const transport = buildTransport(config);
    await transport.verify();
    return { ok: true, message: `Conexão com ${config.host}:${config.port} verificada com sucesso.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Falha ao conectar ao servidor SMTP." };
  }
}

export function passwordResetEmail(resetUrl: string) {
  return {
    subject: "Redefinição de senha — LifeOS",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color:#1E2537;">Redefinir sua senha</h2>
        <p>Recebemos um pedido para redefinir a senha da sua conta no LifeOS.</p>
        <p><a href="${resetUrl}" style="background:#5B6EF5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block;">Redefinir senha</a></p>
        <p style="color:#6B7280;font-size:12px;">Se você não pediu essa alteração, ignore este e-mail — o link expira em 1 hora.</p>
      </div>`,
  };
}

export function verificationEmail(verifyUrl: string) {
  return {
    subject: "Confirme seu e-mail — LifeOS",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color:#1E2537;">Confirme seu e-mail</h2>
        <p>Falta um passo para começar a usar o LifeOS: confirme seu e-mail para ativar sua conta.</p>
        <p><a href="${verifyUrl}" style="background:#E8A33D;color:#1E2126;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">Confirmar e-mail</a></p>
        <p style="color:#6B7280;font-size:12px;">Se você não criou uma conta no LifeOS, ignore este e-mail — o link expira em 24 horas.</p>
      </div>`,
  };
}

export function welcomeEmail(name: string) {
  return {
    subject: "Bem-vindo(a) ao LifeOS 👋",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color:#1E2537;">Olá, ${name}!</h2>
        <p>Sua conta no LifeOS foi criada com sucesso. Planeje, execute, registre, meça e melhore sua rotina — tudo em um só lugar.</p>
        <p style="color:#6B7280;font-size:12px;">Transforme sua rotina em progresso.</p>
      </div>`,
  };
}

export function passwordChangedEmail() {
  return {
    subject: "Sua senha foi alterada — LifeOS",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color:#1E2537;">Senha alterada</h2>
        <p>A senha da sua conta no LifeOS acabou de ser alterada. Se não foi você, redefina sua senha imediatamente.</p>
      </div>`,
  };
}
