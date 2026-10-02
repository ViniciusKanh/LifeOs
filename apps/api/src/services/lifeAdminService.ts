import { nanoid } from "nanoid";
import type { getDb } from "../db/client.js";
import { mimeFromDataUri } from "../validators/attachment.schema.js";
import type { CreateLifeAdminInput, MarkLifeAdminDoneInput, UpdateLifeAdminInput } from "../validators/lifeAdmin.schema.js";
import { sendPushToUser } from "./pushService.js";

/**
 * Administração da vida: vencimentos, manutenções, documentos e contas.
 * Diferente de uma tarefa, o item é PERMANENTE: "marcar como feito" grava
 * o histórico e empurra o próximo vencimento pela recorrência (em meses),
 * em vez de concluir e sumir. O status (atrasado / em breve / em dia) é
 * sempre calculado a partir das datas reais, nunca guardado.
 */

type Db = ReturnType<typeof getDb>;

export type LifeAdminUrgency = "overdue" | "today" | "soon" | "ok" | "no_date";

export interface LifeAdminItem {
  id: string;
  kind: string;
  title: string;
  category: string;
  dueDate: string | null;
  recurrenceMonths: number | null;
  remindDaysBefore: number;
  amount: number | null;
  reference: string | null;
  location: string | null;
  notes: string | null;
  fileName: string | null;
  fileMime: string | null;
  hasFile: boolean;
  status: "active" | "archived";
  lastDoneAt: string | null;
  createdAt: string;
  updatedAt: string;
  daysLeft: number | null;
  urgency: LifeAdminUrgency;
}

export interface LifeAdminHistoryEntry {
  id: string;
  doneAt: string;
  dueDate: string | null;
  amount: number | null;
  note: string | null;
}

export function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Soma meses mantendo o dia quando possível (31/01 + 1 mês = 28/02 ou 29/02). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function urgencyOf(dueDate: string | null, remindDaysBefore: number, today = todayKey()): { daysLeft: number | null; urgency: LifeAdminUrgency } {
  if (!dueDate) return { daysLeft: null, urgency: "no_date" };
  const daysLeft = daysBetween(today, dueDate);
  if (daysLeft < 0) return { daysLeft, urgency: "overdue" };
  if (daysLeft === 0) return { daysLeft, urgency: "today" };
  if (daysLeft <= remindDaysBefore) return { daysLeft, urgency: "soon" };
  return { daysLeft, urgency: "ok" };
}

function mapRow(r: Record<string, unknown>, today = todayKey()): LifeAdminItem {
  const dueDate = (r.due_date as string | null) ?? null;
  const remind = Number(r.remind_days_before ?? 15);
  const status = (r.status as "active" | "archived") ?? "active";
  const u = urgencyOf(status === "active" ? dueDate : null, remind, today);
  return {
    id: String(r.id),
    kind: String(r.kind),
    title: String(r.title),
    category: String(r.category ?? "outro"),
    dueDate,
    recurrenceMonths: r.recurrence_months == null ? null : Number(r.recurrence_months),
    remindDaysBefore: remind,
    amount: r.amount == null ? null : Number(r.amount),
    reference: (r.reference as string | null) ?? null,
    location: (r.location as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    fileName: (r.file_name as string | null) ?? null,
    fileMime: (r.file_mime as string | null) ?? null,
    hasFile: Number(r.has_file ?? 0) === 1,
    status,
    lastDoneAt: (r.last_done_at as string | null) ?? null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    daysLeft: status === "active" ? u.daysLeft : null,
    urgency: status === "active" ? u.urgency : "no_date",
  };
}

// Nunca devolve o arquivo na listagem (pode ter MBs) — só a flag has_file.
const LIST_COLUMNS = `id, kind, title, category, due_date, recurrence_months, remind_days_before, amount, reference, location, notes,
  file_name, file_mime, CASE WHEN file_data_uri IS NULL THEN 0 ELSE 1 END AS has_file, status, last_done_at, created_at, updated_at`;

const URGENCY_ORDER: Record<LifeAdminUrgency, number> = { overdue: 0, today: 1, soon: 2, ok: 3, no_date: 4 };

export async function listLifeAdminItems(db: Db, ownerId: string, includeArchived = false): Promise<LifeAdminItem[]> {
  const res = await db.execute({
    sql: `SELECT ${LIST_COLUMNS} FROM life_admin_items WHERE owner_id = ? ${includeArchived ? "" : "AND status = 'active'"}`,
    args: [ownerId],
  });
  const today = todayKey();
  return (res.rows as unknown as Array<Record<string, unknown>>)
    .map((r) => mapRow(r, today))
    .sort(
      (a, b) =>
        URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency] ||
        (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
        a.title.localeCompare(b.title, "pt-BR")
    );
}

export async function getLifeAdminItem(db: Db, ownerId: string, id: string) {
  const res = await db.execute({ sql: `SELECT ${LIST_COLUMNS} FROM life_admin_items WHERE id = ? AND owner_id = ?`, args: [id, ownerId] });
  const row = res.rows[0] as unknown as Record<string, unknown> | undefined;
  if (!row) return null;
  const hist = await db.execute({
    sql: "SELECT id, done_at, due_date, amount, note FROM life_admin_history WHERE item_id = ? AND owner_id = ? ORDER BY done_at DESC, created_at DESC LIMIT 50",
    args: [id, ownerId],
  });
  const history: LifeAdminHistoryEntry[] = (hist.rows as unknown as Array<Record<string, unknown>>).map((h) => ({
    id: String(h.id),
    doneAt: String(h.done_at),
    dueDate: (h.due_date as string | null) ?? null,
    amount: h.amount == null ? null : Number(h.amount),
    note: (h.note as string | null) ?? null,
  }));
  return { ...mapRow(row), history };
}

export async function getLifeAdminFile(db: Db, ownerId: string, id: string) {
  const res = await db.execute({ sql: "SELECT file_data_uri, file_name, file_mime FROM life_admin_items WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  const row = res.rows[0] as unknown as { file_data_uri: string | null; file_name: string | null; file_mime: string | null } | undefined;
  return row?.file_data_uri ? { dataUri: row.file_data_uri, fileName: row.file_name, mime: row.file_mime } : null;
}

export async function createLifeAdminItem(db: Db, ownerId: string, d: CreateLifeAdminInput) {
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO life_admin_items (id, owner_id, kind, title, category, due_date, recurrence_months, remind_days_before, amount, reference, location, notes, file_data_uri, file_name, file_mime)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      ownerId,
      d.kind,
      d.title,
      d.category,
      d.dueDate ?? null,
      d.recurrenceMonths ?? null,
      d.remindDaysBefore,
      d.amount ?? null,
      d.reference ?? null,
      d.location ?? null,
      d.notes ?? null,
      d.fileDataUri ?? null,
      d.fileDataUri ? d.fileName ?? null : null,
      d.fileDataUri ? mimeFromDataUri(d.fileDataUri) : null,
    ],
  });
  return getLifeAdminItem(db, ownerId, id);
}

const FIELD_MAP: Record<string, string> = {
  kind: "kind",
  title: "title",
  category: "category",
  dueDate: "due_date",
  recurrenceMonths: "recurrence_months",
  remindDaysBefore: "remind_days_before",
  amount: "amount",
  reference: "reference",
  location: "location",
  notes: "notes",
  status: "status",
};

export async function updateLifeAdminItem(db: Db, ownerId: string, id: string, patch: UpdateLifeAdminInput) {
  const sets: string[] = [];
  const args: Array<string | number | null> = [];
  for (const [key, col] of Object.entries(FIELD_MAP)) {
    const v = (patch as Record<string, unknown>)[key];
    if (v !== undefined) {
      sets.push(`${col} = ?`);
      args.push((v as string | number | null) ?? null);
    }
  }
  if (patch.fileDataUri !== undefined) {
    sets.push("file_data_uri = ?", "file_name = ?", "file_mime = ?");
    args.push(patch.fileDataUri, patch.fileDataUri ? patch.fileName ?? null : null, patch.fileDataUri ? mimeFromDataUri(patch.fileDataUri) : null);
  }
  if (sets.length > 0) {
    sets.push("updated_at = datetime('now')");
    const res = await db.execute({ sql: `UPDATE life_admin_items SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`, args: [...args, id, ownerId] });
    if (res.rowsAffected === 0) return null;
  }
  return getLifeAdminItem(db, ownerId, id);
}

export async function deleteLifeAdminItem(db: Db, ownerId: string, id: string): Promise<boolean> {
  const res = await db.execute({ sql: "DELETE FROM life_admin_items WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  return res.rowsAffected > 0;
}

/**
 * "Feito": grava no histórico e calcula o próximo vencimento.
 * - Com recorrência: próximo = vencimento atual + N meses (renovação ancorada
 *   no vencimento, não no dia em que foi pago — IPVA de 2027 continua em janeiro).
 *   Se o item não tinha data, ancora no dia em que foi feito.
 * - Sem recorrência: usa `nextDueDate` se veio (ex.: nova validade da CNH);
 *   senão, contas/manutenções avulsas são arquivadas.
 */
export async function markLifeAdminDone(db: Db, ownerId: string, id: string, d: MarkLifeAdminDoneInput) {
  const res = await db.execute({
    sql: "SELECT kind, due_date, recurrence_months, amount FROM life_admin_items WHERE id = ? AND owner_id = ?",
    args: [id, ownerId],
  });
  const row = res.rows[0] as unknown as { kind: string; due_date: string | null; recurrence_months: number | null; amount: number | null } | undefined;
  if (!row) return null;

  const doneAt = d.doneAt ?? todayKey();
  let nextDue: string | null = row.due_date;
  let archive = false;
  if (row.recurrence_months) {
    nextDue = addMonths(row.due_date ?? doneAt, Number(row.recurrence_months));
    // Se estava muito atrasado, pula ciclos até o próximo vencimento futuro.
    while (nextDue < doneAt) nextDue = addMonths(nextDue, Number(row.recurrence_months));
  } else if (d.nextDueDate) {
    nextDue = d.nextDueDate;
  } else if (row.kind === "conta" || row.kind === "manutencao") {
    archive = true;
  } else {
    nextDue = null;
  }

  await db.batch(
    [
      {
        sql: "INSERT INTO life_admin_history (id, owner_id, item_id, done_at, due_date, amount, note) VALUES (?, ?, ?, ?, ?, ?, ?)",
        args: [nanoid(), ownerId, id, doneAt, row.due_date, d.amount ?? row.amount ?? null, d.note ?? null],
      },
      {
        sql: `UPDATE life_admin_items SET due_date = ?, last_done_at = ?, status = ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?`,
        args: [nextDue, doneAt, archive ? "archived" : "active", id, ownerId],
      },
    ],
    "write"
  );
  return getLifeAdminItem(db, ownerId, id);
}

export async function deleteLifeAdminHistory(db: Db, ownerId: string, itemId: string, historyId: string): Promise<boolean> {
  const res = await db.execute({
    sql: "DELETE FROM life_admin_history WHERE id = ? AND item_id = ? AND owner_id = ?",
    args: [historyId, itemId, ownerId],
  });
  return res.rowsAffected > 0;
}

export interface LifeAdminSummary {
  overdue: number;
  dueSoon: number;
  next: Array<Pick<LifeAdminItem, "id" | "title" | "kind" | "category" | "dueDate" | "daysLeft" | "urgency">>;
}

/** Resumo para Hoje/Dashboard/notificações: só o que pede atenção (atrasado, hoje, dentro da janela de aviso). */
export async function getLifeAdminSummary(db: Db, ownerId: string): Promise<LifeAdminSummary> {
  const items = await listLifeAdminItems(db, ownerId);
  const attention = items.filter((i) => i.urgency === "overdue" || i.urgency === "today" || i.urgency === "soon");
  return {
    overdue: attention.filter((i) => i.urgency === "overdue").length,
    dueSoon: attention.filter((i) => i.urgency !== "overdue").length,
    next: attention.slice(0, 6).map(({ id, title, kind, category, dueDate, daysLeft, urgency }) => ({ id, title, kind, category, dueDate, daysLeft, urgency })),
  };
}

/**
 * Lembretes por push (rodado pelo cron diário de gatilhos). Três estágios
 * por vencimento — "antes" (entrou na janela de aviso), "hoje" e "atrasado" —
 * cada um enviado no máximo uma vez (life_admin_reminder_log).
 */
export async function runLifeAdminReminders(db: Db, ownerId: string, today = todayKey()): Promise<number> {
  const items = await listLifeAdminItems(db, ownerId);
  const fresh: LifeAdminItem[] = [];
  for (const item of items) {
    if (!item.dueDate) continue;
    const stage = item.urgency === "overdue" ? "atrasado" : item.urgency === "today" ? "hoje" : item.urgency === "soon" ? "antes" : null;
    if (!stage) continue;
    const ins = await db.execute({
      sql: "INSERT OR IGNORE INTO life_admin_reminder_log (owner_id, item_id, due_date, stage) VALUES (?, ?, ?, ?)",
      args: [ownerId, item.id, item.dueDate, stage],
    });
    if (ins.rowsAffected > 0) fresh.push(item);
  }
  if (fresh.length === 0) return 0;

  const describe = (i: LifeAdminItem) =>
    i.urgency === "overdue" ? `${i.title} (venceu há ${Math.abs(i.daysLeft ?? 0)}d)` : i.urgency === "today" ? `${i.title} (hoje)` : `${i.title} (em ${i.daysLeft}d)`;
  try {
    await sendPushToUser(ownerId, {
      title: fresh.length === 1 ? "Lembrete de vencimento" : `${fresh.length} vencimentos pedem atenção`,
      body: fresh.slice(0, 4).map(describe).join(" · "),
      url: "/administracao",
    });
  } catch (err) {
    console.error("[life-admin] falha ao enviar push:", err);
  }
  return fresh.length;
}

export async function runLifeAdminRemindersForAll(db: Db, today = todayKey()) {
  const owners = await db.execute({ sql: "SELECT DISTINCT owner_id FROM life_admin_items WHERE status = 'active' AND due_date IS NOT NULL", args: [] });
  let fired = 0;
  for (const r of owners.rows as unknown as Array<{ owner_id: string }>) fired += await runLifeAdminReminders(db, r.owner_id, today);
  return { checked: owners.rows.length, fired };
}
