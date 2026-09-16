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
  try {
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
  } catch (err) {
    console.error("[email] configuração SMTP indisponível:", err);
    return null;
  }
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

  try {
    const transport = buildTransport(config);
    await transport.sendMail({
      from: `"LifeOS" <${config.user}>`,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text ?? input.html.replace(/<[^>]+>/g, " "),
    });
    return true;
  } catch (err) {
    console.error("[email] falha ao enviar:", err);
    return false;
  }
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function lifeOsEmailShell(input: {
  preheader: string;
  eyebrow?: string;
  title: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
}) {
  const webOrigin = process.env.WEB_ORIGIN ?? "";
  const logoUrl = webOrigin ? `${webOrigin.replace(/\/$/, "")}/logo/icon-64.png` : "";
  const logo = logoUrl
    ? `<img src="${logoUrl}" width="42" height="42" alt="LifeOS" style="display:block;border-radius:14px;background:#fff;" />`
    : `<span style="display:inline-flex;width:42px;height:42px;border-radius:14px;background:#5B6EF5;color:#fff;align-items:center;justify-content:center;font-weight:800;">L</span>`;
  const cta = input.ctaLabel && input.ctaUrl
    ? `<p style="margin:24px 0 4px;"><a href="${escapeHtml(input.ctaUrl)}" style="display:inline-block;background:linear-gradient(135deg,#FF8A3D,#F4522B);color:#fff;text-decoration:none;font-weight:700;border-radius:14px;padding:12px 18px;">${escapeHtml(input.ctaLabel)}</a></p>`
    : "";

  return `
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}</div>
    <div style="margin:0;background:#F4F1EA;padding:28px 12px;font-family:Inter,Segoe UI,Arial,sans-serif;color:#1E2537;">
      <div style="max-width:620px;margin:0 auto;background:#FFFFFF;border:1px solid #E8E2D6;border-radius:22px;overflow:hidden;box-shadow:0 18px 45px rgba(30,37,55,.08);">
        <div style="padding:22px 24px;background:linear-gradient(135deg,#F8F6FF,#FFF3EA);border-bottom:1px solid #E8E2D6;">
          <table role="presentation" width="100%" style="border-collapse:collapse;">
            <tr>
              <td style="width:50px;">${logo}</td>
              <td>
                <p style="margin:0;font-size:18px;font-weight:800;letter-spacing:-.02em;">LifeOS</p>
                <p style="margin:2px 0 0;color:#6B7280;font-size:12px;">progresso em movimento</p>
              </td>
            </tr>
          </table>
        </div>
        <div style="padding:26px 24px 28px;">
          ${input.eyebrow ? `<p style="margin:0 0 8px;color:#6D5DF6;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;">${escapeHtml(input.eyebrow)}</p>` : ""}
          <h1 style="margin:0;color:#1E2537;font-size:26px;line-height:1.15;letter-spacing:-.03em;">${escapeHtml(input.title)}</h1>
          <div style="margin-top:16px;color:#4B5563;font-size:14px;line-height:1.65;">${input.bodyHtml}</div>
          ${cta}
        </div>
      </div>
      <p style="max-width:620px;margin:14px auto 0;color:#8A91A5;font-size:11px;text-align:center;">
        Você recebeu este aviso porque ativou gatilhos no LifeOS. Ajuste em Perfil → Gatilhos.
      </p>
    </div>`;
}

export function notificationTriggerEmail(input: {
  title: string;
  body: string;
  ctaLabel?: string;
  path?: string;
}) {
  const webOrigin = process.env.WEB_ORIGIN ?? "";
  const ctaUrl = input.path && webOrigin ? `${webOrigin.replace(/\/$/, "")}${input.path}` : undefined;
  return {
    subject: input.title,
    html: lifeOsEmailShell({
      preheader: input.body,
      eyebrow: "Gatilho LifeOS",
      title: input.title,
      bodyHtml: `<p style="margin:0;">${escapeHtml(input.body)}</p>`,
      ctaLabel: input.ctaLabel,
      ctaUrl,
    }),
  };
}

/** Usado pelo botão "Enviar e-mail de teste" em Configurações — confirma entrega de ponta a ponta, não só o handshake SMTP. */
export function testEmail() {
  return {
    subject: "Teste de e-mail — LifeOS",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color:#1E2537;">Tudo certo por aqui!</h2>
        <p>Este é um e-mail de teste disparado pela tela de Configurações do LifeOS.</p>
        <p style="color:#6B7280;font-size:12px;">Se você recebeu esta mensagem, o envio de e-mail (SMTP) está funcionando corretamente.</p>
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
