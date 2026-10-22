import { getDb } from "../db/client.js";

/**
 * Priorizacao automatica de tarefas ("Foque nisso agora" / Missao Principal).
 *
 * Simplificado de proposito: em vez de somar pesos escondidos (a versao
 * anterior misturava atraso, prazo, prioridade e impacto/urgencia/esforco
 * numa unica formula dificil de explicar), as tarefas sao ordenadas por
 * camadas, da mais urgente pra menos urgente. Dentro de cada camada, a
 * prioridade escolhida pelo usuario (Alta > Media > Baixa) decide o
 * empate. Tarefas bloqueadas por uma dependencia nao concluida sempre vao
 * pro fim (mas continuam aparecendo, com o motivo do bloqueio).
 *
 * Camadas, da mais pra menos urgente:
 *   1. Atrasada (mais dias de atraso primeiro)
 *   2. Vence hoje
 *   3. Vence nos proximos 7 dias (mais proxima primeiro)
 *   4. Sem urgencia de prazo (ordenada so pela prioridade)
 *
 * Nada de IA/Forja aqui - e so data e a prioridade que o usuario escolheu.
 * O impacto/urgencia/esforco (Priority Score) continua existindo, mas so
 * pra Area Profissional (GET /tasks/professional) - nao entra mais nessa
 * conta, pra ela ficar simples de entender de relance.
 */

type Db = ReturnType<typeof getDb>;

/** Linha bruta de `tasks`, apenas as colunas que o calculo usa. */
interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
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

const PRIORITY_RANK: Record<string, number> = { Alta: 2, Média: 1, Baixa: 0 };

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((a.getTime() - b.getTime()) / msPerDay);
}

interface Classified {
  task: TaskRow;
  blocked: boolean;
  /** 0 = atrasada, 1 = vence hoje, 2 = vence essa semana, 3 = sem urgencia de prazo. */
  tier: 0 | 1 | 2 | 3;
  /** Desempate DENTRO da camada (menor = mais urgente). */
  tiebreak: number;
  reasons: string[];
}

/**
 * Classifica uma tarefa na camada de urgencia certa e monta as razoes
 * (PT-BR) que explicam a posicao dela pro usuario. `today` e injetavel
 * pra facilitar testes.
 */
function classify(task: TaskRow, blocked: boolean, today: Date): Classified {
  const reasons: string[] = [];
  let tier: Classified["tier"] = 3;
  let tiebreak = 0;

  if (task.due_date) {
    // due_date e guardado como string de data/hora; comparamos so a parte
    // de data pra nao confundir "vence hoje" com "atrasada" por causa do
    // horario.
    const due = new Date(task.due_date);
    const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const diffDays = daysBetween(dueDay, todayDay); // negativo = atrasada, 0 = hoje, positivo = futuro

    if (diffDays < 0) {
      const daysLate = Math.abs(diffDays);
      tier = 0;
      tiebreak = -daysLate; // quanto mais atrasada, mais na frente dentro da camada
      reasons.push(daysLate === 1 ? "Atrasada há 1 dia" : `Atrasada há ${daysLate} dias`);
    } else if (diffDays === 0) {
      tier = 1;
      reasons.push("Vence hoje");
    } else if (diffDays <= 7) {
      tier = 2;
      tiebreak = diffDays; // quanto mais perto, mais na frente dentro da camada
      reasons.push(diffDays === 1 ? "Vence amanhã" : `Vence em ${diffDays} dias`);
    }
    // diffDays > 7: sem camada de prazo (cai na 3), mas sem penalidade.
  }

  if ((PRIORITY_RANK[task.priority] ?? 0) > 0) {
    reasons.push(`Prioridade ${task.priority}`);
  }

  if (blocked) reasons.push("Bloqueada por outra tarefa");

  return { task, blocked, tier, tiebreak, reasons };
}

/** Do mais pro menos urgente: bloqueada sempre por ultimo > camada > prioridade > desempate da camada. */
function compareClassified(a: Classified, b: Classified): number {
  if (a.blocked !== b.blocked) return a.blocked ? 1 : -1;
  if (a.tier !== b.tier) return a.tier - b.tier;
  const priorityDiff = (PRIORITY_RANK[b.task.priority] ?? 0) - (PRIORITY_RANK[a.task.priority] ?? 0);
  if (priorityDiff !== 0) return priorityDiff;
  return a.tiebreak - b.tiebreak;
}

/**
 * Retorna as top-N tarefas em aberto do usuario, da mais pra menos
 * urgente (ver ordem das camadas no topo do arquivo). Tarefas bloqueadas
 * por uma dependencia nao concluida vao pro fim, mas continuam elegiveis
 * caso nenhuma outra tarefa esteja livre, com a razao explicando o
 * bloqueio.
 */
export async function getFocusTasks(db: Db, ownerId: string, limit: number): Promise<FocusTask[]> {
  const openTasksResult = await db.execute({
    sql: `SELECT id, title, status, priority, due_date
          FROM tasks WHERE owner_id = ? AND status != 'Concluído'`,
    args: [ownerId],
  });
  const openTasks = openTasksResult.rows as unknown as TaskRow[];
  if (openTasks.length === 0) return [];

  // Descobre quais dessas tarefas estao bloqueadas: dependem de outra
  // tarefa (do mesmo usuario) cujo status ainda nao e 'Concluído'.
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
  const classified = openTasks.map((task) => classify(task, blockedIds.has(task.id), today));
  classified.sort(compareClassified);

  // "score" agora e so um numero decrescente que reflete a posicao final
  // (mantido pra nao quebrar quem consome o campo) - quem decide a ordem
  // de verdade e a classificacao por camada acima, nao soma de pesos.
  return classified.slice(0, limit).map((c, index) => ({
    id: c.task.id,
    title: c.task.title,
    dueDate: c.task.due_date,
    priority: c.task.priority,
    status: c.task.status,
    score: classified.length - index,
    reasons: c.reasons,
  }));
}
