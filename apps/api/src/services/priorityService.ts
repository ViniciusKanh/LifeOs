import { getDb } from "../db/client.js";

/**
 * Priorização automática de tarefas ("Foque nisso agora").
 *
 * Regra de ouro: o score é 100% matemático, calculado a partir de
 * dados reais já existentes na tarefa (prazo, prioridade escolhida
 * pelo usuário, impacto/urgência/esforço quando preenchidos e
 * dependências). Nada de "sugestão da IA" aqui — é só aritmética.
 */

type Db = ReturnType<typeof getDb>;

/** Linha bruta de `tasks`, apenas as colunas que o cálculo usa. */
interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  impact: number | null;
  urgency: number | null;
  effort: number | null;
}

export interface FocusTask {
  id: string;
  title: string;
  dueDate: string | null;
  priority: string;
  status: string;
  score: number;
  reasons: string[];
}

// Pesos usados na composição do score. Todos na mesma ordem de
// grandeza (dezenas) para que nenhum fator sozinho domine o
// resultado — o objetivo é combinar sinais, não deixar um decidir.
const WEIGHT_OVERDUE_BASE = 40; // atraso: base alta + acréscimo por dia atrasado
const WEIGHT_OVERDUE_PER_DAY = 5;
const WEIGHT_OVERDUE_MAX_BONUS = 30; // limite pro acréscimo por dia (evita tarefa esquecida há 1 ano dominar tudo)
const WEIGHT_DUE_TODAY = 30;
const WEIGHT_DUE_THIS_WEEK = 15;
const PRIORITY_WEIGHT: Record<string, number> = { Alta: 20, Média: 10, Baixa: 0 };

// Fator de normalização do Priority Score profissional (impacto *
// urgência / esforço). Com impacto/urgência em 1-5 e esforço em 1-5,
// (impacto*urgência)/esforço varia tipicamente entre ~0.2 e 25. Um
// fator 2 coloca o topo dessa faixa (~25) perto da mesma ordem de
// grandeza dos outros bônus (overdue ~70, prioridade alta 20), sem
// deixar o campo dominar sozinho quando os valores são médios (~5 →
// contribuição ~10, equivalente a uma prioridade "Média").
const IMPACT_URGENCY_SCALE = 2;

// Penalidade para tarefa bloqueada por dependência não concluída: uma
// tarefa bloqueada normalmente não pode ser executada ainda, então
// sugerir "foque nisso agora" seria enganoso. Em vez de excluir de
// vez (o usuário pode ainda querer vê-la na lista geral do Kanban),
// aplicamos uma penalidade grande o bastante para praticamente sempre
// jogá-la pro fim da lista de foco, mas sem esconder o dado (o motivo
// "Bloqueada por outra tarefa" continua aparecendo).
const BLOCKED_PENALTY = 1000;

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((a.getTime() - b.getTime()) / msPerDay);
}

/**
 * Calcula o score de foco de uma tarefa e as razões (PT-BR) que
 * explicam esse score. `today` é injetável para facilitar testes.
 */
function scoreTask(task: TaskRow, blocked: boolean, today: Date): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (task.due_date) {
    // due_date é armazenado como string de data/hora; comparamos só a
    // parte de data para não confundir "vence hoje" com "atrasada"
    // por causa de horário.
    const due = new Date(task.due_date);
    const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const diffDays = daysBetween(dueDay, todayDay); // negativo = atrasada, 0 = hoje, positivo = futuro

    if (diffDays < 0) {
      const daysLate = Math.abs(diffDays);
      const bonus = WEIGHT_OVERDUE_BASE + Math.min(daysLate * WEIGHT_OVERDUE_PER_DAY, WEIGHT_OVERDUE_MAX_BONUS);
      score += bonus;
      reasons.push(daysLate === 1 ? "Atrasada há 1 dia" : `Atrasada há ${daysLate} dias`);
    } else if (diffDays === 0) {
      score += WEIGHT_DUE_TODAY;
      reasons.push("Vence hoje");
    } else if (diffDays <= 7) {
      score += WEIGHT_DUE_THIS_WEEK;
      reasons.push(diffDays === 1 ? "Vence amanhã" : `Vence em ${diffDays} dias`);
    }
    // diffDays > 7: sem bônus de prazo, mas também sem penalidade.
  }
  // Sem due_date: nenhum bônus nem penalidade de prazo — tarefa fica
  // dependendo só de prioridade/impacto/urgência/esforço.

  const priorityWeight = PRIORITY_WEIGHT[task.priority] ?? 0;
  if (priorityWeight > 0) {
    score += priorityWeight;
    reasons.push(`Prioridade ${task.priority}`);
  }

  if (task.impact != null && task.urgency != null && task.effort != null) {
    const raw = (task.impact * task.urgency) / Math.max(task.effort, 1);
    const contribution = raw * IMPACT_URGENCY_SCALE;
    score += contribution;
    if (task.impact >= 4 && task.urgency >= 4) {
      reasons.push("Alto impacto/urgência");
    } else if (contribution > 0) {
      reasons.push("Impacto e urgência considerados");
    }
  }

  if (blocked) {
    score -= BLOCKED_PENALTY;
    reasons.push("Bloqueada por outra tarefa");
  }

  return { score, reasons };
}

/**
 * Retorna as top-N tarefas em aberto do usuário, ordenadas pelo
 * score de foco (maior primeiro). Tarefas bloqueadas por uma
 * dependência não concluída recebem penalidade forte e, na prática,
 * não aparecem no topo — mas continuam elegíveis caso nenhuma outra
 * tarefa tenha score melhor, com a razão explicando o bloqueio.
 */
export async function getFocusTasks(db: Db, ownerId: string, limit: number): Promise<FocusTask[]> {
  const openTasksResult = await db.execute({
    sql: `SELECT id, title, status, priority, due_date, impact, urgency, effort
          FROM tasks WHERE owner_id = ? AND status != 'Concluído'`,
    args: [ownerId],
  });
  const openTasks = openTasksResult.rows as unknown as TaskRow[];
  if (openTasks.length === 0) return [];

  // Descobre quais dessas tarefas estão bloqueadas: dependem de outra
  // tarefa (do mesmo usuário) cujo status ainda não é 'Concluído'.
  const depsResult = await db.execute({
    sql: `SELECT td.task_id AS task_id
          FROM task_dependencies td
          JOIN tasks dep ON dep.id = td.depends_on_id
          WHERE td.task_id IN (SELECT id FROM tasks WHERE owner_id = ? AND status != 'Concluído')
            AND dep.status != 'Concluído'`,
    args: [ownerId],
  });
  const blockedIds = new Set(
    (depsResult.rows as unknown as Array<{ task_id: string }>).map((r) => r.task_id)
  );

  const today = new Date();
  const scored = openTasks.map((task) => {
    const { score, reasons } = scoreTask(task, blockedIds.has(task.id), today);
    return {
      id: task.id,
      title: task.title,
      dueDate: task.due_date,
      priority: task.priority,
      status: task.status,
      score,
      reasons,
    } satisfies FocusTask;
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
