import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import {
  createCustomNotificationTrigger,
  deleteCustomNotificationTrigger,
  getNotificationTrigger,
  isNotificationTriggerEvent,
  listCustomNotificationTriggers,
  listNotificationTriggers,
  matchingCustomTasks,
  runTaskDeadlineTriggers,
  updateCustomNotificationTrigger,
  updateNotificationTrigger,
} from "../services/notificationTriggersService.js";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

interface LiveNotification {
  id: string;
  kind: "task_overdue" | "task_due_today" | "daily_insight" | "custom_trigger" | "habit_pending" | "weekly_review_pending";
  title: string;
  body: string;
  link: string;
  severity: "alta" | "media" | "baixa";
}

const triggerPatchSchema = z.object({
  channelEmail: z.boolean().optional(),
  channelPush: z.boolean().optional(),
  channelInApp: z.boolean().optional(),
  alertLevel: z.enum(["soft", "medium", "critical"]).optional(),
  active: z.boolean().optional(),
});

const customTriggerBaseSchema = z.object({
  name: z.string().trim().min(2).max(80),
  conditionType: z.enum(["task_due_in", "task_overdue_by"]),
  days: z.number().int().min(0).max(365),
  priority: z.enum(["Baixa", "Média", "Alta"]).nullable(),
  channelEmail: z.boolean(),
  channelPush: z.boolean(),
  channelInApp: z.boolean(),
  active: z.boolean(),
});
const customTriggerSchema = customTriggerBaseSchema.refine((rule) => rule.channelEmail || rule.channelPush || rule.channelInApp, {
  message: "Escolha pelo menos um canal de aviso.",
});

notificationsRouter.get("/triggers/custom", async (req, res) => {
  return res.json(await listCustomNotificationTriggers(req.user!.id));
});

notificationsRouter.post("/triggers/custom", async (req, res) => {
  const parsed = customTriggerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Gatilho inválido." });
  return res.status(201).json(await createCustomNotificationTrigger(req.user!.id, parsed.data));
});

notificationsRouter.patch("/triggers/custom/:id", async (req, res) => {
  const parsed = customTriggerBaseSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Gatilho inválido." });
  const existing = (await listCustomNotificationTriggers(req.user!.id)).find((rule) => rule.id === req.params.id);
  if (!existing) return res.status(404).json({ error: "Gatilho não encontrado." });
  const validMerged = customTriggerSchema.safeParse({ ...existing, ...parsed.data });
  if (!validMerged.success) return res.status(400).json({ error: validMerged.error.issues[0]?.message ?? "Gatilho inválido." });
  const updated = await updateCustomNotificationTrigger(req.user!.id, req.params.id, parsed.data);
  return updated ? res.json(updated) : res.status(404).json({ error: "Gatilho não encontrado." });
});

notificationsRouter.delete("/triggers/custom/:id", async (req, res) => {
  const deleted = await deleteCustomNotificationTrigger(req.user!.id, req.params.id);
  return deleted ? res.status(204).send() : res.status(404).json({ error: "Gatilho não encontrado." });
});

function mondayOf(date = new Date()): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function severityFromAlertLevel(alertLevel: "soft" | "medium" | "critical"): "alta" | "media" | "baixa" {
  if (alertLevel === "critical") return "alta";
  if (alertLevel === "medium") return "media";
  return "baixa";
}

notificationsRouter.get("/triggers", async (req, res) => {
  const triggers = await listNotificationTriggers(req.user!.id);
  return res.json(triggers);
});

notificationsRouter.patch("/triggers/:eventType", async (req, res) => {
  if (!isNotificationTriggerEvent(req.params.eventType)) {
    return res.status(404).json({ error: "Gatilho não encontrado." });
  }
  const parsed = triggerPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const updated = await updateNotificationTrigger(req.user!.id, req.params.eventType, parsed.data);
  return res.json(updated);
});

notificationsRouter.post("/triggers/run", async (req, res) => {
  const result = await runTaskDeadlineTriggers(req.user!.id);
  return res.json(result);
});

/**
 * GET /api/notifications/live — notificações calculadas na hora a
 * partir de dados reais (nunca persistidas/agendadas ainda — isso é
 * trabalho futuro de um worker de envio). Cobre: tarefas atrasadas,
 * tarefas que vencem hoje, hábitos ainda não cumpridos hoje e a
 * revisão semanal da semana atual ainda não preenchida.
 */
notificationsRouter.get("/live", async (req, res) => {
  const db = getDb();
  const ownerId = req.user!.id;
  const today = new Date().toISOString().slice(0, 10);
  const [overdueRule, dueTodayRule, dailyInsightRule] = await Promise.all([
    getNotificationTrigger(ownerId, "task_overdue"),
    getNotificationTrigger(ownerId, "task_due_today"),
    getNotificationTrigger(ownerId, "daily_insight"),
  ]);

  const [overdueTasks, dueTodayTasks, pendingHabits, weeklyReview, dailyInsight] = await Promise.all([
    db.execute({
      sql: `SELECT id, title FROM tasks WHERE owner_id = ? AND status != 'Concluído'
            AND due_date IS NOT NULL AND date(due_date) < date(?) ORDER BY due_date ASC LIMIT 5`,
      args: [ownerId, today],
    }),
    db.execute({
      sql: `SELECT id, title FROM tasks WHERE owner_id = ? AND status != 'Concluído'
            AND due_date IS NOT NULL AND date(due_date) = date(?) ORDER BY due_date ASC LIMIT 5`,
      args: [ownerId, today],
    }),
    db.execute({
      sql: `SELECT h.id, h.name FROM habits h WHERE h.owner_id = ? AND h.archived_at IS NULL
            AND h.id NOT IN (
              SELECT habit_id FROM habit_entries WHERE owner_id = ? AND entry_date = ? AND count >= (SELECT target_count FROM habits WHERE id = habit_id)
            ) LIMIT 5`,
      args: [ownerId, ownerId, today],
    }),
    db.execute({
      sql: "SELECT id FROM weekly_reviews WHERE owner_id = ? AND week_start_date = ?",
      args: [ownerId, mondayOf()],
    }),
    db.execute({
      sql: "SELECT text FROM daily_insights WHERE owner_id = ? AND insight_date = ? LIMIT 1",
      args: [ownerId, today],
    }),
  ]);

  const notifications: LiveNotification[] = [];

  for (const t of overdueTasks.rows as unknown as Array<{ id: string; title: string }>) {
    if (!overdueRule.active || !overdueRule.channelInApp) continue;
    notifications.push({
      id: `task_overdue_${t.id}`,
      kind: "task_overdue",
      title: "Tarefa atrasada",
      body: t.title,
      link: "/tarefas",
      severity: severityFromAlertLevel(overdueRule.alertLevel),
    });
  }
  for (const t of dueTodayTasks.rows as unknown as Array<{ id: string; title: string }>) {
    if (!dueTodayRule.active || !dueTodayRule.channelInApp) continue;
    notifications.push({
      id: `task_due_${t.id}`,
      kind: "task_due_today",
      title: "Vence hoje",
      body: t.title,
      link: "/tarefas",
      severity: severityFromAlertLevel(dueTodayRule.alertLevel),
    });
  }
  if (dailyInsightRule.active && dailyInsightRule.channelInApp && dailyInsight.rows[0]) {
    const insight = dailyInsight.rows[0] as unknown as { text: string };
    notifications.push({
      id: `daily_insight_${today}`,
      kind: "daily_insight",
      title: "Insight do dia",
      body: insight.text,
      link: "/dashboard",
      severity: severityFromAlertLevel(dailyInsightRule.alertLevel),
    });
  }
  const customRules = await listCustomNotificationTriggers(ownerId);
  for (const rule of customRules.filter((item) => item.active && item.channelInApp)) {
    const tasks = await matchingCustomTasks(ownerId, rule, today);
    if (tasks.length === 0) continue;
    notifications.push({
      id: `custom_${rule.id}_${today}`,
      kind: "custom_trigger",
      title: rule.name,
      body: tasks.slice(0, 3).map((task) => task.title).join(", "),
      link: "/tarefas",
      severity: rule.conditionType === "task_overdue_by" ? "alta" : "media",
    });
  }
  if ((pendingHabits.rows as unknown[]).length > 0) {
    const names = (pendingHabits.rows as unknown as Array<{ name: string }>).map((h) => h.name).join(", ");
    notifications.push({
      // Com data no id: "vista" hoje não esconde o aviso de amanhã, se ainda houver hábito pendente.
      id: `habits_pending_${today}`,
      kind: "habit_pending",
      title: `${pendingHabits.rows.length} hábito(s) pendente(s) hoje`,
      body: names,
      link: "/habitos",
      severity: "baixa",
    });
  }
  if (weeklyReview.rows.length === 0) {
    notifications.push({
      // Com a segunda-feira da semana no id: só reaparece na semana seguinte.
      id: `weekly_review_pending_${mondayOf()}`,
      kind: "weekly_review_pending",
      title: "Weekly Review da semana em aberto",
      body: "Reserve alguns minutos para revisar sua semana.",
      link: "/weekly-review",
      severity: "baixa",
    });
  }

  // "Vi essa notificação": some da lista assim que o usuário abre o sino,
  // sem precisar que a condição real (tarefa atrasada, hábito pendente...)
  // deixe de existir — é o que faltava pra elas pararem de "grudar".
  const dismissedResult = await db.execute({
    sql: "SELECT notification_id FROM notification_dismissals WHERE owner_id = ?",
    args: [ownerId],
  });
  const dismissed = new Set((dismissedResult.rows as unknown as Array<{ notification_id: string }>).map((r) => r.notification_id));
  const visible = notifications.filter((n) => !dismissed.has(n.id));

  return res.json(visible);
});

/**
 * POST /api/notifications/dismiss — marca notificações como vistas (o
 * usuário abriu o sino e olhou pra elas). Idempotente: reenviar o mesmo
 * id não duplica nem dá erro.
 */
const dismissSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(50) });
notificationsRouter.post("/dismiss", async (req, res) => {
  const parsed = dismissSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  const db = getDb();
  const ownerId = req.user!.id;
  for (const notificationId of parsed.data.ids) {
    await db.execute({
      sql: "INSERT OR IGNORE INTO notification_dismissals (id, owner_id, notification_id) VALUES (?, ?, ?)",
      args: [`${ownerId}_${notificationId}`, ownerId, notificationId],
    });
  }
  return res.status(204).send();
});
