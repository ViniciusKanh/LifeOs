import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { computeStreak, dayKeyIn, todayKeyFor, userTimezone } from "./gamificationService.js";
import { normalizeStoredUtc } from "./healthService.js";
import { lifeOsEmailShell, sendMail } from "./emailService.js";
import { sendPushToUser } from "./pushService.js";

/**
 * Guilda — parceiro de compromisso.
 *
 * Regras de segurança (o centro desta feature):
 * - só o DONO cria/revoga convites, e só para itens que são dele (owner_id);
 * - o convidado nunca lê tabelas do dono: recebe um RESUMO montado aqui
 *   (título, dificuldade, progresso %, prazo, status, sequência) — sem
 *   descrição, cláusulas, tarefas, notas ou qualquer outro dado;
 * - convite pendente é vinculado pelo e-mail VERIFICADO de quem está logado
 *   (vale também para quem cria a conta depois do convite);
 * - após revogar/recusar/sair, o acesso acaba na hora (status != 'accepted').
 *
 * XP: testemunho NÃO concede XP ao dono — XP no LifeOS recompensa ações do
 * próprio jogador; um ponto vindo de terceiros poderia ser "farmado" com
 * contas combinadas e não representa progresso real.
 */

export type GuildEntityType = "contract" | "goal";
export type GuildShareStatus = "pending" | "accepted" | "declined" | "revoked";
export type GuildCheerKind = "testemunho" | "incentivo";

export class GuildError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** Limites (constantes de regra de negócio, não de UI). */
export const GUILD_LIMITS = {
  invitesPerDay: 20,
  partnersPerItem: 10,
  incentivesPerDayPerShare: 3,
  cheerTextMax: 140,
  messageMax: 280,
} as const;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

const ENTITY_LABEL: Record<GuildEntityType, string> = { contract: "contrato", goal: "meta" };

// ---------------------------------------------------------------------
// Resumo público (o que o parceiro pode ver)
// ---------------------------------------------------------------------

export interface GuildSummary {
  entityType: GuildEntityType;
  title: string;
  /** Só contratos têm dificuldade. */
  difficulty: string | null;
  progressPct: number;
  /** Obrigações concluídas/total (contrato) — null para meta. */
  obligations: { done: number; total: number } | null;
  dueDate: string | null;
  status: string;
  /** Dias consecutivos (até hoje/ontem, no fuso do dono) com algum avanço registrado. */
  streakDays: number;
  lastAdvanceDay: string | null;
}

const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

async function advanceDayKeys(db: Client, ownerId: string, sql: string, args: Array<string>): Promise<string[]> {
  const rows = await db.execute({ sql, args });
  const tz = await userTimezone(db, ownerId);
  const keys = new Set<string>();
  for (const r of rows.rows) {
    const at = r.at;
    if (typeof at !== "string" || !at) continue;
    const d = new Date(normalizeStoredUtc(at));
    if (!Number.isNaN(d.getTime())) keys.add(dayKeyIn(d, tz));
  }
  return [...keys].sort();
}

/**
 * Monta o resumo de um item do dono. Devolve null quando o item não existe
 * mais (ou não é do dono) — o compartilhamento então aparece como "removido".
 * Todas as queries filtram owner_id: o share só aponta, quem garante a posse é aqui.
 */
export async function buildSummary(db: Client, ownerId: string, entityType: GuildEntityType, entityId: string): Promise<GuildSummary | null> {
  const today = await todayKeyFor(db, ownerId);
  if (entityType === "contract") {
    const r = await db.execute({
      sql: `SELECT c.title, c.difficulty, c.status, c.due_date,
              (SELECT COUNT(*) FROM tasks t WHERE t.contract_id = c.id AND t.owner_id = c.owner_id) AS total,
              (SELECT COUNT(*) FROM tasks t WHERE t.contract_id = c.id AND t.owner_id = c.owner_id AND t.status = 'Concluído') AS done
            FROM contracts c WHERE c.id = ? AND c.owner_id = ?`,
      args: [entityId, ownerId],
    });
    const row = r.rows[0];
    if (!row) return null;
    const total = Number(row.total ?? 0);
    const done = Number(row.done ?? 0);
    const days = await advanceDayKeys(
      db,
      ownerId,
      `SELECT completed_at AS at FROM tasks WHERE owner_id = ? AND contract_id = ? AND status = 'Concluído' AND completed_at IS NOT NULL
       ORDER BY completed_at DESC LIMIT 400`,
      [ownerId, entityId],
    );
    return {
      entityType,
      title: String(row.title),
      difficulty: row.difficulty == null ? null : String(row.difficulty),
      progressPct: String(row.status) === "concluido" ? 100 : total === 0 ? 0 : clampPct((done / total) * 100),
      obligations: { done, total },
      dueDate: row.due_date == null ? null : String(row.due_date).slice(0, 10),
      status: String(row.status),
      streakDays: computeStreak(days, today),
      lastAdvanceDay: days.at(-1) ?? null,
    };
  }

  const r = await db.execute({
    sql: `SELECT g.title, g.kind, g.status, g.due_date, g.current_value, g.target_value,
            (SELECT COUNT(*) FROM tasks t WHERE t.goal_id = g.id AND t.owner_id = g.owner_id) AS linked_total,
            (SELECT COUNT(*) FROM tasks t WHERE t.goal_id = g.id AND t.owner_id = g.owner_id AND t.status = 'Concluído') AS linked_done
          FROM goals g WHERE g.id = ? AND g.owner_id = ?`,
    args: [entityId, ownerId],
  });
  const row = r.rows[0];
  if (!row) return null;
  // Mesma regra de progresso da tela de Metas (goals.routes / MetasPage).
  const kind = String(row.kind);
  const current = Number(row.current_value ?? 0);
  const target = row.target_value == null ? null : Number(row.target_value);
  const linkedTotal = Number(row.linked_total ?? 0);
  const linkedDone = Number(row.linked_done ?? 0);
  let pct = 0;
  if (String(row.status) === "done") pct = 100;
  else if (kind === "task_based" && linkedTotal > 0) pct = clampPct((linkedDone / linkedTotal) * 100);
  else if (kind === "percentage" || kind === "task_based") pct = clampPct(current);
  else if (kind === "numeric" && target) pct = clampPct((current / target) * 100);

  const days = await advanceDayKeys(
    db,
    ownerId,
    `SELECT recorded_at AS at FROM goal_progress WHERE owner_id = ? AND goal_id = ?
     UNION ALL
     SELECT completed_at AS at FROM tasks WHERE owner_id = ? AND goal_id = ? AND status = 'Concluído' AND completed_at IS NOT NULL
     ORDER BY at DESC LIMIT 400`,
    [ownerId, entityId, ownerId, entityId],
  );
  return {
    entityType,
    title: String(row.title),
    difficulty: null,
    progressPct: pct,
    obligations: null,
    dueDate: row.due_date == null ? null : String(row.due_date).slice(0, 10),
    status: String(row.status),
    streakDays: computeStreak(days, today),
    lastAdvanceDay: days.at(-1) ?? null,
  };
}

// ---------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------

interface ShareRow {
  id: string;
  owner_id: string;
  entity_type: GuildEntityType;
  entity_id: string;
  invitee_email: string;
  invitee_user_id: string | null;
  status: GuildShareStatus;
  message: string | null;
  created_at: string;
  responded_at: string | null;
}

function toShareRow(r: Record<string, unknown>): ShareRow {
  return {
    id: String(r.id),
    owner_id: String(r.owner_id),
    entity_type: String(r.entity_type) as GuildEntityType,
    entity_id: String(r.entity_id),
    invitee_email: String(r.invitee_email),
    invitee_user_id: r.invitee_user_id == null ? null : String(r.invitee_user_id),
    status: String(r.status) as GuildShareStatus,
    message: r.message == null ? null : String(r.message),
    created_at: String(r.created_at),
    responded_at: r.responded_at == null ? null : String(r.responded_at),
  };
}

async function getUser(db: Client, userId: string) {
  const r = await db.execute({ sql: "SELECT id, name, email, email_verified FROM users WHERE id = ?", args: [userId] });
  const row = r.rows[0];
  if (!row) throw new GuildError("Usuário não encontrado.", 404);
  return { id: String(row.id), name: String(row.name), email: normalizeEmail(String(row.email)), verified: Number(row.email_verified) === 1 };
}

async function entityTitle(db: Client, ownerId: string, type: GuildEntityType, id: string): Promise<string | null> {
  const table = type === "contract" ? "contracts" : "goals";
  const r = await db.execute({ sql: `SELECT title FROM ${table} WHERE id = ? AND owner_id = ?`, args: [id, ownerId] });
  return r.rows[0] ? String(r.rows[0].title) : null;
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
    console.warn("[guilda] push não enviado:", err instanceof Error ? err.message.slice(0, 120) : "erro desconhecido");
  }
}

// ---------------------------------------------------------------------
// Dono: convidar, listar, revogar
// ---------------------------------------------------------------------

export interface InviteInput {
  entityType: GuildEntityType;
  entityId: string;
  email: string;
  message?: string | null;
}

export interface OwnerShareView {
  id: string;
  entityType: GuildEntityType;
  entityId: string;
  entityTitle: string | null;
  inviteeEmail: string;
  /** Nome do parceiro só depois que ele aceita. */
  partnerName: string | null;
  status: GuildShareStatus;
  message: string | null;
  createdAt: string;
  respondedAt: string | null;
  cheers: Array<{ id: string; kind: GuildCheerKind; text: string | null; dayKey: string; createdAt: string }>;
  testimonyCount: number;
}

export async function createInvite(db: Client, ownerId: string, input: InviteInput): Promise<{ share: OwnerShareView; emailSent: boolean }> {
  const owner = await getUser(db, ownerId);
  const email = normalizeEmail(input.email);
  const title = await entityTitle(db, ownerId, input.entityType, input.entityId);
  // 404 também para item de outro usuário — não revela que ele existe.
  if (!title) throw new GuildError(`${input.entityType === "contract" ? "Contrato" : "Meta"} não encontrado.`, 404);
  if (email === owner.email) throw new GuildError("Você não pode convidar a si mesmo.");

  const recent = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM guild_shares WHERE owner_id = ? AND created_at >= datetime('now', '-1 day')",
    args: [ownerId],
  });
  if (Number(recent.rows[0]?.n ?? 0) >= GUILD_LIMITS.invitesPerDay) {
    throw new GuildError(`Limite de ${GUILD_LIMITS.invitesPerDay} convites por dia atingido. Tente amanhã.`, 429);
  }
  const live = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM guild_shares WHERE owner_id = ? AND entity_type = ? AND entity_id = ? AND status IN ('pending', 'accepted')",
    args: [ownerId, input.entityType, input.entityId],
  });
  if (Number(live.rows[0]?.n ?? 0) >= GUILD_LIMITS.partnersPerItem) {
    throw new GuildError(`Cada item aceita até ${GUILD_LIMITS.partnersPerItem} parceiros.`);
  }

  const id = nanoid();
  const message = input.message?.trim() ? input.message.trim().slice(0, GUILD_LIMITS.messageMax) : null;
  try {
    await db.execute({
      sql: `INSERT INTO guild_shares (id, owner_id, entity_type, entity_id, invitee_email, status, message)
            VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      args: [id, ownerId, input.entityType, input.entityId, email, message],
    });
  } catch (err) {
    if (err instanceof Error && /UNIQUE/i.test(err.message)) {
      throw new GuildError("Esse e-mail já foi convidado para este item.", 409);
    }
    throw err;
  }

  // Aviso por e-mail (só se o SMTP estiver configurado; sendMail nunca lança).
  const label = ENTITY_LABEL[input.entityType];
  const webOrigin = (process.env.WEB_ORIGIN ?? "").replace(/\/$/, "");
  const bodyHtml = `<p style="margin:0 0 10px;">${escapeHtml(owner.name)} chamou você para acompanhar a ${label === "meta" ? "meta" : "missão do contrato"} <strong>${escapeHtml(title)}</strong> como parceiro de compromisso.</p>
    ${message ? `<p style="margin:0 0 10px;font-style:italic;">“${escapeHtml(message)}”</p>` : ""}
    <p style="margin:0;">Você verá só um resumo (progresso, prazo e sequência) e poderá deixar testemunhos e incentivos. Se ainda não tem conta no LifeOS, crie uma com este e-mail para aceitar.</p>`;
  const emailSent = await sendMail({
    to: email,
    subject: `${owner.name} chamou você para a Guilda — LifeOS`,
    html: lifeOsEmailShell({
      preheader: `${owner.name} quer você como parceiro de compromisso.`,
      eyebrow: "Guilda LifeOS",
      title: "Convite para a Guilda",
      bodyHtml,
      ctaLabel: webOrigin ? "Ver convite" : undefined,
      ctaUrl: webOrigin ? `${webOrigin}/guilda` : undefined,
    }),
  });

  // Aviso no app (push) se já existir conta verificada com esse e-mail.
  const existing = await db.execute({ sql: "SELECT id FROM users WHERE lower(email) = ? AND email_verified = 1", args: [email] });
  const inviteeId = existing.rows[0]?.id;
  if (typeof inviteeId === "string") {
    await notifyUser(db, inviteeId, { title: "Convite da Guilda", body: `${owner.name} quer você como parceiro de compromisso.`, url: "/guilda" });
  }

  const share = (await listOwnerShares(db, ownerId, { entityType: input.entityType, entityId: input.entityId })).find((s) => s.id === id);
  if (!share) throw new GuildError("Convite não encontrado.", 404);
  return { share, emailSent };
}

export async function listOwnerShares(
  db: Client,
  ownerId: string,
  filter: { entityType?: GuildEntityType; entityId?: string } = {},
): Promise<OwnerShareView[]> {
  const conds = ["s.owner_id = ?"];
  const args: string[] = [ownerId];
  if (filter.entityType) {
    conds.push("s.entity_type = ?");
    args.push(filter.entityType);
  }
  if (filter.entityId) {
    conds.push("s.entity_id = ?");
    args.push(filter.entityId);
  }
  const rows = await db.execute({
    sql: `SELECT s.*, u.name AS partner_name,
            CASE s.entity_type WHEN 'contract' THEN (SELECT title FROM contracts c WHERE c.id = s.entity_id AND c.owner_id = s.owner_id)
                               ELSE (SELECT title FROM goals g WHERE g.id = s.entity_id AND g.owner_id = s.owner_id) END AS entity_title
          FROM guild_shares s LEFT JOIN users u ON u.id = s.invitee_user_id AND s.status = 'accepted'
          WHERE ${conds.join(" AND ")}
          ORDER BY CASE s.status WHEN 'accepted' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, s.created_at DESC
          LIMIT 200`,
    args,
  });
  const shares = rows.rows.map((r) => ({ row: toShareRow(r as unknown as Record<string, unknown>), raw: r }));
  if (shares.length === 0) return [];

  const ids = shares.map((s) => s.row.id);
  const cheers = await db.execute({
    sql: `SELECT id, share_id, kind, text, day_key, created_at FROM guild_cheers
          WHERE share_id IN (${ids.map(() => "?").join(",")}) ORDER BY created_at DESC`,
    args: ids,
  });
  const byShare = new Map<string, OwnerShareView["cheers"]>();
  for (const c of cheers.rows) {
    const list = byShare.get(String(c.share_id)) ?? [];
    list.push({ id: String(c.id), kind: String(c.kind) as GuildCheerKind, text: c.text == null ? null : String(c.text), dayKey: String(c.day_key), createdAt: String(c.created_at) });
    byShare.set(String(c.share_id), list);
  }

  return shares.map(({ row, raw }) => {
    const all = byShare.get(row.id) ?? [];
    return {
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      entityTitle: raw.entity_title == null ? null : String(raw.entity_title),
      inviteeEmail: row.invitee_email,
      partnerName: raw.partner_name == null ? null : String(raw.partner_name),
      status: row.status,
      message: row.message,
      createdAt: row.created_at,
      respondedAt: row.responded_at,
      cheers: all.slice(0, 30),
      testimonyCount: all.filter((c) => c.kind === "testemunho").length,
    };
  });
}

export async function revokeShare(db: Client, ownerId: string, shareId: string): Promise<void> {
  const r = await db.execute({
    sql: `UPDATE guild_shares SET status = 'revoked', responded_at = datetime('now')
          WHERE id = ? AND owner_id = ? AND status IN ('pending', 'accepted')`,
    args: [shareId, ownerId],
  });
  if (r.rowsAffected === 0) throw new GuildError("Compartilhamento não encontrado.", 404);
}

// ---------------------------------------------------------------------
// Convidado: convites, aceitar/recusar, o que foi compartilhado comigo
// ---------------------------------------------------------------------

export interface InviteView {
  id: string;
  entityType: GuildEntityType;
  entityTitle: string;
  ownerName: string;
  message: string | null;
  createdAt: string;
}

export async function listMyInvites(db: Client, userId: string): Promise<{ emailVerified: boolean; invites: InviteView[] }> {
  const me = await getUser(db, userId);
  // Sem e-mail verificado não há como provar que o convite é desta pessoa.
  if (!me.verified) return { emailVerified: false, invites: [] };
  const rows = await db.execute({
    sql: `SELECT s.id, s.entity_type, s.message, s.created_at, u.name AS owner_name,
            CASE s.entity_type WHEN 'contract' THEN (SELECT title FROM contracts c WHERE c.id = s.entity_id AND c.owner_id = s.owner_id)
                               ELSE (SELECT title FROM goals g WHERE g.id = s.entity_id AND g.owner_id = s.owner_id) END AS entity_title
          FROM guild_shares s JOIN users u ON u.id = s.owner_id
          WHERE s.invitee_email = ? AND s.status = 'pending' AND s.owner_id != ?
          ORDER BY s.created_at DESC LIMIT 100`,
    args: [me.email, userId],
  });
  return {
    emailVerified: true,
    invites: rows.rows
      // Item apagado pelo dono: o convite deixa de fazer sentido.
      .filter((r) => r.entity_title != null)
      .map((r) => ({
        id: String(r.id),
        entityType: String(r.entity_type) as GuildEntityType,
        entityTitle: String(r.entity_title),
        ownerName: String(r.owner_name),
        message: r.message == null ? null : String(r.message),
        createdAt: String(r.created_at),
      })),
  };
}

export async function respondInvite(db: Client, userId: string, shareId: string, accept: boolean): Promise<void> {
  const me = await getUser(db, userId);
  if (!me.verified) throw new GuildError("Confirme seu e-mail para responder convites da Guilda.", 403);
  const r = await db.execute({
    sql: `UPDATE guild_shares SET status = ?, invitee_user_id = ?, responded_at = datetime('now')
          WHERE id = ? AND invitee_email = ? AND status = 'pending' AND owner_id != ?
          RETURNING owner_id, entity_type, entity_id`,
    args: [accept ? "accepted" : "declined", userId, shareId, me.email, userId],
  });
  const row = r.rows[0];
  if (!row) throw new GuildError("Convite não encontrado.", 404);
  if (accept) {
    const title = await entityTitle(db, String(row.owner_id), String(row.entity_type) as GuildEntityType, String(row.entity_id));
    await notifyUser(db, String(row.owner_id), {
      title: "Novo parceiro na Guilda",
      body: `${me.name} aceitou acompanhar ${title ? `“${title}”` : "seu compromisso"}.`,
      url: "/guilda?aba=compartilhei",
    });
  }
}

/** O convidado deixa de acompanhar (equivale a recusar depois de aceitar). */
export async function leaveShare(db: Client, userId: string, shareId: string): Promise<void> {
  const r = await db.execute({
    sql: "UPDATE guild_shares SET status = 'declined', responded_at = datetime('now') WHERE id = ? AND invitee_user_id = ? AND status = 'accepted'",
    args: [shareId, userId],
  });
  if (r.rowsAffected === 0) throw new GuildError("Compartilhamento não encontrado.", 404);
}

export interface SharedWithMeView {
  id: string;
  ownerName: string;
  acceptedAt: string | null;
  /** null quando o dono apagou o item. */
  summary: GuildSummary | null;
  today: { testimonyGiven: boolean; incentivesLeft: number };
  myCheers: Array<{ id: string; kind: GuildCheerKind; text: string | null; dayKey: string; createdAt: string }>;
}

export async function listSharedWithMe(db: Client, userId: string): Promise<SharedWithMeView[]> {
  const rows = await db.execute({
    sql: `SELECT s.*, u.name AS owner_name FROM guild_shares s JOIN users u ON u.id = s.owner_id
          WHERE s.invitee_user_id = ? AND s.status = 'accepted' ORDER BY s.responded_at DESC LIMIT 100`,
    args: [userId],
  });
  if (rows.rows.length === 0) return [];
  const today = await todayKeyFor(db, userId);
  const out: SharedWithMeView[] = [];
  for (const raw of rows.rows) {
    const s = toShareRow(raw as unknown as Record<string, unknown>);
    const [summary, cheers] = await Promise.all([
      buildSummary(db, s.owner_id, s.entity_type, s.entity_id),
      db.execute({
        sql: "SELECT id, kind, text, day_key, created_at FROM guild_cheers WHERE share_id = ? AND from_user_id = ? ORDER BY created_at DESC LIMIT 20",
        args: [s.id, userId],
      }),
    ]);
    const mine = cheers.rows.map((c) => ({ id: String(c.id), kind: String(c.kind) as GuildCheerKind, text: c.text == null ? null : String(c.text), dayKey: String(c.day_key), createdAt: String(c.created_at) }));
    const todays = mine.filter((c) => c.dayKey === today);
    out.push({
      id: s.id,
      ownerName: String(raw.owner_name),
      acceptedAt: s.responded_at,
      summary,
      today: {
        testimonyGiven: todays.some((c) => c.kind === "testemunho"),
        incentivesLeft: Math.max(0, GUILD_LIMITS.incentivesPerDayPerShare - todays.filter((c) => c.kind === "incentivo").length),
      },
      myCheers: mine,
    });
  }
  return out;
}

export async function addCheer(db: Client, userId: string, shareId: string, input: { kind: GuildCheerKind; text?: string | null }) {
  const r = await db.execute({
    sql: "SELECT * FROM guild_shares WHERE id = ? AND invitee_user_id = ? AND status = 'accepted'",
    args: [shareId, userId],
  });
  const raw = r.rows[0];
  // Não aceito / revogado / de outra pessoa: mesma resposta, sem revelar nada.
  if (!raw) throw new GuildError("Compartilhamento não encontrado.", 404);
  const share = toShareRow(raw as unknown as Record<string, unknown>);
  if (!(await buildSummary(db, share.owner_id, share.entity_type, share.entity_id))) {
    throw new GuildError("Este item não está mais disponível.", 410);
  }
  const dayKey = await todayKeyFor(db, userId);
  const text = input.text?.trim() ? input.text.trim().slice(0, GUILD_LIMITS.cheerTextMax) : null;

  if (input.kind === "incentivo") {
    const n = await db.execute({
      sql: "SELECT COUNT(*) AS n FROM guild_cheers WHERE share_id = ? AND from_user_id = ? AND kind = 'incentivo' AND day_key = ?",
      args: [shareId, userId, dayKey],
    });
    if (Number(n.rows[0]?.n ?? 0) >= GUILD_LIMITS.incentivesPerDayPerShare) {
      throw new GuildError(`Até ${GUILD_LIMITS.incentivesPerDayPerShare} incentivos por dia para cada compromisso.`, 429);
    }
  }

  const id = nanoid();
  try {
    await db.execute({
      sql: "INSERT INTO guild_cheers (id, share_id, from_user_id, kind, text, day_key) VALUES (?, ?, ?, ?, ?, ?)",
      args: [id, shareId, userId, input.kind, text, dayKey],
    });
  } catch (err) {
    if (err instanceof Error && /UNIQUE/i.test(err.message)) {
      throw new GuildError("Você já deu seu testemunho hoje para este compromisso.", 409);
    }
    throw err;
  }

  if (input.kind === "testemunho") {
    const me = await getUser(db, userId);
    await notifyUser(db, share.owner_id, { title: "Testemunho da Guilda", body: `${me.name} testemunhou seu compromisso hoje.`, url: "/guilda?aba=compartilhei" });
  }
  return { id, kind: input.kind, text, dayKey };
}

/** Contagem leve para badge de menu: convites pendentes do usuário logado. */
export async function pendingInviteCount(db: Client, userId: string): Promise<number> {
  const me = await getUser(db, userId);
  if (!me.verified) return 0;
  const r = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM guild_shares WHERE invitee_email = ? AND status = 'pending' AND owner_id != ?",
    args: [me.email, userId],
  });
  return Number(r.rows[0]?.n ?? 0);
}

// ---------------------------------------------------------------------
// Timeline do dono (sem spam: aceite = 1 evento; testemunhos = 1 por dia)
// ---------------------------------------------------------------------

export async function guildTimelineEvents(db: Client, ownerId: string, from: string, to: string) {
  const [accepted, testimonies] = await Promise.all([
    db.execute({
      sql: `SELECT s.id, s.responded_at AS at, s.entity_type, u.name AS partner_name,
              CASE s.entity_type WHEN 'contract' THEN (SELECT title FROM contracts c WHERE c.id = s.entity_id AND c.owner_id = s.owner_id)
                                 ELSE (SELECT title FROM goals g WHERE g.id = s.entity_id AND g.owner_id = s.owner_id) END AS entity_title
            FROM guild_shares s JOIN users u ON u.id = s.invitee_user_id
            WHERE s.owner_id = ? AND s.status = 'accepted' AND s.responded_at >= date(?) AND s.responded_at < date(?, '+1 day')`,
      args: [ownerId, from, to],
    }),
    db.execute({
      sql: `SELECT c.day_key, COUNT(*) AS n, MIN(c.created_at) AS at FROM guild_cheers c JOIN guild_shares s ON s.id = c.share_id
            WHERE s.owner_id = ? AND c.kind = 'testemunho' AND c.day_key >= ? AND c.day_key <= ?
            GROUP BY c.day_key`,
      args: [ownerId, from, to],
    }),
  ]);
  return [
    ...accepted.rows.map((r) => ({
      type: "guild",
      icon: "🛡️",
      id: `guild-accept-${String(r.id)}`,
      label: `${String(r.partner_name)} entrou na sua Guilda${r.entity_title ? `: ${String(r.entity_title)}` : ""}`,
      at: String(r.at),
    })),
    ...testimonies.rows.map((r) => {
      const n = Number(r.n);
      return { type: "guild", icon: "🤝", id: `guild-testemunho-${String(r.day_key)}`, label: n === 1 ? "Testemunho recebido da Guilda" : `${n} testemunhos recebidos da Guilda`, at: String(r.at) };
    }),
  ];
}
