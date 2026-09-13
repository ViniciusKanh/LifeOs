import { Router } from "express";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

interface LiveNotification {
  id: string;
  kind: "task_overdue" | "task_due_today" | "habit_pending" | "weekly_review_pending";
  title: string;
  body: string;
  link: string;
  severity: "alta" | "media" | "baixa";
}

function mondayOf(date = new Date()): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

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

  const [overdueTasks, dueTodayTasks, pendingHabits, weeklyReview] = await Promise.all([
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
  ]);

  const notifications: LiveNotification[] = [];

  for (const t of overdueTasks.rows as unknown as Array<{ id: string; title: string }>) {
    notifications.push({
      id: `task_overdue_${t.id}`,
      kind: "task_overdue",
      title: "Tarefa atrasada",
      body: t.title,
      link: "/tarefas",
      severity: "alta",
    });
  }
  for (const t of dueTodayTasks.rows as unknown as Array<{ id: string; title: string }>) {
    notifications.push({
      id: `task_due_${t.id}`,
      kind: "task_due_today",
      title: "Vence hoje",
      body: t.title,
      link: "/tarefas",
      severity: "media",
    });
  }
  if ((pendingHabits.rows as unknown[]).length > 0) {
    const names = (pendingHabits.rows as unknown as Array<{ name: string }>).map((h) => h.name).join(", ");
    notifications.push({
      id: "habits_pending_today",
      kind: "habit_pending",
      title: `${pendingHabits.rows.length} hábito(s) pendente(s) hoje`,
      body: names,
      link: "/habitos",
      severity: "baixa",
    });
  }
  if (weeklyReview.rows.length === 0) {
    notifications.push({
      id: "weekly_review_pending",
      kind: "weekly_review_pending",
      title: "Weekly Review da semana em aberto",
      body: "Reserve alguns minutos para revisar sua semana.",
      link: "/weekly-review",
      severity: "baixa",
    });
  }

  return res.json(notifications);
});
