import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { normalizeEmail } from "./guildService.js";
import { lifeOsEmailShell, sendMail } from "./emailService.js";
import { sendPushToUser } from "./pushService.js";

/**
 * Compartilhamento de projetos ("Colaboração total"): o dono convida
 * alguém por e-mail para um projeto; ao aceitar, o convidado vira
 * membro (project_members) com acesso total de leitura/escrita às
 * tarefas do projeto (ver projectAccessService.ts) — diferente da
 * Guilda, que só expõe um resumo somente leitura.
 *
 * Mesmo padrão de segurança da Guilda (guildService.ts):
 * - só o DONO convida/revoga convites e remove membros de um projeto
 *   que é dele (owner_id);
 * - convite pendente é vinculado pelo e-mail VERIFICADO de quem está
 *   logado (vale também para quem cria a conta depois do convite);
 * - depois de revogado/recusado/removido, o acesso acaba na hora.
 */

export class ProjectSharingError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export const PROJECT_SHARING_LIMITS = {
  invitesPerDay: 20,
  membersPerProject: 12,
  messageMax: 280,
} as const;

type InviteStatus = "pending" | "accepted" | "declined" | "revoked";

async function getUser(db: Client, userId: string) {
  const r = await db.execute({ sql: "SELECT id, name, email, email_verified FROM users WHERE id = ?", args: [userId] });
  const row = r.rows[0];
  if (!row) throw new ProjectSharingError("Usuário não encontrado.", 404);
  return { id: String(row.id), name: String(row.name), email: normalizeEmail(String(row.email)), verified: Number(row.email_verified) === 1 };
}

async function getOwnedProject(db: Client, ownerId: string, projectId: string) {
  const r = await db.execute({ sql: "SELECT id, name FROM projects WHERE id = ? AND owner_id = ?", args: [projectId, ownerId] });
  const row = r.rows[0];
  return row ? { id: String(row.id), name: String(row.name) } : null;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/** Push é "melhor esforço": sem inscrição não gera chaves, e falha nunca derruba a ação. */
async function notifyUser(db: Client, userId: string, payload: { title: string; body: string; url: string }) {
  try {
    const subs = await db.execute({ sql: "SELECT 1 FROM push_subscriptions WHERE owner_id = ? LIMIT 1", args: [userId] });
    if (subs.rows.length === 0) return;
    await sendPushToUser(userId, payload);
  } catch (err) {
    console.warn("[projetos] push não enviado:", err instanceof Error ? err.message.slice(0, 120) : "erro desconhecido");
  }
}

export interface ProjectMemberView {
  userId: string;
  name: string;
  email: string;
  role: string;
  addedAt: string;
}

export interface ProjectInviteView {
  id: string;
  email: string;
  message: string | null;
  status: InviteStatus;
  createdAt: string;
}

/** Membros aceitos + convites pendentes do projeto — qualquer membro (ou o dono) pode ver quem está dentro. */
export async function listProjectMembers(
  db: Client,
  projectId: string,
): Promise<{ members: ProjectMemberView[]; pendingInvites: ProjectInviteView[] }> {
  const [membersRows, invitesRows] = await Promise.all([
    db.execute({
      sql: `SELECT m.user_id, m.role, m.added_at, u.name, u.email
            FROM project_members m JOIN users u ON u.id = m.user_id
            WHERE m.project_id = ? ORDER BY m.added_at ASC`,
      args: [projectId],
    }),
    db.execute({
      sql: `SELECT id, invitee_email, message, created_at FROM project_invites
            WHERE project_id = ? AND status = 'pending' ORDER BY created_at DESC`,
      args: [projectId],
    }),
  ]);
  return {
    members: membersRows.rows.map((r) => ({
      userId: String(r.user_id),
      name: String(r.name),
      email: String(r.email),
      role: String(r.role),
      addedAt: String(r.added_at),
    })),
    pendingInvites: invitesRows.rows.map((r) => ({
      id: String(r.id),
      email: String(r.invitee_email),
      message: r.message == null ? null : String(r.message),
      status: "pending",
      createdAt: String(r.created_at),
    })),
  };
}

export async function createProjectInvite(
  db: Client,
  ownerId: string,
  projectId: string,
  input: { email: string; message?: string | null },
): Promise<{ invite: ProjectInviteView; emailSent: boolean }> {
  const owner = await getUser(db, ownerId);
  const project = await getOwnedProject(db, ownerId, projectId);
  if (!project) throw new ProjectSharingError("Projeto não encontrado.", 404);

  const email = normalizeEmail(input.email);
  if (email === owner.email) throw new ProjectSharingError("Você não pode convidar a si mesmo.");

  const recent = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM project_invites WHERE owner_id = ? AND created_at >= datetime('now', '-1 day')",
    args: [ownerId],
  });
  if (Number(recent.rows[0]?.n ?? 0) >= PROJECT_SHARING_LIMITS.invitesPerDay) {
    throw new ProjectSharingError(`Limite de ${PROJECT_SHARING_LIMITS.invitesPerDay} convites por dia atingido. Tente amanhã.`, 429);
  }
  const live = await db.execute({
    sql: `SELECT (SELECT COUNT(*) FROM project_members WHERE project_id = ?) +
                 (SELECT COUNT(*) FROM project_invites WHERE project_id = ? AND status = 'pending') AS n`,
    args: [projectId, projectId],
  });
  if (Number(live.rows[0]?.n ?? 0) >= PROJECT_SHARING_LIMITS.membersPerProject) {
    throw new ProjectSharingError(`Cada projeto aceita até ${PROJECT_SHARING_LIMITS.membersPerProject} pessoas (membros + convites pendentes).`);
  }
  const alreadyMember = await db.execute({
    sql: "SELECT 1 FROM project_members m JOIN users u ON u.id = m.user_id WHERE m.project_id = ? AND lower(u.email) = ?",
    args: [projectId, email],
  });
  if (alreadyMember.rows.length > 0) throw new ProjectSharingError("Essa pessoa já faz parte do projeto.", 409);

  const id = nanoid();
  const message = input.message?.trim() ? input.message.trim().slice(0, PROJECT_SHARING_LIMITS.messageMax) : null;
  try {
    await db.execute({
      sql: `INSERT INTO project_invites (id, project_id, owner_id, invitee_email, status, message)
            VALUES (?, ?, ?, ?, 'pending', ?)`,
      args: [id, projectId, ownerId, email, message],
    });
  } catch (err) {
    if (err instanceof Error && /UNIQUE/i.test(err.message)) {
      throw new ProjectSharingError("Esse e-mail já foi convidado para este projeto.", 409);
    }
    throw err;
  }

  const webOrigin = (process.env.WEB_ORIGIN ?? "").replace(/\/$/, "");
  const bodyHtml = `<p style="margin:0 0 10px;">${escapeHtml(owner.name)} chamou você para colaborar no projeto <strong>${escapeHtml(project.name)}</strong> no LifeOS.</p>
    ${message ? `<p style="margin:0 0 10px;font-style:italic;">“${escapeHtml(message)}”</p>` : ""}
    <p style="margin:0;">Você poderá ver, criar, editar e concluir as tarefas desse projeto junto com ${escapeHtml(owner.name)}. Se ainda não tem conta no LifeOS, crie uma com este e-mail para aceitar.</p>`;
  const emailSent = await sendMail({
    to: email,
    subject: `${owner.name} chamou você para colaborar em "${project.name}" — LifeOS`,
    html: lifeOsEmailShell({
      preheader: `${owner.name} quer colaborar com você no projeto "${project.name}".`,
      eyebrow: "Projetos LifeOS",
      title: "Convite para colaborar",
      bodyHtml,
      ctaLabel: webOrigin ? "Ver convite" : undefined,
      ctaUrl: webOrigin ? `${webOrigin}/projetos` : undefined,
    }),
  });

  const existing = await db.execute({ sql: "SELECT id FROM users WHERE lower(email) = ? AND email_verified = 1", args: [email] });
  const inviteeId = existing.rows[0]?.id;
  if (typeof inviteeId === "string") {
    await notifyUser(db, inviteeId, { title: "Convite de projeto", body: `${owner.name} quer colaborar com você em "${project.name}".`, url: "/projetos" });
  }

  return {
    invite: { id, email, message, status: "pending", createdAt: new Date().toISOString() },
    emailSent,
  };
}

/** Dono revoga um convite ainda pendente. */
export async function revokeProjectInvite(db: Client, ownerId: string, projectId: string, inviteId: string): Promise<void> {
  const r = await db.execute({
    sql: `UPDATE project_invites SET status = 'revoked', responded_at = datetime('now')
          WHERE id = ? AND project_id = ? AND owner_id = ? AND status = 'pending'`,
    args: [inviteId, projectId, ownerId],
  });
  if (r.rowsAffected === 0) throw new ProjectSharingError("Convite não encontrado.", 404);
}

/** Dono remove um membro já aceito (acesso termina na hora). */
export async function removeProjectMember(db: Client, ownerId: string, projectId: string, memberUserId: string): Promise<void> {
  const project = await getOwnedProject(db, ownerId, projectId);
  if (!project) throw new ProjectSharingError("Projeto não encontrado.", 404);
  const r = await db.execute({
    sql: "DELETE FROM project_members WHERE project_id = ? AND user_id = ?",
    args: [projectId, memberUserId],
  });
  if (r.rowsAffected === 0) throw new ProjectSharingError("Membro não encontrado.", 404);
  await db.execute({
    sql: `UPDATE project_invites SET status = 'revoked', responded_at = datetime('now')
          WHERE project_id = ? AND owner_id = ? AND invitee_user_id = ? AND status = 'accepted'`,
    args: [projectId, ownerId, memberUserId],
  });
}

/** O próprio membro sai do projeto (o dono nunca "sai" do próprio projeto). */
export async function leaveProject(db: Client, userId: string, projectId: string): Promise<void> {
  const r = await db.execute({ sql: "DELETE FROM project_members WHERE project_id = ? AND user_id = ?", args: [projectId, userId] });
  if (r.rowsAffected === 0) throw new ProjectSharingError("Você não é membro deste projeto.", 404);
  await db.execute({
    sql: `UPDATE project_invites SET status = 'declined', responded_at = datetime('now')
          WHERE project_id = ? AND invitee_user_id = ? AND status = 'accepted'`,
    args: [projectId, userId],
  });
}

export interface MyProjectInviteView {
  id: string;
  projectId: string;
  projectName: string;
  ownerName: string;
  message: string | null;
  createdAt: string;
}

/** Convites pendentes para o e-mail verificado de quem está logado, de qualquer projeto. */
export async function listMyProjectInvites(db: Client, userId: string): Promise<{ emailVerified: boolean; invites: MyProjectInviteView[] }> {
  const me = await getUser(db, userId);
  if (!me.verified) return { emailVerified: false, invites: [] };
  const rows = await db.execute({
    sql: `SELECT i.id, i.project_id, i.message, i.created_at, p.name AS project_name, u.name AS owner_name
          FROM project_invites i
          JOIN projects p ON p.id = i.project_id
          JOIN users u ON u.id = i.owner_id
          WHERE i.invitee_email = ? AND i.status = 'pending' AND i.owner_id != ?
          ORDER BY i.created_at DESC LIMIT 100`,
    args: [me.email, userId],
  });
  return {
    emailVerified: true,
    invites: rows.rows.map((r) => ({
      id: String(r.id),
      projectId: String(r.project_id),
      projectName: String(r.project_name),
      ownerName: String(r.owner_name),
      message: r.message == null ? null : String(r.message),
      createdAt: String(r.created_at),
    })),
  };
}

export async function respondProjectInvite(db: Client, userId: string, inviteId: string, accept: boolean): Promise<void> {
  const me = await getUser(db, userId);
  if (!me.verified) throw new ProjectSharingError("Confirme seu e-mail para responder convites de projeto.", 403);
  const r = await db.execute({
    sql: `UPDATE project_invites SET status = ?, invitee_user_id = ?, responded_at = datetime('now')
          WHERE id = ? AND invitee_email = ? AND status = 'pending' AND owner_id != ?
          RETURNING project_id, owner_id`,
    args: [accept ? "accepted" : "declined", userId, inviteId, me.email, userId],
  });
  const row = r.rows[0];
  if (!row) throw new ProjectSharingError("Convite não encontrado.", 404);
  const projectId = String(row.project_id);
  const ownerId = String(row.owner_id);

  if (accept) {
    // INSERT OR IGNORE: se por algum motivo já existisse o vínculo, não duplica nem quebra.
    await db.execute({
      sql: "INSERT OR IGNORE INTO project_members (project_id, user_id, role) VALUES (?, ?, 'member')",
      args: [projectId, userId],
    });
    const project = await db.execute({ sql: "SELECT name FROM projects WHERE id = ?", args: [projectId] });
    const projectName = project.rows[0] ? String(project.rows[0].name) : "seu projeto";
    await notifyUser(db, ownerId, {
      title: "Novo colaborador no projeto",
      body: `${me.name} aceitou colaborar em "${projectName}".`,
      url: "/projetos",
    });
  }
}
