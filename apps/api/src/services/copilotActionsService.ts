import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { getGeminiConfig, generateWithTools, type GeminiFunctionDeclaration } from "./geminiService.js";

/**
 * Copilot com ações reais — o próximo passo depois do Copilot que só
 * escrevia texto (insight do dia). Aqui o Gemini pode PROPOR uma ação
 * real (criar tarefa, concluir tarefa, mover tarefa, marcar hábito,
 * criar evento) via function calling, mas NUNCA escreve nada sozinho:
 *
 *   1) proposeAction()  — só lê dados, nunca grava. Resolve qualquer
 *      referência por nome (ex.: "tarefa de revisar o contrato") contra
 *      as tarefas/hábitos reais do usuário; se a referência for
 *      ambígua ou não existir, devolve um pedido de esclarecimento em
 *      vez de adivinhar. O resultado é sempre uma PROPOSTA com um
 *      resumo em português do que seria feito.
 *   2) confirmAction()  — só é chamada depois que o usuário confirma
 *      explicitamente a proposta na tela (nenhuma exceção, nem para
 *      ações "reversíveis" como marcar um hábito). Revalida que a
 *      entidade (tarefa/hábito) ainda existe e pertence ao usuário, e
 *      só então grava.
 *
 * Regra de ouro: entre (1) e (2) nada é escrito no banco. Se o
 * usuário fechar a tela sem confirmar, nada aconteceu.
 */

type Db = ReturnType<typeof getDb>;

const TASK_STATUSES = ["Backlog", "A Fazer", "Em Andamento", "Em Revisão", "Concluído"];
const TASK_PRIORITIES = ["Baixa", "Média", "Alta"];

const ACTION_DECLARATIONS: GeminiFunctionDeclaration[] = [
  {
    name: "criar_tarefa",
    description: "Cria uma nova tarefa para o usuário.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Título da tarefa." },
        dueDate: { type: "string", description: "Prazo no formato YYYY-MM-DD, se mencionado." },
        priority: { type: "string", description: "Prioridade, se mencionada.", enum: TASK_PRIORITIES },
      },
      required: ["title"],
    },
  },
  {
    name: "concluir_tarefa",
    description: "Marca uma tarefa existente do usuário como concluída.",
    parameters: {
      type: "object",
      properties: {
        taskTitle: { type: "string", description: "Título (ou parte dele) da tarefa a concluir, como o usuário descreveu." },
      },
      required: ["taskTitle"],
    },
  },
  {
    name: "mover_tarefa",
    description: "Muda o status/coluna de uma tarefa existente do usuário no Kanban.",
    parameters: {
      type: "object",
      properties: {
        taskTitle: { type: "string", description: "Título (ou parte dele) da tarefa a mover." },
        newStatus: { type: "string", description: "Novo status.", enum: TASK_STATUSES },
      },
      required: ["taskTitle", "newStatus"],
    },
  },
  {
    name: "marcar_habito",
    description: "Registra o check-in de um hábito do usuário num dia.",
    parameters: {
      type: "object",
      properties: {
        habitName: { type: "string", description: "Nome (ou parte dele) do hábito, como o usuário descreveu." },
        date: { type: "string", description: "Data YYYY-MM-DD; se não mencionada, use hoje." },
      },
      required: ["habitName"],
    },
  },
  {
    name: "criar_evento",
    description: "Cria um evento manual no calendário do usuário.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Título do evento." },
        date: { type: "string", description: "Data do evento, formato YYYY-MM-DD." },
      },
      required: ["title", "date"],
    },
  },
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Resolve uma referência por nome contra as linhas candidatas (título/nome contém o texto, sem diferenciar caixa). */
function resolveByName<T extends { title?: string; name?: string }>(
  needle: string,
  candidates: T[]
): { match: T | null; ambiguous: boolean; candidateLabels: string[] } {
  const norm = (s: string) => s.trim().toLowerCase();
  const target = norm(needle);
  const scored = candidates.filter((c) => norm(c.title ?? c.name ?? "").includes(target));
  if (scored.length === 1) return { match: scored[0], ambiguous: false, candidateLabels: [] };
  if (scored.length > 1) {
    return { match: null, ambiguous: true, candidateLabels: scored.slice(0, 5).map((c) => c.title ?? c.name ?? "") };
  }
  return { match: null, ambiguous: false, candidateLabels: [] };
}

export interface ActionProposal {
  action: string;
  summary: string;
  args: Record<string, unknown>;
}

export type ProposeResult =
  | { type: "reply"; text: string }
  | { type: "proposal"; proposal: ActionProposal }
  | { type: "clarify"; message: string }
  | { type: "error"; message: string };

/** Monta o contexto (só o necessário: tarefas abertas e hábitos ativos) pro Gemini conseguir resolver referências por nome. */
async function buildAssistContext(db: Db, ownerId: string) {
  const [tasks, habits] = await Promise.all([
    db.execute({
      sql: "SELECT id, title, status FROM tasks WHERE owner_id = ? AND status != 'Concluído' ORDER BY created_at DESC LIMIT 40",
      args: [ownerId],
    }),
    db.execute({
      sql: "SELECT id, name FROM habits WHERE owner_id = ? AND archived_at IS NULL ORDER BY created_at ASC LIMIT 40",
      args: [ownerId],
    }),
  ]);
  return {
    tasks: tasks.rows as unknown as Array<{ id: string; title: string; status: string }>,
    habits: habits.rows as unknown as Array<{ id: string; name: string }>,
  };
}

function buildAssistPrompt(message: string, ctx: Awaited<ReturnType<typeof buildAssistContext>>): string {
  const lines = [
    "Você é o LifeOS Copilot. O usuário pode pedir para você EXECUTAR uma ação real no app (criar tarefa, concluir tarefa, mover tarefa, marcar hábito, criar evento) ou só conversar/perguntar algo.",
    "",
    `Data de hoje: ${todayISO()}.`,
    "",
    "Tarefas em aberto do usuário (use o título exatamente como está aqui ao chamar uma função):",
    ...(ctx.tasks.length ? ctx.tasks.map((t) => `- "${t.title}" (status: ${t.status})`) : ["- (nenhuma tarefa em aberto)"]),
    "",
    "Hábitos ativos do usuário:",
    ...(ctx.habits.length ? ctx.habits.map((h) => `- "${h.name}"`) : ["- (nenhum hábito cadastrado)"]),
    "",
    `Mensagem do usuário: "${message}"`,
    "",
    "Regras: se a mensagem pedir claramente uma das ações disponíveis, chame a função correspondente com os argumentos extraídos da mensagem (nunca invente um título de tarefa/hábito que não esteja na lista acima ao CONCLUIR/MOVER/MARCAR — para CRIAR uma tarefa/evento novo, use o texto que o usuário pediu). Se a mensagem for uma pergunta, comentário, ou não corresponder a nenhuma ação disponível, responda em texto normal, em português do Brasil, de forma curta e direta — nunca finja executar algo que não é uma das ações disponíveis.",
  ];
  return lines.join("\n");
}

export async function proposeAction(ownerId: string, message: string): Promise<ProposeResult> {
  const config = await getGeminiConfig();
  if (!config) {
    return {
      type: "error",
      message: "A IA do LifeOS Copilot ainda não foi configurada. Peça a um administrador para cadastrar a API Key do Gemini em Configurações.",
    };
  }

  const db = getDb();
  const ctx = await buildAssistContext(db, ownerId);
  const prompt = buildAssistPrompt(message, ctx);

  const result = await generateWithTools(prompt, ACTION_DECLARATIONS, config);
  if (!result.ok) {
    return { type: "error", message: result.message };
  }
  if (!result.functionCall) {
    return { type: "reply", text: result.text ?? "..." };
  }

  const { name, args } = result.functionCall;

  switch (name) {
    case "criar_tarefa": {
      const title = String(args.title ?? "").trim();
      if (!title) return { type: "error", message: "Não entendi o título da tarefa." };
      const dueDate = typeof args.dueDate === "string" && args.dueDate ? args.dueDate : null;
      const priority = typeof args.priority === "string" && TASK_PRIORITIES.includes(args.priority) ? args.priority : "Média";
      return {
        type: "proposal",
        proposal: {
          action: "criar_tarefa",
          args: { title, dueDate, priority },
          summary: `Criar a tarefa "${title}"${dueDate ? ` com prazo ${dueDate}` : ""} (prioridade ${priority}).`,
        },
      };
    }
    case "concluir_tarefa": {
      const needle = String(args.taskTitle ?? "").trim();
      const { match, ambiguous, candidateLabels } = resolveByName(needle, ctx.tasks);
      if (ambiguous) {
        return {
          type: "clarify",
          message: `Encontrei mais de uma tarefa parecida: ${candidateLabels.map((l) => `"${l}"`).join(", ")}. Qual delas?`,
        };
      }
      if (!match) {
        return { type: "clarify", message: `Não encontrei nenhuma tarefa aberta parecida com "${needle}". Pode confirmar o nome?` };
      }
      return {
        type: "proposal",
        proposal: {
          action: "concluir_tarefa",
          args: { taskId: match.id, title: match.title },
          summary: `Marcar a tarefa "${match.title}" como concluída.`,
        },
      };
    }
    case "mover_tarefa": {
      const needle = String(args.taskTitle ?? "").trim();
      const newStatus = String(args.newStatus ?? "").trim();
      if (!TASK_STATUSES.includes(newStatus)) {
        return { type: "clarify", message: `Não reconheci o status "${newStatus}". Os status disponíveis são: ${TASK_STATUSES.join(", ")}.` };
      }
      const { match, ambiguous, candidateLabels } = resolveByName(needle, ctx.tasks);
      if (ambiguous) {
        return {
          type: "clarify",
          message: `Encontrei mais de uma tarefa parecida: ${candidateLabels.map((l) => `"${l}"`).join(", ")}. Qual delas?`,
        };
      }
      if (!match) {
        return { type: "clarify", message: `Não encontrei nenhuma tarefa aberta parecida com "${needle}". Pode confirmar o nome?` };
      }
      return {
        type: "proposal",
        proposal: {
          action: "mover_tarefa",
          args: { taskId: match.id, title: match.title, newStatus },
          summary: `Mover a tarefa "${match.title}" para "${newStatus}".`,
        },
      };
    }
    case "marcar_habito": {
      const needle = String(args.habitName ?? "").trim();
      const date = typeof args.date === "string" && args.date ? args.date : todayISO();
      const { match, ambiguous, candidateLabels } = resolveByName(needle, ctx.habits);
      if (ambiguous) {
        return {
          type: "clarify",
          message: `Encontrei mais de um hábito parecido: ${candidateLabels.map((l) => `"${l}"`).join(", ")}. Qual deles?`,
        };
      }
      if (!match) {
        return { type: "clarify", message: `Não encontrei nenhum hábito parecido com "${needle}". Pode confirmar o nome?` };
      }
      return {
        type: "proposal",
        proposal: {
          action: "marcar_habito",
          args: { habitId: match.id, name: match.name, date },
          summary: `Marcar o hábito "${match.name}" como cumprido em ${date}.`,
        },
      };
    }
    case "criar_evento": {
      const title = String(args.title ?? "").trim();
      const date = String(args.date ?? "").trim();
      if (!title || !date) return { type: "error", message: "Não entendi o título ou a data do evento." };
      return {
        type: "proposal",
        proposal: {
          action: "criar_evento",
          args: { title, date },
          summary: `Criar o evento "${title}" em ${date}.`,
        },
      };
    }
    default:
      return { type: "error", message: `Ação desconhecida proposta pela IA: "${name}".` };
  }
}

export interface ConfirmResult {
  ok: boolean;
  message: string;
}

/**
 * Executa de fato a ação já proposta e confirmada pelo usuário. Cada
 * caso revalida a posse da entidade (tarefa/hábito) antes de gravar —
 * nunca confia cegamente no que veio da proposta, mesmo que ela tenha
 * sido gerada há poucos segundos pelo mesmo backend.
 */
export async function confirmAction(ownerId: string, action: string, args: Record<string, unknown>): Promise<ConfirmResult> {
  const db = getDb();

  switch (action) {
    case "criar_tarefa": {
      const title = String(args.title ?? "").trim();
      if (!title) return { ok: false, message: "Título inválido." };
      const dueDate = typeof args.dueDate === "string" && args.dueDate ? args.dueDate : null;
      const priority = typeof args.priority === "string" && TASK_PRIORITIES.includes(args.priority) ? args.priority : "Média";
      const id = nanoid();
      await db.execute({
        sql: `INSERT INTO tasks (id, owner_id, title, status, priority, due_date) VALUES (?, ?, ?, 'Backlog', ?, ?)`,
        args: [id, ownerId, title, priority, dueDate],
      });
      return { ok: true, message: `Tarefa "${title}" criada.` };
    }
    case "concluir_tarefa": {
      const taskId = String(args.taskId ?? "");
      const existing = await db.execute({ sql: "SELECT title FROM tasks WHERE id = ? AND owner_id = ?", args: [taskId, ownerId] });
      const row = existing.rows[0] as { title?: string } | undefined;
      if (!row) return { ok: false, message: "Essa tarefa não existe mais (ou foi removida)." };
      await db.execute({
        sql: "UPDATE tasks SET status = 'Concluído', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND owner_id = ?",
        args: [taskId, ownerId],
      });
      return { ok: true, message: `Tarefa "${row.title}" concluída.` };
    }
    case "mover_tarefa": {
      const taskId = String(args.taskId ?? "");
      const newStatus = String(args.newStatus ?? "");
      if (!TASK_STATUSES.includes(newStatus)) return { ok: false, message: "Status inválido." };
      const existing = await db.execute({ sql: "SELECT title FROM tasks WHERE id = ? AND owner_id = ?", args: [taskId, ownerId] });
      const row = existing.rows[0] as { title?: string } | undefined;
      if (!row) return { ok: false, message: "Essa tarefa não existe mais (ou foi removida)." };
      await db.execute({
        sql: "UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?",
        args: [newStatus, taskId, ownerId],
      });
      return { ok: true, message: `Tarefa "${row.title}" movida para "${newStatus}".` };
    }
    case "marcar_habito": {
      const habitId = String(args.habitId ?? "");
      const date = typeof args.date === "string" && args.date ? args.date : todayISO();
      const existing = await db.execute({ sql: "SELECT name FROM habits WHERE id = ? AND owner_id = ?", args: [habitId, ownerId] });
      const row = existing.rows[0] as { name?: string } | undefined;
      if (!row) return { ok: false, message: "Esse hábito não existe mais (ou foi removido)." };
      await db.execute({
        sql: `INSERT INTO habit_entries (id, habit_id, owner_id, entry_date, count)
              VALUES (?, ?, ?, ?, 1)
              ON CONFLICT (habit_id, entry_date) DO UPDATE SET count = excluded.count`,
        args: [nanoid(), habitId, ownerId, date],
      });
      return { ok: true, message: `Hábito "${row.name}" marcado em ${date}.` };
    }
    case "criar_evento": {
      const title = String(args.title ?? "").trim();
      const date = String(args.date ?? "").trim();
      if (!title || !date) return { ok: false, message: "Dados do evento inválidos." };
      const id = nanoid();
      await db.execute({
        sql: `INSERT INTO events (id, owner_id, title, starts_at, all_day, source_type) VALUES (?, ?, ?, ?, 1, 'manual')`,
        args: [id, ownerId, title, date],
      });
      return { ok: true, message: `Evento "${title}" criado em ${date}.` };
    }
    default:
      return { ok: false, message: `Ação desconhecida: "${action}".` };
  }
}
