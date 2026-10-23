import { nanoid } from "nanoid";
import type { getDb } from "../db/client.js";
import type { z } from "zod";
import type { createTaskSchema } from "../validators/task.schema.js";
import { awardHabitCheckIn, awardTaskCompletion, maybeCompleteContract, syncContractStatus } from "./gamificationService.js";
import { syncAutoHabitsAfterWrite } from "./habitAutoService.js";
import { computeNextOccurrence, parseRecurrenceRule } from "./recurrenceService.js";

/**
 * Efeitos colaterais de escrita em tarefas, extraídos de tasks.routes.ts
 * para serem reutilizados pelo Copilot (e qualquer outro ponto de entrada)
 * sem divergir das rotas: score de prioridade, recorrência, hábito
 * vinculado, XP e contratos acontecem do MESMO jeito em todo lugar.
 */

type Db = ReturnType<typeof getDb>;

/**
 * Recalcula priority_score (impacto*urgência/esforço) direto no SQL,
 * a partir dos valores já salvos na linha — funciona tanto quando os
 * três campos chegam juntos (criação) quanto quando só um muda depois
 * (edição), sem precisar buscar a linha primeiro pra decidir.
 */
export async function recomputePriorityScore(db: Db, taskId: string, ownerId: string) {
  await db.execute({
    sql: `UPDATE tasks SET priority_score =
            CASE WHEN impact IS NOT NULL AND urgency IS NOT NULL AND effort IS NOT NULL AND effort > 0
              THEN (impact * 1.0 * urgency) / effort
              ELSE NULL
            END
          WHERE id = ? AND owner_id = ?`,
    args: [taskId, ownerId],
  });
}

/**
 * Recorrência: quando uma tarefa com recurrence_rule é marcada
 * "Concluído", gera a próxima ocorrência como uma tarefa nova (a
 * atual fica concluída de verdade, preservando o histórico — não
 * "volta" pro Backlog). A data de referência é o due_date da tarefa
 * concluída, ou hoje se ela não tinha prazo. Silenciosamente não faz
 * nada se a regra estiver vazia/inválida (não deveria acontecer, já
 * que o schema valida na entrada, mas nunca falha a resposta por
 * causa disso — a tarefa já foi concluída, isso é só um efeito extra).
 */
export async function maybeSpawnNextOccurrence(db: Db, taskId: string, ownerId: string) {
  const result = await db.execute({
    sql: "SELECT * FROM tasks WHERE id = ? AND owner_id = ?",
    args: [taskId, ownerId],
  });
  const task = result.rows[0] as unknown as
    | {
        recurrence_rule: string | null;
        status: string;
        project_id: string | null;
        goal_id: string | null;
        title: string;
        description: string | null;
        priority: string;
        due_date: string | null;
        start_date: string | null;
        estimate_minutes: number | null;
        impact: number | null;
        urgency: number | null;
        effort: number | null;
      }
    | undefined;
  if (!task || task.status !== "Concluído" || !task.recurrence_rule) return;

  const rule = parseRecurrenceRule(task.recurrence_rule);
  if (!rule) return;

  const fromIso = task.due_date ?? new Date().toISOString().slice(0, 10);
  const nextDue = computeNextOccurrence(rule, fromIso);
  // Prazo original mantido como deslocamento pra data de início, se havia um intervalo entre eles.
  const nextStart =
    task.start_date && task.due_date
      ? (() => {
          const spanDays = Math.round(
            (new Date(`${task.due_date!.slice(0, 10)}T00:00:00Z`).getTime() - new Date(`${task.start_date!.slice(0, 10)}T00:00:00Z`).getTime()) /
              86_400_000
          );
          const d = new Date(`${nextDue}T00:00:00Z`);
          d.setUTCDate(d.getUTCDate() - Math.max(spanDays, 0));
          return d.toISOString().slice(0, 10);
        })()
      : null;

  const newId = nanoid();
  await db.execute({
    sql: `INSERT INTO tasks (id, owner_id, project_id, goal_id, title, description, status, priority, due_date, start_date, estimate_minutes, impact, urgency, effort, recurrence_rule)
          VALUES (?, ?, ?, ?, ?, ?, 'Backlog', ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      newId,
      ownerId,
      task.project_id,
      task.goal_id,
      task.title,
      task.description,
      task.priority,
      nextDue,
      nextStart,
      task.estimate_minutes,
      task.impact,
      task.urgency,
      task.effort,
      task.recurrence_rule,
    ],
  });
  await recomputePriorityScore(db, newId, ownerId);
}

/**
 * Integração hábito → tarefa → hábito: uma tarefa gerada a partir de um
 * hábito (habit_id preenchido, ver POST /api/habits/generate-tasks) que é
 * marcada "Concluído" faz o check-in automático daquele hábito no dia do
 * due_date da tarefa (ou hoje, se a tarefa não tinha prazo) — mesmo upsert
 * usado por POST /api/habits/:id/check-in, então marcar de novo não duplica
 * nada. Só ADICIONA o check-in ao completar; desmarcar a tarefa depois não
 * remove o check-in (evita apagar um registro de hábito sem confirmação).
 */
export async function maybeCheckInLinkedHabit(db: Db, taskId: string, ownerId: string) {
  const result = await db.execute({
    sql: "SELECT habit_id, due_date, status FROM tasks WHERE id = ? AND owner_id = ?",
    args: [taskId, ownerId],
  });
  const task = result.rows[0] as unknown as { habit_id: string | null; due_date: string | null; status: string } | undefined;
  if (!task || !task.habit_id || task.status !== "Concluído") return;

  const habitRes = await db.execute({ sql: "SELECT target_count FROM habits WHERE id = ? AND owner_id = ?", args: [task.habit_id, ownerId] });
  const targetCount = Number((habitRes.rows[0] as unknown as { target_count: number } | undefined)?.target_count ?? 1);
  const entryDate = (task.due_date ?? new Date().toISOString()).slice(0, 10);

  await db.execute({
    sql: `INSERT INTO habit_entries (id, habit_id, owner_id, entry_date, count)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (habit_id, entry_date) DO UPDATE SET count = MAX(habit_entries.count, excluded.count)`,
    args: [nanoid(), task.habit_id, ownerId, entryDate, targetCount],
  });
  await awardHabitCheckIn(db, ownerId, task.habit_id, entryDate);
}

export const TASK_STATUSES = ["Backlog", "A Fazer", "Em Andamento", "Em Revisão", "Concluído"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/**
 * Muda o status de uma tarefa do usuário com todos os efeitos do Kanban
 * (PATCH /api/tasks/:id/move): carimbo de conclusão, próxima ocorrência,
 * check-in do hábito vinculado, XP e contrato. Devolve false se a tarefa
 * não existir ou não pertencer ao usuário.
 */
export async function moveTaskStatus(db: Db, ownerId: string, taskId: string, status: string): Promise<boolean> {
  const result = await db.execute({
    sql: `UPDATE tasks
          SET status = ?,
              completed_at = CASE
                WHEN ? = 'Concluído' THEN COALESCE(completed_at, datetime('now'))
                ELSE NULL
              END,
              updated_at = datetime('now')
          WHERE id = ? AND owner_id = ?`,
    args: [status, status, taskId, ownerId],
  });
  if (result.rowsAffected === 0) return false;
  if (status === "Concluído") {
    await maybeSpawnNextOccurrence(db, taskId, ownerId);
    await maybeCheckInLinkedHabit(db, taskId, ownerId);
    await awardTaskCompletion(db, ownerId, taskId);
  } else {
    await maybeCompleteContract(db, ownerId, taskId);
  }
  await syncAutoHabitsAfterWrite(db, ownerId);
  return true;
}

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/**
 * Insere uma tarefa já validada por createTaskSchema — extraído de
 * POST /api/tasks para o Copilot gravar do mesmo jeito (score de
 * prioridade e contrato). Os vínculos (projeto/meta/contrato) precisam
 * ter a posse validada por quem chama ANTES (ver validateTaskLinks).
 */
export async function insertTask(db: Db, ownerId: string, d: CreateTaskInput) {
  const id = nanoid();
  const status = d.status ?? "Backlog";

  await db.execute({
    sql: `INSERT INTO tasks (id, owner_id, project_id, goal_id, title, description, status, priority, due_date, start_date, estimate_minutes, completed_at, impact, urgency, effort, recurrence_rule, difficulty, contract_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      ownerId,
      d.projectId ?? null,
      d.goalId ?? null,
      d.title,
      d.description ?? null,
      status,
      d.priority,
      d.dueDate ?? null,
      d.startDate ?? null,
      d.estimateMinutes ?? null,
      status === "Concluído" ? new Date().toISOString() : null,
      d.impact ?? null,
      d.urgency ?? null,
      d.effort ?? null,
      d.recurrenceRule ?? null,
      d.difficulty ?? null,
      d.contractId ?? null,
    ],
  });
  await recomputePriorityScore(db, id, ownerId);
  if (d.contractId) await syncContractStatus(db, ownerId, d.contractId);

  const created = await db.execute({
    sql: "SELECT * FROM tasks WHERE id = ? AND owner_id = ?",
    args: [id, ownerId],
  });
  return created.rows[0];
}
