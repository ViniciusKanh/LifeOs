import type { getDb } from "../db/client.js";

type Db = ReturnType<typeof getDb>;

/**
 * Evidências reais de um período (semana, mês…) para os prompts de revisão.
 *
 * As revisões antigas só enviavam contagens ao Gemini ("12 tarefas
 * concluídas"), e o texto saía genérico. Aqui juntamos O QUE de fato
 * aconteceu — títulos das tarefas concluídas e por projeto, pendências
 * atrasadas, notas, contratos e a consistência de cada hábito — para a IA
 * escrever com base na vida real do usuário.
 *
 * Tudo filtrado por owner_id. Os limites de volume protegem o custo do prompt.
 */
export interface ReviewEvidence {
  /** Bloco de texto pronto para o prompt. */
  block: string;
  /** Quantidades usadas — exibidas na UI como procedência ("baseado em…"). */
  counts: { tasksDone: number; projects: number; habits: number; overdue: number; notes: number; contractsSealed: number; contractsStalled: number };
}

interface Options {
  /** Máximo de tarefas concluídas listadas pelo título. */
  maxTasks: number;
}

const WEEK: Options = { maxTasks: 40 };
const MONTH: Options = { maxTasks: 80 };
const LONG: Options = { maxTasks: 60 };

export function evidenceOptionsFor(days: number): Options {
  if (days <= 8) return WEEK;
  if (days <= 31) return MONTH;
  return LONG;
}

const shortDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Período [from, toExclusive) em datas locais YYYY-MM-DD. */
export async function collectReviewEvidence(db: Db, ownerId: string, from: string, toExclusive: string, opts: Options = WEEK): Promise<ReviewEvidence> {
  const [done, overdue, habits, notes, contractsSealed, contractStages, contractsActive] = await Promise.all([
    db.execute({
      sql: `SELECT t.title AS title, p.name AS project, date(COALESCE(t.completed_at, t.updated_at)) AS day, t.priority AS priority
            FROM tasks t LEFT JOIN projects p ON p.id = t.project_id AND p.owner_id = t.owner_id
            WHERE t.owner_id = ? AND t.status = 'Concluído' AND t.parent_task_id IS NULL
              AND date(COALESCE(t.completed_at, t.updated_at)) >= date(?) AND date(COALESCE(t.completed_at, t.updated_at)) < date(?)
            ORDER BY day ASC LIMIT 400`,
      args: [ownerId, from, toExclusive],
    }),
    db.execute({
      sql: `SELECT t.title AS title, p.name AS project, t.due_date AS due, t.priority AS priority
            FROM tasks t LEFT JOIN projects p ON p.id = t.project_id AND p.owner_id = t.owner_id
            WHERE t.owner_id = ? AND t.status != 'Concluído' AND t.parent_task_id IS NULL AND t.due_date IS NOT NULL AND date(t.due_date) < date(?)
            ORDER BY CASE t.priority WHEN 'Alta' THEN 0 WHEN 'Média' THEN 1 ELSE 2 END, t.due_date ASC LIMIT 12`,
      args: [ownerId, toExclusive],
    }),
    db.execute({
      sql: `SELECT h.name AS name, COUNT(*) AS n FROM habit_entries he JOIN habits h ON h.id = he.habit_id AND h.owner_id = he.owner_id
            WHERE he.owner_id = ? AND he.entry_date >= ? AND he.entry_date < ? AND he.count >= h.target_count
            GROUP BY h.id ORDER BY n DESC LIMIT 12`,
      args: [ownerId, from, toExclusive],
    }),
    db.execute({
      sql: `SELECT title, plain_text, updated_at FROM notes
            WHERE owner_id = ? AND archived_at IS NULL AND date(updated_at) >= date(?) AND date(updated_at) < date(?)
            ORDER BY updated_at ASC LIMIT 30`,
      args: [ownerId, from, toExclusive],
    }),
    // Contratos (Guilda dos Pactos) selados/concluídos no período — selado é o que conta de verdade (completed_at é só histórico legado).
    db.execute({
      sql: `SELECT title, category, difficulty, COALESCE(sealed_at, completed_at) AS done_at
            FROM contracts
            WHERE owner_id = ?
              AND ((sealed_at IS NOT NULL AND date(sealed_at) >= date(?) AND date(sealed_at) < date(?))
                OR (sealed_at IS NULL AND completed_at IS NOT NULL AND date(completed_at) >= date(?) AND date(completed_at) < date(?)))
            ORDER BY done_at ASC LIMIT 20`,
      args: [ownerId, from, toExclusive, from, toExclusive],
    }),
    // Etapas de contrato concluídas no período — mostra progresso real mesmo em contratos ainda não selados.
    db.execute({
      sql: `SELECT c.title AS contract_title, cs.name AS stage_name, cs.completed_at AS completed_at
            FROM contract_stages cs JOIN contracts c ON c.id = cs.contract_id AND c.owner_id = cs.owner_id
            WHERE cs.owner_id = ? AND cs.status = 'concluida' AND cs.completed_at IS NOT NULL
              AND date(cs.completed_at) >= date(?) AND date(cs.completed_at) < date(?)
            ORDER BY cs.completed_at ASC LIMIT 30`,
      args: [ownerId, from, toExclusive],
    }),
    // Contratos ainda ativos ao fim do período — para apontar os que pararam de andar.
    db.execute({
      sql: `SELECT id, title, due_date FROM contracts
            WHERE owner_id = ? AND status = 'ativo' AND is_draft = 0 AND paused_at IS NULL AND cancelled_at IS NULL AND sealed_at IS NULL
            ORDER BY created_at ASC LIMIT 20`,
      args: [ownerId],
    }),
  ]);

  const lines: string[] = [];
  const doneRows = done.rows as unknown as Array<{ title: string; project: string | null; day: string; priority: string }>;

  // Tarefas agrupadas por projeto: a IA enxerga em que frentes o período avançou.
  const byProject = new Map<string, number>();
  for (const t of doneRows) byProject.set(t.project ?? "Sem projeto", (byProject.get(t.project ?? "Sem projeto") ?? 0) + 1);
  if (doneRows.length > 0) {
    lines.push(`TAREFAS CONCLUÍDAS (${doneRows.length}) — por projeto: ${[...byProject.entries()].map(([p, n]) => `${p} ${n}`).join("; ")}`);
    const listed = doneRows.slice(-opts.maxTasks);
    for (const t of listed) lines.push(`- ${shortDate(t.day)} · ${t.title}${t.project ? ` [${t.project}]` : ""}${t.priority === "Alta" ? " (alta prioridade)" : ""}`);
    if (doneRows.length > listed.length) lines.push(`- (+${doneRows.length - listed.length} tarefas mais antigas no período)`);
  } else {
    lines.push("TAREFAS CONCLUÍDAS: nenhuma registrada no período.");
  }

  const overdueRows = overdue.rows as unknown as Array<{ title: string; project: string | null; due: string; priority: string }>;
  if (overdueRows.length > 0) {
    lines.push("", `PENDÊNCIAS ATRASADAS NO FIM DO PERÍODO (${overdueRows.length}):`);
    for (const t of overdueRows) lines.push(`- ${t.title}${t.project ? ` [${t.project}]` : ""} — prazo ${shortDate(t.due)}, prioridade ${t.priority}`);
  }

  const habitRows = habits.rows as unknown as Array<{ name: string; n: number }>;
  if (habitRows.length > 0) {
    lines.push("", "HÁBITOS (check-ins cumpridos no período):", habitRows.map((h) => `${h.name}: ${Number(h.n)}`).join("; "));
  }

  const notesRows = notes.rows as unknown as Array<{ title: string; plain_text: string | null; updated_at: string }>;
  if (notesRows.length > 0) {
    lines.push("", `ANOTAÇÕES (${notesRows.length} nota(s) criada(s)/editada(s) no período):`);
    for (const n of notesRows) {
      const body = (n.plain_text ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
      lines.push(`- ${shortDate(n.updated_at)} · "${n.title}"${body ? `: ${body}` : ""}`);
    }
  }

  // Contratos (Guilda dos Pactos): selados no período, progresso por etapa, e os que pararam de andar.
  const sealedRows = contractsSealed.rows as unknown as Array<{ title: string; category: string | null; difficulty: string; done_at: string }>;
  const stageRows = contractStages.rows as unknown as Array<{ contract_title: string; stage_name: string; completed_at: string }>;
  const activeRows = contractsActive.rows as unknown as Array<{ id: string; title: string; due_date: string | null }>;
  const progressedTitles = new Set([...sealedRows.map((r) => r.title), ...stageRows.map((r) => r.contract_title)]);
  const stalled = activeRows.filter((c) => !progressedTitles.has(c.title));
  if (sealedRows.length > 0 || stageRows.length > 0 || stalled.length > 0) {
    lines.push("", "CONTRATOS (Guilda dos Pactos):");
    if (sealedRows.length > 0) {
      lines.push(`- Selados/cumpridos no período (${sealedRows.length}): ${sealedRows.map((c) => `"${c.title}"${c.category ? ` [${c.category}]` : ""}`).join("; ")}`);
    }
    if (stageRows.length > 0) {
      lines.push(`- Etapas concluídas no período (${stageRows.length}): ${stageRows.map((s) => `"${s.contract_title}" → ${s.stage_name}`).join("; ")}`);
    }
    if (stalled.length > 0) {
      lines.push(`- Ativos sem nenhum progresso registrado no período (${stalled.length}): ${stalled.map((c) => `"${c.title}"${c.due_date ? ` (prazo ${shortDate(c.due_date)})` : ""}`).join("; ")}`);
    }
  } else {
    lines.push("", "CONTRATOS: nenhum contrato ativo ou selado no período.");
  }

  return {
    block: lines.join("\n"),
    counts: {
      tasksDone: doneRows.length,
      projects: byProject.size,
      habits: habitRows.length,
      overdue: overdueRows.length,
      notes: notesRows.length,
      contractsSealed: sealedRows.length,
      contractsStalled: stalled.length,
    },
  };
}
