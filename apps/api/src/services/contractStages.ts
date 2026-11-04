import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";

/**
 * Etapas e histórico dos Contratos 3.0 — módulo sem dependências de outros
 * serviços (é usado pelo motor de gamificação e pelo serviço de contratos,
 * então não pode importar nenhum deles).
 *
 * Regra das etapas: cada etapa agrupa tarefas REAIS do contrato. Uma etapa
 * com tarefas conclui sozinha quando todas estão concluídas (e reabre se uma
 * tarefa for reaberta). Etapa sem tarefas é concluída manualmente pelo
 * usuário, conferindo o critério. A primeira etapa não concluída é a "ativa".
 */

export interface StageInput {
  name: string;
  objective?: string | null;
  criterion?: string | null;
}

/** Modelo padrão sugerido no formulário (o usuário pode renomear, remover ou acrescentar). */
export const STAGE_TEMPLATE: Required<StageInput>[] = [
  { name: "Planejar", objective: "Definir o plano, os recursos e o primeiro passo.", criterion: "Plano registrado e primeiras tarefas criadas." },
  { name: "Iniciar", objective: "Começar a executar as primeiras obrigações.", criterion: "Primeiras tarefas concluídas." },
  { name: "Manter", objective: "Sustentar o ritmo combinado.", criterion: "Tarefas do meio do pacto concluídas no prazo." },
  { name: "Consolidar", objective: "Fechar pendências e revisar o resultado.", criterion: "Critérios de sucesso conferidos." },
  { name: "Selar", objective: "Revisar o pacto e selar o compromisso.", criterion: "Todas as obrigações concluídas." },
];

export function stageStatements(ownerId: string, contractId: string, stages: StageInput[]) {
  const ids: string[] = [];
  const statements = stages.slice(0, 10).map((s, i) => {
    const id = nanoid();
    ids.push(id);
    return {
      sql: `INSERT INTO contract_stages (id, owner_id, contract_id, position, name, objective, criterion, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, ownerId, contractId, i, s.name.trim().slice(0, 80), s.objective?.trim().slice(0, 300) || null, s.criterion?.trim().slice(0, 300) || null, i === 0 ? "ativa" : "pendente"] as Array<string | number | null>,
    };
  });
  return { ids, statements };
}

export async function logContractEvent(db: Client, ownerId: string, contractId: string, kind: string, detail: string | null = null): Promise<void> {
  await db.execute({
    sql: "INSERT INTO contract_events (id, owner_id, contract_id, kind, detail) VALUES (?, ?, ?, ?, ?)",
    args: [nanoid(), ownerId, contractId, kind, detail ? detail.slice(0, 500) : null],
  });
}

export type StageStatus = "pendente" | "ativa" | "concluida";

/**
 * Decide o status de cada etapa (função pura, exportada para teste):
 * - com tarefas: concluída quando todas estão feitas;
 * - sem tarefas: mantém a conclusão manual que já existia;
 * - a primeira não concluída vira "ativa", as demais "pendente".
 */
export function resolveStageStatuses(stages: Array<{ id: string; total: number; done: number; manualDone: boolean }>): Record<string, StageStatus> {
  const out: Record<string, StageStatus> = {};
  let activeGiven = false;
  for (const s of stages) {
    const complete = s.total > 0 ? s.done >= s.total : s.manualDone;
    if (complete) out[s.id] = "concluida";
    else if (!activeGiven) {
      out[s.id] = "ativa";
      activeGiven = true;
    } else out[s.id] = "pendente";
  }
  return out;
}

/** Recalcula e grava o status das etapas, registrando no histórico só as transições reais. */
export async function syncContractStages(db: Client, ownerId: string, contractId: string): Promise<void> {
  const r = await db.execute({
    sql: `SELECT s.id, s.name, s.status,
                 (SELECT COUNT(*) FROM tasks t WHERE t.contract_stage_id = s.id AND t.owner_id = s.owner_id) AS total,
                 (SELECT COUNT(*) FROM tasks t WHERE t.contract_stage_id = s.id AND t.owner_id = s.owner_id AND t.status = 'Concluído') AS done
          FROM contract_stages s WHERE s.owner_id = ? AND s.contract_id = ? ORDER BY s.position, s.created_at`,
    args: [ownerId, contractId],
  });
  if (r.rows.length === 0) return;
  const rows = r.rows.map((x) => ({ id: String(x.id), name: String(x.name), status: String(x.status) as StageStatus, total: Number(x.total ?? 0), done: Number(x.done ?? 0) }));
  const next = resolveStageStatuses(rows.map((s) => ({ id: s.id, total: s.total, done: s.done, manualDone: s.status === "concluida" })));
  for (const s of rows) {
    const status = next[s.id]!;
    if (status === s.status) continue;
    await db.execute({
      sql: `UPDATE contract_stages SET status = ?, completed_at = ${status === "concluida" ? "COALESCE(completed_at, datetime('now'))" : "NULL"}, updated_at = datetime('now') WHERE id = ? AND owner_id = ?`,
      args: [status, s.id, ownerId],
    });
    if (status === "concluida") await logContractEvent(db, ownerId, contractId, "stage_done", s.name);
    else if (s.status === "concluida") await logContractEvent(db, ownerId, contractId, "stage_reopened", s.name);
  }
}
