import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { notificationTriggerEmail, sendMail } from "./emailService.js";
import { sendPushToUser } from "./pushService.js";

type Db = ReturnType<typeof getDb>;

export const NOTIFICATION_TRIGGER_DEFS = {
  task_overdue: {
    label: "Tarefa vencida",
    description: "Quando uma tarefa passar do prazo sem estar concluída.",
    defaultEmail: true,
    defaultPush: true,
    defaultInApp: true,
    defaultAlertLevel: "critical",
    link: "/tarefas",
  },
  task_due_today: {
    label: "Tarefa vence hoje",
    description: "Quando uma tarefa chegar no dia do prazo.",
    defaultEmail: false,
    defaultPush: true,
    defaultInApp: true,
    defaultAlertLevel: "medium",
    link: "/tarefas",
  },
  achievement_unlocked: {
    label: "Conquista desbloqueada",
    description: "Quando uma conquista do catálogo ou um troféu customizado for conquistado.",
    defaultEmail: true,
    defaultPush: true,
    defaultInApp: true,
    defaultAlertLevel: "medium",
    link: "/conquistas",
  },
  weekly_summary: {
    label: "Resumo semanal",
    description: "E-mail com o retrato da semana e Life Score.",
    defaultEmail: false,
    defaultPush: false,
    defaultInApp: true,
    defaultAlertLevel: "soft",
    link: "/weekly-review",
  },
  daily_insight: {
    label: "Insight diário",
    description: "Quando o Copilot gerar um insight novo para o dia.",
    defaultEmail: false,
    defaultPush: true,
    defaultInApp: true,
    defaultAlertLevel: "soft",
    link: "/dashboard",
  },
} as const;

export type NotificationTriggerEvent = keyof typeof NOTIFICATION_TRIGGER_DEFS;
export type NotificationAlertLevel = "soft" | "medium" | "critical";

export interface NotificationTriggerView {
  id: string;
  eventType: NotificationTriggerEvent;
  label: string;
  description: string;
  channelEmail: boolean;
  channelPush: boolean;
  channelInApp: boolean;
  alertLevel: NotificationAlertLevel;
  active: boolean;
  updatedAt: string;
}

export interface TriggerDeliveryInput {
  title: string;
  body: string;
  url?: string;
  sourceId?: string;
  ctaLabel?: string;
}

export interface CustomNotificationTrigger {
  id: string;
  name: string;
  conditionType: "task_due_in" | "task_overdue_by";
  days: number;
  priority: "Baixa" | "Média" | "Alta" | null;
  channelEmail: boolean;
  channelPush: boolean;
  channelInApp: boolean;
  active: boolean;
}

function customRow(row: Record<string, unknown>): CustomNotificationTrigger {
  return {
    id: String(row.id),
    name: String(row.name),
    conditionType: row.condition_type as CustomNotificationTrigger["conditionType"],
    days: Number(row.days),
    priority: (row.priority as CustomNotificationTrigger["priority"]) ?? null,
    channelEmail: Number(row.channel_email) === 1,
    channelPush: Number(row.channel_push) === 1,
    channelInApp: Number(row.channel_in_app) === 1,
    active: Number(row.active) === 1,
  };
}

export async function listCustomNotificationTriggers(ownerId: string): Promise<CustomNotificationTrigger[]> {
  const result = await getDb().execute({
    sql: "SELECT * FROM custom_notification_triggers WHERE owner_id = ? ORDER BY created_at DESC",
    args: [ownerId],
  });
  return result.rows.map((row) => customRow(row as Record<string, unknown>));
}

export async function createCustomNotificationTrigger(ownerId: string, input: Omit<CustomNotificationTrigger, "id">) {
  const id = nanoid();
  await getDb().execute({
    sql: `INSERT INTO custom_notification_triggers
          (id, owner_id, name, condition_type, days, priority, channel_email, channel_push, channel_in_app, active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, ownerId, input.name, input.conditionType, input.days, input.priority,
      input.channelEmail ? 1 : 0, input.channelPush ? 1 : 0, input.channelInApp ? 1 : 0, input.active ? 1 : 0],
  });
  return { id, ...input };
}

export async function updateCustomNotificationTrigger(ownerId: string, id: string, patch: Partial<Omit<CustomNotificationTrigger, "id">>) {
  const existing = (await listCustomNotificationTriggers(ownerId)).find((item) => item.id === id);
  if (!existing) return null;
  const next = { ...existing, ...patch };
  await getDb().execute({
    sql: `UPDATE custom_notification_triggers SET name = ?, condition_type = ?, days = ?, priority = ?,
          channel_email = ?, channel_push = ?, channel_in_app = ?, active = ? WHERE id = ? AND owner_id = ?`,
    args: [next.name, next.conditionType, next.days, next.priority,
      next.channelEmail ? 1 : 0, next.channelPush ? 1 : 0, next.channelInApp ? 1 : 0, next.active ? 1 : 0, id, ownerId],
  });
  return next;
}

export async function deleteCustomNotificationTrigger(ownerId: string, id: string) {
  const result = await getDb().execute({
    sql: "DELETE FROM custom_notification_triggers WHERE id = ? AND owner_id = ?",
    args: [id, ownerId],
  });
  return result.rowsAffected > 0;
}

function rowToTrigger(row: {
  id: string;
  event_type: NotificationTriggerEvent;
  label: string;
  description: string | null;
  channel_email: number;
  channel_push: number;
  channel_in_app: number;
  alert_level: NotificationAlertLevel;
  active: number;
  updated_at: string;
}): NotificationTriggerView {
  const def = NOTIFICATION_TRIGGER_DEFS[row.event_type];
  return {
    id: row.id,
    eventType: row.event_type,
    label: row.label || def.label,
    description: row.description ?? def.description,
    channelEmail: Number(row.channel_email) === 1,
    channelPush: Number(row.channel_push) === 1,
    channelInApp: Number(row.channel_in_app) === 1,
    alertLevel: row.alert_level,
    active: Number(row.active) === 1,
    updatedAt: row.updated_at,
  };
}

export function isNotificationTriggerEvent(value: string): value is NotificationTriggerEvent {
  return Object.prototype.hasOwnProperty.call(NOTIFICATION_TRIGGER_DEFS, value);
}

export async function ensureNotificationTriggers(ownerId: string, db = getDb()) {
  const settings = await db.execute({
    sql: "SELECT weekly_email_enabled FROM user_settings WHERE user_id = ?",
    args: [ownerId],
  });
  const weeklyEmailEnabled = Number(settings.rows[0]?.weekly_email_enabled ?? 0) === 1;
  for (const [eventType, def] of Object.entries(NOTIFICATION_TRIGGER_DEFS) as Array<[NotificationTriggerEvent, typeof NOTIFICATION_TRIGGER_DEFS[NotificationTriggerEvent]]>) {
    await db.execute({
      sql: `INSERT INTO notification_triggers (
              id, owner_id, event_type, label, description, channel_email, channel_push, channel_in_app, alert_level, active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            ON CONFLICT (owner_id, event_type) DO NOTHING`,
      args: [
        nanoid(),
        ownerId,
        eventType,
        def.label,
        def.description,
        eventType === "weekly_summary" ? (weeklyEmailEnabled ? 1 : 0) : (def.defaultEmail ? 1 : 0),
        eventType === "weekly_summary" ? 0 : (def.defaultPush ? 1 : 0),
        eventType === "weekly_summary" ? 0 : (def.defaultInApp ? 1 : 0),
        def.defaultAlertLevel,
      ],
    });
  }
}

export async function listNotificationTriggers(ownerId: string): Promise<NotificationTriggerView[]> {
  const db = getDb();
  await ensureNotificationTriggers(ownerId, db);
  const result = await db.execute({
    sql: "SELECT * FROM notification_triggers WHERE owner_id = ? ORDER BY created_at ASC",
    args: [ownerId],
  });
  return (result.rows as unknown as Parameters<typeof rowToTrigger>[0][]).map(rowToTrigger);
}

export async function getNotificationTrigger(ownerId: string, eventType: NotificationTriggerEvent): Promise<NotificationTriggerView> {
  const db = getDb();
  await ensureNotificationTriggers(ownerId, db);
  const result = await db.execute({
    sql: "SELECT * FROM notification_triggers WHERE owner_id = ? AND event_type = ?",
    args: [ownerId, eventType],
  });
  return rowToTrigger(result.rows[0] as unknown as Parameters<typeof rowToTrigger>[0]);
}

export async function updateNotificationTrigger(
  ownerId: string,
  eventType: NotificationTriggerEvent,
  patch: Partial<Pick<NotificationTriggerView, "channelEmail" | "channelPush" | "channelInApp" | "alertLevel" | "active">>
) {
  const db = getDb();
  await ensureNotificationTriggers(ownerId, db);
  await db.execute({
    sql: `UPDATE notification_triggers SET
            channel_email = COALESCE(?, channel_email),
            channel_push = COALESCE(?, channel_push),
            channel_in_app = COALESCE(?, channel_in_app),
            alert_level = COALESCE(?, alert_level),
            active = COALESCE(?, active),
            updated_at = datetime('now')
          WHERE owner_id = ? AND event_type = ?`,
    args: [
      patch.channelEmail === undefined ? null : patch.channelEmail ? 1 : 0,
      patch.channelPush === undefined ? null : patch.channelPush ? 1 : 0,
      patch.channelInApp === undefined ? null : patch.channelInApp ? 1 : 0,
      patch.alertLevel ?? null,
      patch.active === undefined ? null : patch.active ? 1 : 0,
      ownerId,
      eventType,
    ],
  });
  const updated = await getNotificationTrigger(ownerId, eventType);
  if (eventType === "weekly_summary") {
    await db.execute({
      sql: `INSERT INTO user_settings (user_id, weekly_email_enabled)
            VALUES (?, ?)
            ON CONFLICT (user_id) DO UPDATE SET weekly_email_enabled = excluded.weekly_email_enabled, updated_at = datetime('now')`,
      args: [ownerId, updated.active && updated.channelEmail ? 1 : 0],
    });
  }
  return updated;
}

async function markDelivered(db: Db, ownerId: string, eventType: string, sourceId: string, channel: "email" | "push" | "in_app", date: string): Promise<string | null> {
  const id = nanoid();
  const result = await db.execute({
    sql: `INSERT OR IGNORE INTO notification_delivery_log (id, owner_id, event_type, source_id, channel, delivered_on)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, ownerId, eventType, sourceId, channel, date],
  });
  return result.rowsAffected > 0 ? id : null;
}

export async function matchingCustomTasks(ownerId: string, rule: CustomNotificationTrigger, date: string) {
  const db = getDb();
  const dueExpression = rule.conditionType === "task_due_in"
    ? "date(due_date) = date(?, '+' || ? || ' days')"
    : rule.days === 0
      ? "date(due_date) < date(?)"
      : "date(due_date) = date(?, '-' || ? || ' days')";
  const args: Array<string | number | null> = [ownerId, date];
  if (rule.conditionType === "task_due_in" || rule.days > 0) args.push(rule.days);
  args.push(rule.priority);
  const result = await db.execute({
    sql: `SELECT id, title, due_date FROM tasks WHERE owner_id = ? AND status != 'Concluído'
          AND due_date IS NOT NULL AND ${dueExpression} AND (? IS NULL OR priority = ?)
          ORDER BY due_date ASC LIMIT 10`,
    args: [...args, rule.priority],
  });
  return result.rows as unknown as Array<{ id: string; title: string; due_date: string }>;
}

async function dispatchCustomTaskTrigger(ownerId: string, rule: CustomNotificationTrigger, tasks: Array<{ id: string; title: string }>, date: string) {
  const db = getDb();
  const event = `custom_${rule.id}`;
  const source = `${rule.id}_${date}`;
  const body = tasks.slice(0, 4).map((task) => task.title).join(", ");
  const user = await db.execute({ sql: "SELECT email, email_verified FROM users WHERE id = ?", args: [ownerId] });
  const recipient = user.rows[0] as { email?: string; email_verified?: number } | undefined;
  let emailSent = false;
  let pushSent = 0;
  if (rule.channelEmail && recipient?.email && Number(recipient.email_verified) === 1) {
    const id = await markDelivered(db, ownerId, event, source, "email", date);
    if (id) {
      const email = notificationTriggerEmail({ title: rule.name, body, path: "/tarefas", ctaLabel: "Ver tarefas" });
      emailSent = await sendMail({ to: recipient.email, ...email });
      if (!emailSent) await releaseFailedDelivery(db, id);
    }
  }
  if (rule.channelPush) {
    const id = await markDelivered(db, ownerId, event, source, "push", date);
    if (id) {
      try {
        pushSent = (await sendPushToUser(ownerId, { title: rule.name, body, url: "/tarefas" })).sent;
        if (pushSent === 0) await releaseFailedDelivery(db, id);
      } catch (err) {
        console.error("[trigger] falha ao enviar push customizado:", err);
        await releaseFailedDelivery(db, id);
      }
    }
  }
  return { emailSent, pushSent };
}

async function releaseFailedDelivery(db: Db, id: string) {
  await db.execute({ sql: "DELETE FROM notification_delivery_log WHERE id = ?", args: [id] });
}

export async function dispatchTriggerNotification(
  ownerId: string,
  eventType: NotificationTriggerEvent,
  input: TriggerDeliveryInput
): Promise<{ emailSent: boolean; pushSent: number; skipped: boolean }> {
  const db = getDb();
  const rule = await getNotificationTrigger(ownerId, eventType);
  if (!rule.active) return { emailSent: false, pushSent: 0, skipped: true };

  const user = await db.execute({ sql: "SELECT email, email_verified FROM users WHERE id = ?", args: [ownerId] });
  const userRow = user.rows[0] as unknown as { email?: string; email_verified?: number } | undefined;
  const sourceId = input.sourceId ?? eventType;
  const today = new Date().toISOString().slice(0, 10);
  let emailSent = false;
  let pushSent = 0;

  if (rule.channelEmail && userRow?.email && Number(userRow.email_verified) === 1) {
    const deliveryId = await markDelivered(db, ownerId, eventType, sourceId, "email", today);
    if (deliveryId) {
      const email = notificationTriggerEmail({
        title: input.title,
        body: input.body,
        path: input.url ?? NOTIFICATION_TRIGGER_DEFS[eventType].link,
        ctaLabel: input.ctaLabel ?? "Abrir no LifeOS",
      });
      emailSent = await sendMail({ to: userRow.email, ...email });
      if (!emailSent) await releaseFailedDelivery(db, deliveryId);
    }
  }

  if (rule.channelPush) {
    const deliveryId = await markDelivered(db, ownerId, eventType, sourceId, "push", today);
    if (deliveryId) {
      try {
        const result = await sendPushToUser(ownerId, { title: input.title, body: input.body, url: input.url ?? NOTIFICATION_TRIGGER_DEFS[eventType].link });
        pushSent = result.sent;
        if (pushSent === 0) await releaseFailedDelivery(db, deliveryId);
      } catch (err) {
        console.error("[trigger] falha ao enviar push:", err);
        await releaseFailedDelivery(db, deliveryId);
      }
    }
  }

  return { emailSent, pushSent, skipped: false };
}

export async function runTaskDeadlineTriggers(ownerId: string, date = new Date().toISOString().slice(0, 10)) {
  const db = getDb();
  await ensureNotificationTriggers(ownerId, db);
  const [overdue, dueToday] = await Promise.all([
    db.execute({
      sql: `SELECT id, title, due_date FROM tasks
            WHERE owner_id = ? AND status != 'Concluído' AND due_date IS NOT NULL AND date(due_date) < date(?)
            ORDER BY due_date ASC LIMIT 10`,
      args: [ownerId, date],
    }),
    db.execute({
      sql: `SELECT id, title, due_date FROM tasks
            WHERE owner_id = ? AND status != 'Concluído' AND due_date IS NOT NULL AND date(due_date) = date(?)
            ORDER BY due_date ASC LIMIT 10`,
      args: [ownerId, date],
    }),
  ]);

  const results: Array<{ eventType: NotificationTriggerEvent; count: number; emailSent: boolean; pushSent: number }> = [];
  const overdueRows = overdue.rows as unknown as Array<{ id: string; title: string }>;
  const dueRows = dueToday.rows as unknown as Array<{ id: string; title: string }>;

  if (overdueRows.length > 0) {
    const titles = overdueRows.slice(0, 4).map((t) => t.title).join(", ");
    const delivered = await dispatchTriggerNotification(ownerId, "task_overdue", {
      title: overdueRows.length === 1 ? "Tarefa vencida" : `${overdueRows.length} tarefas vencidas`,
      body: titles,
      url: "/tarefas",
      sourceId: `task_overdue_${date}`,
      ctaLabel: "Ver tarefas",
    });
    results.push({ eventType: "task_overdue", count: overdueRows.length, emailSent: delivered.emailSent, pushSent: delivered.pushSent });
  }

  if (dueRows.length > 0) {
    const titles = dueRows.slice(0, 4).map((t) => t.title).join(", ");
    const delivered = await dispatchTriggerNotification(ownerId, "task_due_today", {
      title: dueRows.length === 1 ? "Tarefa vence hoje" : `${dueRows.length} tarefas vencem hoje`,
      body: titles,
      url: "/tarefas",
      sourceId: `task_due_today_${date}`,
      ctaLabel: "Planejar agora",
    });
    results.push({ eventType: "task_due_today", count: dueRows.length, emailSent: delivered.emailSent, pushSent: delivered.pushSent });
  }

  const customRules = await listCustomNotificationTriggers(ownerId);
  for (const rule of customRules.filter((item) => item.active)) {
    const tasks = await matchingCustomTasks(ownerId, rule, date);
    if (tasks.length === 0) continue;
    const delivered = await dispatchCustomTaskTrigger(ownerId, rule, tasks, date);
    results.push({ eventType: rule.conditionType === "task_due_in" ? "task_due_today" : "task_overdue", count: tasks.length, ...delivered });
  }

  return { date, results };
}

export async function runTaskDeadlineTriggersForAll(date = new Date().toISOString().slice(0, 10)) {
  const db = getDb();
  const owners = await db.execute({
    sql: "SELECT id AS owner_id FROM users",
    args: [],
  });
  let checked = 0;
  let fired = 0;
  for (const row of owners.rows as unknown as Array<{ owner_id: string }>) {
    checked += 1;
    const result = await runTaskDeadlineTriggers(row.owner_id, date);
    fired += result.results.reduce((sum, item) => sum + item.count, 0);
  }
  return { date, checked, fired };
}
