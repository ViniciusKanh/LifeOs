import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { extractJson, str } from "./aiJson.js";
import { generateText, getGeminiConfig } from "./geminiService.js";
import { getDifficultyRewards, isDifficulty, syncContractStatus, todayKeyFor, type DifficultyKey } from "./gamificationService.js";

/**
 * Contratos: um objetivo com um conjunto de tarefas reais (tabela tasks,
 * coluna contract_id). Cada tarefa paga XP/moedas ao ser concluída (pela
 * dificuldade); o contrato paga um bônus único quando TODAS são concluídas.
 * O Gemini só PROPÕE contratos e tarefas — nada é gravado sem confirmação.
 */

export type ContractStatus = "ativo" | "concluido" | "arquivado";
type Priority = "Baixa" | "Média" | "Alta";

export interface ContractTaskInput {
  title: string;
  description?: string | null;
  priority?: Priority;
  difficulty?: DifficultyKey | null;
  dueDate?: string | null;
  estimateMinutes?: number | null;
}

export interface ContractInput {
  title: string;
  description?: string | null;
  objective?: string | null;
  difficulty: DifficultyKey;
  dueDate?: string | null;
  aiGenerated?: boolean;
  tasks?: ContractTaskInput[];
}

export class ContractError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export interface ContractView {
  id: string;
  title: string;
  description: string | null;
  objective: string | null;
  difficulty: DifficultyKey;
  status: ContractStatus;
  dueDate: string | null;
  aiGenerated: boolean;
  completedAt: string | null;
  createdAt: string;
  totalTasks: number;
  doneTasks: number;
  progressPct: number;
  /** Bônus previsto pelo contrato (valores atuais do usuário). */
  reward: { xp: number; coins: number };
  /** XP/moedas já recebidos pelas tarefas e pelo bônus deste contrato. */
  earned: { xp: number; coins: number };
}

const CONTRACT_SELECT = `SELECT c.*,
    (SELECT COUNT(*) FROM tasks t WHERE t.contract_id = c.id AND t.owner_id = c.owner_id) AS total_tasks,
    (SELECT COUNT(*) FROM tasks t WHERE t.contract_id = c.id AND t.owner_id = c.owner_id AND t.status = 'Concluído') AS done_tasks,
    (SELECT COALESCE(SUM(x.xp), 0) FROM xp_events x WHERE x.owner_id = c.owner_id AND (
        (x.source_type = 'contract' AND x.source_id = c.id) OR
        (x.source_type = 'task' AND x.source_id IN (SELECT id FROM tasks t WHERE t.contract_id = c.id AND t.owner_id = c.owner_id)))) AS earned_xp,
    (SELECT COALESCE(SUM(l.amount), 0) FROM coin_ledger l WHERE l.owner_id = c.owner_id AND l.amount > 0 AND (
        (l.source_type = 'contract' AND l.source_id = c.id) OR
        (l.source_type = 'task' AND l.source_id IN (SELECT id FROM tasks t WHERE t.contract_id = c.id AND t.owner_id = c.owner_id)))) AS earned_coins
  FROM contracts c`;

function mapContract(row: Record<string, unknown>, rewards: Awaited<ReturnType<typeof getDifficultyRewards>>): ContractView {
  const difficulty = isDifficulty(row.difficulty) ? row.difficulty : "medio";
  const total = Number(row.total_tasks ?? 0);
  const done = Number(row.done_tasks ?? 0);
  return {
    id: String(row.id),
    title: String(row.title),
    description: row.description == null ? null : String(row.description),
    objective: row.objective == null ? null : String(row.objective),
    difficulty,
    status: String(row.status) as ContractStatus,
    dueDate: row.due_date == null ? null : String(row.due_date),
    aiGenerated: Number(row.ai_generated) === 1,
    completedAt: row.completed_at == null ? null : String(row.completed_at),
    createdAt: String(row.created_at),
    totalTasks: total,
    doneTasks: done,
    progressPct: total === 0 ? 0 : Math.round((done / total) * 100),
    reward: { xp: rewards[difficulty].contractXp, coins: rewards[difficulty].contractCoins },
    earned: { xp: Number(row.earned_xp ?? 0), coins: Number(row.earned_coins ?? 0) },
  };
}

export async function listContracts(db: Client, ownerId: string): Promise<ContractView[]> {
  const [rows, rewards] = await Promise.all([
    db.execute({
      sql: `${CONTRACT_SELECT} WHERE c.owner_id = ?
            ORDER BY CASE c.status WHEN 'ativo' THEN 0 WHEN 'concluido' THEN 1 ELSE 2 END, COALESCE(c.due_date, '9999') ASC, c.created_at DESC`,
      args: [ownerId],
    }),
    getDifficultyRewards(db, ownerId),
  ]);
  return rows.rows.map((r) => mapContract(r as unknown as Record<string, unknown>, rewards));
}

export async function getContract(db: Client, ownerId: string, id: string): Promise<ContractView> {
  const [rows, rewards] = await Promise.all([
    db.execute({ sql: `${CONTRACT_SELECT} WHERE c.id = ? AND c.owner_id = ?`, args: [id, ownerId] }),
    getDifficultyRewards(db, ownerId),
  ]);
  const row = rows.rows[0];
  if (!row) throw new ContractError("Contrato não encontrado.", 404);
  return mapContract(row as unknown as Record<string, unknown>, rewards);
}

export async function listContractTasks(db: Client, ownerId: string, id: string) {
  await getContract(db, ownerId, id);
  const r = await db.execute({
    sql: `SELECT * FROM tasks WHERE contract_id = ? AND owner_id = ?
          ORDER BY CASE WHEN status = 'Concluído' THEN 1 ELSE 0 END, COALESCE(due_date, '9999') ASC, created_at ASC`,
    args: [id, ownerId],
  });
  return r.rows;
}

function taskInsert(ownerId: string, contractId: string, t: ContractTaskInput) {
  return {
    sql: `INSERT INTO tasks (id, owner_id, contract_id, title, description, status, priority, difficulty, due_date, estimate_minutes)
          VALUES (?, ?, ?, ?, ?, 'A Fazer', ?, ?, ?, ?)`,
    args: [
      nanoid(),
      ownerId,
      contractId,
      t.title.trim(),
      t.description ?? null,
      t.priority ?? "Média",
      t.difficulty ?? null,
      t.dueDate ?? null,
      t.estimateMinutes ?? null,
    ],
  };
}

export async function createContract(db: Client, ownerId: string, input: ContractInput): Promise<ContractView> {
  const id = nanoid();
  const statements = [
    {
      sql: `INSERT INTO contracts (id, owner_id, title, description, objective, difficulty, due_date, ai_generated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, ownerId, input.title.trim(), input.description ?? null, input.objective ?? null, input.difficulty, input.dueDate ?? null, input.aiGenerated ? 1 : 0],
    },
    ...(input.tasks ?? []).map((t) => taskInsert(ownerId, id, t)),
  ];
  await db.batch(statements, "write");
  return getContract(db, ownerId, id);
}

export async function updateContract(
  db: Client,
  ownerId: string,
  id: string,
  input: Partial<Pick<ContractInput, "title" | "description" | "objective" | "difficulty" | "dueDate">> & { status?: "ativo" | "arquivado" },
): Promise<ContractView> {
  const current = await getContract(db, ownerId, id);
  const map: Record<string, string> = { title: "title", description: "description", objective: "objective", difficulty: "difficulty", dueDate: "due_date" };
  const sets: string[] = [];
  const args: Array<string | null> = [];
  for (const [key, col] of Object.entries(map)) {
    if (key in input) {
      sets.push(`${col} = ?`);
      args.push(((input as Record<string, string | null | undefined>)[key] ?? null) as string | null);
    }
  }
  // Arquivar/reativar: "concluido" só é definido pelo próprio motor (todas as tarefas feitas).
  if (input.status === "arquivado" && current.status !== "arquivado") sets.push("status = 'arquivado'");
  if (input.status === "ativo" && current.status === "arquivado") sets.push("status = 'ativo'");
  if (sets.length > 0) {
    sets.push("updated_at = datetime('now')");
    await db.execute({ sql: `UPDATE contracts SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`, args: [...args, id, ownerId] });
  }
  if (input.status === "ativo") await syncContractStatus(db, ownerId, id);
  return getContract(db, ownerId, id);
}

/** Exclui o contrato. As tarefas continuam existindo (só perdem o vínculo), salvo se pedido. */
export async function deleteContract(db: Client, ownerId: string, id: string, deleteOpenTasks: boolean): Promise<void> {
  await getContract(db, ownerId, id);
  const statements = [
    ...(deleteOpenTasks ? [{ sql: "DELETE FROM tasks WHERE contract_id = ? AND owner_id = ? AND status != 'Concluído'", args: [id, ownerId] }] : []),
    { sql: "UPDATE tasks SET contract_id = NULL WHERE contract_id = ? AND owner_id = ?", args: [id, ownerId] },
    { sql: "DELETE FROM contracts WHERE id = ? AND owner_id = ?", args: [id, ownerId] },
  ];
  await db.batch(statements, "write");
}

export async function addContractTasks(db: Client, ownerId: string, id: string, tasks: ContractTaskInput[]) {
  const c = await getContract(db, ownerId, id);
  if (c.status === "arquivado") throw new ContractError("Reative o contrato antes de adicionar tarefas.");
  await db.batch(tasks.map((t) => taskInsert(ownerId, id, t)), "write");
  // Contrato já cumprido volta a "ativo" com tarefas novas (o bônus pago não se repete).
  await syncContractStatus(db, ownerId, id);
  return listContractTasks(db, ownerId, id);
}

/** Vincula uma tarefa existente ao contrato (ou remove o vínculo). */
export async function linkTask(db: Client, ownerId: string, contractId: string | null, taskId: string): Promise<void> {
  const t = await db.execute({ sql: "SELECT contract_id FROM tasks WHERE id = ? AND owner_id = ?", args: [taskId, ownerId] });
  if (!t.rows[0]) throw new ContractError("Tarefa não encontrada.", 404);
  const previous = t.rows[0].contract_id == null ? null : String(t.rows[0].contract_id);
  if (contractId) await getContract(db, ownerId, contractId);
  await db.execute({ sql: "UPDATE tasks SET contract_id = ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [contractId, taskId, ownerId] });
  if (previous) await syncContractStatus(db, ownerId, previous);
  if (contractId) await syncContractStatus(db, ownerId, contractId);
}

/* ------------------------------- IA (Gemini) ------------------------------- */

export interface ContractProposal {
  title: string;
  description: string | null;
  objective: string | null;
  difficulty: DifficultyKey;
  dueInDays: number | null;
  tasks: Array<Required<Pick<ContractTaskInput, "title">> & { description: string | null; priority: Priority; difficulty: DifficultyKey; dueInDays: number | null; estimateMinutes: number | null }>;
}

const PRIORITIES: Priority[] = ["Baixa", "Média", "Alta"];

function sanitizeTasks(raw: unknown, fallbackDifficulty: DifficultyKey, max: number): ContractProposal["tasks"] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => {
      const o = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
      const title = str(o.title, 200);
      if (!title) return null;
      const due = typeof o.dueInDays === "number" && Number.isFinite(o.dueInDays) ? Math.min(365, Math.max(0, Math.round(o.dueInDays))) : null;
      const est = typeof o.estimateMinutes === "number" && Number.isFinite(o.estimateMinutes) ? Math.min(480, Math.max(5, Math.round(o.estimateMinutes))) : null;
      return {
        title,
        description: str(o.description, 600),
        priority: PRIORITIES.includes(o.priority as Priority) ? (o.priority as Priority) : "Média",
        difficulty: isDifficulty(o.difficulty) ? o.difficulty : fallbackDifficulty,
        dueInDays: due,
        estimateMinutes: est,
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null)
    .slice(0, max);
}

const DIFFICULTY_GUIDE = `Dificuldades válidas: "facil" (tarefas curtas, < 30 min), "medio" (1 a 2 h), "dificil" (meio dia, exige foco), "epico" (vários dias de esforço).`;

async function userContextLine(db: Client, ownerId: string): Promise<string> {
  const [open, contracts] = await Promise.all([
    db.execute({ sql: "SELECT COUNT(*) AS n FROM tasks WHERE owner_id = ? AND status != 'Concluído'", args: [ownerId] }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM contracts WHERE owner_id = ? AND status = 'ativo'", args: [ownerId] }),
  ]);
  return `Dados reais do usuário: ${Number(open.rows[0]?.n ?? 0)} tarefas abertas e ${Number(contracts.rows[0]?.n ?? 0)} contratos ativos.`;
}

type AiResult<T> = { ok: true; data: T } | { ok: false; message: string };

const NO_AI = "A IA do LifeOS Copilot ainda não foi configurada. Peça a um administrador para cadastrar a API Key do Gemini.";

/** Gemini propõe um contrato completo a partir do objetivo descrito. Nada é salvo. */
export async function proposeContract(db: Client, ownerId: string, input: { goal: string; difficulty?: DifficultyKey; deadlineDays?: number }): Promise<AiResult<ContractProposal>> {
  const config = await getGeminiConfig();
  if (!config) return { ok: false, message: NO_AI };
  const today = await todayKeyFor(db, ownerId);
  const prompt = `Você é o LifeOS Copilot e ajuda a montar um "contrato": um objetivo pessoal concreto dividido em tarefas executáveis.
Hoje é ${today}. ${await userContextLine(db, ownerId)}
Objetivo descrito pelo usuário: """${input.goal.slice(0, 1200)}"""
${input.difficulty ? `Dificuldade desejada para o contrato: ${input.difficulty}.` : ""}
${input.deadlineDays ? `Prazo desejado: ${input.deadlineDays} dias a partir de hoje.` : ""}
${DIFFICULTY_GUIDE}
Regras: entre 3 e 8 tarefas, verbos no infinitivo, específicas e mensuráveis; não invente dados sobre o usuário; sem promessas de resultado.
Responda SOMENTE com JSON no formato:
{"title":"...","description":"...","objective":"resultado esperado","difficulty":"medio","dueInDays":14,
 "tasks":[{"title":"...","description":"...","priority":"Baixa|Média|Alta","difficulty":"facil","dueInDays":3,"estimateMinutes":45}]}`;
  const result = await generateText(prompt, config);
  if (!result.ok) return { ok: false, message: result.message };
  const json = extractJson(result.text) as Record<string, unknown> | null;
  const title = json ? str(json.title, 160) : null;
  if (!json || !title) return { ok: false, message: "A IA não devolveu um contrato válido. Tente descrever o objetivo de outra forma." };
  const difficulty = isDifficulty(json.difficulty) ? json.difficulty : input.difficulty ?? "medio";
  const tasks = sanitizeTasks(json.tasks, difficulty, 8);
  if (tasks.length === 0) return { ok: false, message: "A IA não sugeriu tarefas utilizáveis. Tente novamente." };
  const dueInDays = typeof json.dueInDays === "number" && Number.isFinite(json.dueInDays) ? Math.min(365, Math.max(1, Math.round(json.dueInDays))) : input.deadlineDays ?? null;
  return {
    ok: true,
    data: { title, description: str(json.description, 600), objective: str(json.objective, 400), difficulty, dueInDays, tasks },
  };
}

/** Gemini sugere as próximas tarefas de um contrato existente, sem repetir as atuais. Nada é salvo. */
export async function proposeContractTasks(db: Client, ownerId: string, id: string, hint?: string): Promise<AiResult<ContractProposal["tasks"]>> {
  const config = await getGeminiConfig();
  if (!config) return { ok: false, message: NO_AI };
  const contract = await getContract(db, ownerId, id);
  const tasks = await listContractTasks(db, ownerId, id);
  const today = await todayKeyFor(db, ownerId);
  const existing = tasks.map((t) => `- [${String(t.status) === "Concluído" ? "x" : " "}] ${String(t.title)}`).join("\n") || "(nenhuma ainda)";
  const prompt = `Você é o LifeOS Copilot. Sugira as próximas tarefas para cumprir este contrato. Hoje é ${today}.
Contrato: ${contract.title}
Descrição: ${contract.description ?? "-"}
Resultado esperado: ${contract.objective ?? "-"}
Dificuldade do contrato: ${contract.difficulty}. Prazo: ${contract.dueDate ?? "sem prazo"}.
Tarefas já existentes (não repita):
${existing}
${hint ? `Pedido do usuário: """${hint.slice(0, 600)}"""` : ""}
${DIFFICULTY_GUIDE}
Entre 2 e 6 tarefas novas, específicas e executáveis. Responda SOMENTE com JSON:
{"tasks":[{"title":"...","description":"...","priority":"Média","difficulty":"medio","dueInDays":5,"estimateMinutes":60}]}`;
  const result = await generateText(prompt, config);
  if (!result.ok) return { ok: false, message: result.message };
  const json = extractJson(result.text) as Record<string, unknown> | null;
  const existingTitles = new Set(tasks.map((t) => String(t.title).trim().toLowerCase()));
  const suggestions = sanitizeTasks(json?.tasks, contract.difficulty, 6).filter((t) => !existingTitles.has(t.title.toLowerCase()));
  if (suggestions.length === 0) return { ok: false, message: "A IA não trouxe tarefas novas para este contrato." };
  return { ok: true, data: suggestions };
}
