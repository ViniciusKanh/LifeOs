import { z } from "zod";
import { getDb } from "../db/client.js";
import { getGeminiConfig, generateWithTools, type GeminiFunctionDeclaration } from "./geminiService.js";
import { awardHabitCheckIn, dayKeyIn, userTimezone } from "./gamificationService.js";
import {
  WORKOUT_CATEGORY_LABELS,
  inferWorkoutCategory,
  insertMoodEntry,
  insertSleepEntry,
  insertWaterEntry,
  insertWorkout,
  nowIso,
  offsetForTimeZone,
  type WorkoutCategory,
} from "./healthService.js";
import { TASK_STATUSES, insertTask, moveTaskStatus } from "./taskWriteService.js";
import { insertGoal } from "./goalWriteService.js";
import { insertInboxItem } from "./inboxService.js";
import { insertReadingSession } from "./readingSessionService.js";
import { insertProject } from "./projectDetailsService.js";
import { insertManualEvent } from "./eventWriteService.js";
import { fold, inferFightModality, parseLocalCommand, resolveDateWord, type LocalCommand } from "./copilotCommandParser.js";
import { createTaskSchema } from "../validators/task.schema.js";
import { createGoalSchema } from "../validators/goals.schema.js";
import { createProjectSchema } from "../validators/project.schema.js";
import { createInboxItemSchema } from "../validators/inbox.schema.js";
import { createEventSchema } from "../validators/event.schema.js";
import { moodEntrySchema, sleepEntrySchema, waterEntrySchema, workoutSchema } from "../validators/health.schema.js";
import { nanoid } from "nanoid";

/**
 * Copilot com ações reais (Copilot + Paleta de comandos Ctrl/Cmd+K).
 *
 *   1) proposeAction() / previewLocalCommand() — SÓ LEEM dados. Primeiro
 *      tentam o parser local determinístico (copilotCommandParser: "bebi
 *      500ml", "treino jiu-jitsu 60min"...); o Gemini (function calling)
 *      só entra para o que o parser não reconhece. Referências por nome
 *      (tarefa, hábito, livro) são resolvidas contra os dados reais do
 *      usuário; ambiguidade ou ausência viram pedido de esclarecimento,
 *      nunca palpite. O resultado é sempre uma PROPOSTA com prévia.
 *   2) confirmAction() — só depois do clique explícito em "Confirmar".
 *      Revalida os argumentos com zod (os mesmos schemas das rotas),
 *      revalida a posse de tudo que é referenciado e grava usando as
 *      MESMAS funções de service que as rotas usam — por isso XP,
 *      Timeline, conquistas, contratos e hábitos automáticos reagem
 *      exatamente como se o registro tivesse sido feito pela tela.
 *
 * Regra de ouro: entre (1) e (2) nada é escrito no banco.
 */

type Db = ReturnType<typeof getDb>;

export const COPILOT_ACTIONS = [
  "criar_tarefa",
  "concluir_tarefa",
  "mover_tarefa",
  "marcar_habito",
  "criar_evento",
  "criar_meta",
  "criar_projeto",
  "capturar_inbox",
  "registrar_agua",
  "registrar_treino",
  "registrar_leitura",
  "registrar_sono",
  "registrar_humor",
] as const;
export type CopilotAction = (typeof COPILOT_ACTIONS)[number];

const TASK_PRIORITIES = ["Baixa", "Média", "Alta"] as const;

/* --------------------------- Declarações IA --------------------------- */

const DATE_HINT = "Data YYYY-MM-DD ou palavra relativa (hoje, ontem, amanhã, sexta...). Se não mencionada, omita.";

const ACTION_DECLARATIONS: GeminiFunctionDeclaration[] = [
  {
    name: "criar_tarefa",
    description: "Cria uma nova tarefa (missão) para o usuário.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Título da tarefa." },
        dueDate: { type: "string", description: `Prazo. ${DATE_HINT}` },
        priority: { type: "string", description: "Prioridade, se mencionada.", enum: [...TASK_PRIORITIES] },
      },
      required: ["title"],
    },
  },
  {
    name: "concluir_tarefa",
    description: "Marca uma tarefa existente do usuário como concluída.",
    parameters: {
      type: "object",
      properties: { taskTitle: { type: "string", description: "Título (ou parte dele) da tarefa a concluir." } },
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
        newStatus: { type: "string", description: "Novo status.", enum: [...TASK_STATUSES] },
      },
      required: ["taskTitle", "newStatus"],
    },
  },
  {
    name: "marcar_habito",
    description: "Registra o check-in (cumprimento) de um hábito do usuário num dia.",
    parameters: {
      type: "object",
      properties: {
        habitName: { type: "string", description: "Nome (ou parte dele) do hábito." },
        date: { type: "string", description: DATE_HINT },
      },
      required: ["habitName"],
    },
  },
  {
    name: "criar_evento",
    description: "Cria um evento de dia inteiro no calendário do usuário.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Título do evento." },
        date: { type: "string", description: DATE_HINT },
      },
      required: ["title", "date"],
    },
  },
  {
    name: "criar_meta",
    description: "Cria uma nova meta para o usuário.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Título da meta." },
        dueDate: { type: "string", description: `Prazo. ${DATE_HINT}` },
      },
      required: ["title"],
    },
  },
  {
    name: "criar_projeto",
    description: "Cria um novo projeto.",
    parameters: { type: "object", properties: { name: { type: "string", description: "Nome do projeto." } }, required: ["name"] },
  },
  {
    name: "capturar_inbox",
    description: "Guarda uma nota/ideia rápida na Inbox para processar depois.",
    parameters: { type: "object", properties: { content: { type: "string", description: "Texto da nota." } }, required: ["content"] },
  },
  {
    name: "registrar_agua",
    description: "Registra água bebida.",
    parameters: {
      type: "object",
      properties: {
        amountMl: { type: "number", description: "Quantidade em mililitros." },
        date: { type: "string", description: DATE_HINT },
      },
      required: ["amountMl"],
    },
  },
  {
    name: "registrar_treino",
    description: "Registra um treino/exercício já realizado.",
    parameters: {
      type: "object",
      properties: {
        activity: { type: "string", description: "Atividade como o usuário disse (ex.: jiu-jitsu, corrida, musculação)." },
        durationMinutes: { type: "number", description: "Duração em minutos." },
        date: { type: "string", description: DATE_HINT },
      },
      required: ["activity", "durationMinutes"],
    },
  },
  {
    name: "registrar_leitura",
    description: "Registra páginas lidas de um livro da biblioteca do usuário.",
    parameters: {
      type: "object",
      properties: {
        bookTitle: { type: "string", description: "Título (ou parte dele) do livro." },
        pagesRead: { type: "number", description: "Páginas lidas." },
        durationMinutes: { type: "number", description: "Duração em minutos, se mencionada." },
        date: { type: "string", description: DATE_HINT },
      },
      required: ["bookTitle", "pagesRead"],
    },
  },
  {
    name: "registrar_sono",
    description: "Registra uma noite de sono com horário de dormir e de acordar.",
    parameters: {
      type: "object",
      properties: {
        bedTime: { type: "string", description: "Horário em que dormiu, HH:MM (24h)." },
        wakeTime: { type: "string", description: "Horário em que acordou, HH:MM (24h)." },
        date: { type: "string", description: `Dia em que acordou. ${DATE_HINT}` },
      },
      required: ["bedTime", "wakeTime"],
    },
  },
  {
    name: "registrar_humor",
    description: "Registra humor e energia (ambos de 1 a 5).",
    parameters: {
      type: "object",
      properties: {
        mood: { type: "number", description: "Humor de 1 a 5." },
        energy: { type: "number", description: "Energia de 1 a 5." },
        date: { type: "string", description: DATE_HINT },
      },
      required: ["mood", "energy"],
    },
  },
];

/* ------------------------------ Tipos ------------------------------ */

export interface ProposalDetail {
  label: string;
  value: string;
}

export interface ActionProposal {
  action: CopilotAction;
  /** Frase curta do que será feito. */
  summary: string;
  /** Campos da prévia (o que exatamente será gravado). */
  details: ProposalDetail[];
  /** Argumentos já resolvidos — reenviados tal qual para /assist/confirm. */
  args: Record<string, unknown>;
  /** "local" = parser determinístico; "ia" = interpretado pelo Gemini. */
  source: "local" | "ia";
}

export type ProposeResult =
  | { type: "reply"; text: string }
  | { type: "proposal"; proposal: ActionProposal }
  | { type: "clarify"; message: string }
  | { type: "error"; message: string };

/* ---------------------------- Utilitários ---------------------------- */

interface UserClock {
  tz: string;
  todayKey: string;
}

async function userClock(db: Db, ownerId: string): Promise<UserClock> {
  const tz = await userTimezone(db, ownerId);
  return { tz, todayKey: dayKeyIn(new Date(), tz) };
}

function addDays(dateKey: string, n: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "hoje (23/10)", "ontem (22/10)", "sex., 24/10". */
export function dayLabel(dateKey: string, todayKey: string): string {
  const [y, m, d] = dateKey.split("-");
  const short = `${d}/${m}${y !== todayKey.slice(0, 4) ? `/${y}` : ""}`;
  if (dateKey === todayKey) return `hoje (${short})`;
  if (dateKey === addDays(todayKey, -1)) return `ontem (${short})`;
  if (dateKey === addDays(todayKey, 1)) return `amanhã (${short})`;
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" }).format(new Date(`${dateKey}T00:00:00Z`));
  return `${weekday}, ${short}`;
}

/** Instante UTC (ISO) de um horário local HH:MM num dia, no fuso do usuário. */
export function localInstantIso(dateKey: string, hhmm: string, tz: string): string {
  const [y, mo, d] = dateKey.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  // offsetForTimeZone segue getTimezoneOffset(): positivo atrás de UTC (São Paulo = +180).
  const offset = offsetForTimeZone(tz, new Date(naive));
  return new Date(naive + offset * 60_000).toISOString();
}

/**
 * Instante a gravar num registro (água, treino, leitura, humor) de um dia:
 * hoje → agora; dia passado → meio-dia local (cai no dia certo em
 * qualquer leitura por "dia local" do Analytics/Timeline).
 */
function instantForDay(dateKey: string, clock: UserClock): string {
  return dateKey === clock.todayKey ? nowIso() : localInstantIso(dateKey, "12:00", clock.tz);
}

/** Resolve uma referência por nome (sem diferenciar caixa/acento); título exato vence. */
function resolveByName<T>(needle: string, candidates: T[], labelOf: (c: T) => string) {
  const target = fold(needle.trim());
  if (!target) return { match: null as T | null, ambiguous: false, candidateLabels: [] as string[] };
  const exact = candidates.filter((c) => fold(labelOf(c).trim()) === target);
  if (exact.length === 1) return { match: exact[0], ambiguous: false, candidateLabels: [] };
  const partial = candidates.filter((c) => fold(labelOf(c)).includes(target));
  if (partial.length === 1) return { match: partial[0], ambiguous: false, candidateLabels: [] };
  if (partial.length > 1) return { match: null, ambiguous: true, candidateLabels: partial.slice(0, 5).map(labelOf) };
  return { match: null, ambiguous: false, candidateLabels: [] };
}

const quoteList = (labels: string[]) => labels.map((l) => `"${l}"`).join(", ");

/* ----------------------------- Contexto ----------------------------- */

interface AssistContext {
  tasks: Array<{ id: string; title: string; status: string }>;
  habits: Array<{ id: string; name: string }>;
  books: Array<{ id: string; title: string; status: string; current_page: number; total_pages: number | null }>;
}

/** Só o necessário (e só do dono) para resolver referências por nome. */
async function buildAssistContext(db: Db, ownerId: string): Promise<AssistContext> {
  const [tasks, habits, books] = await Promise.all([
    db.execute({
      sql: "SELECT id, title, status FROM tasks WHERE owner_id = ? AND status != 'Concluído' ORDER BY created_at DESC LIMIT 60",
      args: [ownerId],
    }),
    db.execute({
      sql: "SELECT id, name FROM habits WHERE owner_id = ? AND archived_at IS NULL ORDER BY created_at ASC LIMIT 60",
      args: [ownerId],
    }),
    db.execute({
      sql: `SELECT id, title, status, current_page, total_pages FROM books WHERE owner_id = ?
            ORDER BY CASE status WHEN 'Lendo' THEN 0 WHEN 'Pausado' THEN 1 WHEN 'Quero Ler' THEN 2 ELSE 3 END, updated_at DESC LIMIT 80`,
      args: [ownerId],
    }),
  ]);
  return {
    tasks: tasks.rows as unknown as AssistContext["tasks"],
    habits: habits.rows as unknown as AssistContext["habits"],
    books: books.rows as unknown as AssistContext["books"],
  };
}

/* ---------------------------- Propostas ---------------------------- */

const proposal = (p: Omit<ActionProposal, "source">, source: ActionProposal["source"]): ProposeResult => ({
  type: "proposal",
  proposal: { ...p, source },
});

/** Registros não podem ficar no futuro (evita "treinei amanhã"). */
const futureLog = (date: string, clock: UserClock): ProposeResult | null =>
  date > clock.todayKey ? { type: "clarify", message: "Não dá para registrar algo que ainda não aconteceu — use hoje ou uma data passada." } : null;

/**
 * Transforma uma intenção (vinda do parser local ou do Gemini) em proposta
 * com prévia, resolvendo nomes contra os dados reais do usuário. Só lê.
 */
async function buildProposal(cmd: LocalCommand, ctx: AssistContext, clock: UserClock, source: ActionProposal["source"]): Promise<ProposeResult> {
  switch (cmd.action) {
    case "esclarecer":
      return { type: "clarify", message: cmd.message };

    case "criar_tarefa": {
      const details: ProposalDetail[] = [
        { label: "Título", value: cmd.title },
        { label: "Prioridade", value: cmd.priority },
        { label: "Prazo", value: cmd.dueDate ? dayLabel(cmd.dueDate, clock.todayKey) : "sem prazo" },
        { label: "Status", value: "A Fazer" },
      ];
      return proposal(
        {
          action: "criar_tarefa",
          args: { title: cmd.title, dueDate: cmd.dueDate, priority: cmd.priority },
          summary: `Criar a tarefa "${cmd.title}"${cmd.dueDate ? ` para ${dayLabel(cmd.dueDate, clock.todayKey)}` : ""} (prioridade ${cmd.priority}).`,
          details,
        },
        source
      );
    }

    case "concluir_tarefa": {
      const { match, ambiguous, candidateLabels } = resolveByName(cmd.taskQuery, ctx.tasks, (t) => t.title);
      if (ambiguous) return { type: "clarify", message: `Encontrei mais de uma tarefa parecida: ${quoteList(candidateLabels)}. Qual delas?` };
      if (!match) return { type: "clarify", message: `Não encontrei nenhuma tarefa aberta parecida com "${cmd.taskQuery}". Pode confirmar o nome?` };
      return proposal(
        {
          action: "concluir_tarefa",
          args: { taskId: match.id, title: match.title },
          summary: `Marcar a tarefa "${match.title}" como concluída.`,
          details: [
            { label: "Tarefa", value: match.title },
            { label: "Status", value: `${match.status} → Concluído` },
          ],
        },
        source
      );
    }

    case "marcar_habito": {
      const blocked = futureLog(cmd.date, clock);
      if (blocked) return blocked;
      const { match, ambiguous, candidateLabels } = resolveByName(cmd.habitQuery, ctx.habits, (h) => h.name);
      if (ambiguous) return { type: "clarify", message: `Encontrei mais de um hábito parecido: ${quoteList(candidateLabels)}. Qual deles?` };
      if (!match) return { type: "clarify", message: `Não encontrei nenhum hábito parecido com "${cmd.habitQuery}". Pode confirmar o nome?` };
      return proposal(
        {
          action: "marcar_habito",
          args: { habitId: match.id, name: match.name, date: cmd.date },
          summary: `Marcar o hábito "${match.name}" como cumprido ${dayLabel(cmd.date, clock.todayKey)}.`,
          details: [
            { label: "Hábito", value: match.name },
            { label: "Dia", value: dayLabel(cmd.date, clock.todayKey) },
          ],
        },
        source
      );
    }

    case "criar_meta":
      return proposal(
        {
          action: "criar_meta",
          args: { title: cmd.title, dueDate: cmd.dueDate },
          summary: `Criar a meta "${cmd.title}"${cmd.dueDate ? ` com prazo ${dayLabel(cmd.dueDate, clock.todayKey)}` : ""}.`,
          details: [
            { label: "Meta", value: cmd.title },
            { label: "Prazo", value: cmd.dueDate ? dayLabel(cmd.dueDate, clock.todayKey) : "sem prazo" },
            { label: "Progresso", value: "pelas tarefas vinculadas" },
          ],
        },
        source
      );

    case "criar_projeto":
      return proposal(
        {
          action: "criar_projeto",
          args: { name: cmd.name },
          summary: `Criar o projeto "${cmd.name}".`,
          details: [{ label: "Projeto", value: cmd.name }],
        },
        source
      );

    case "capturar_inbox":
      return proposal(
        {
          action: "capturar_inbox",
          args: { content: cmd.content },
          summary: "Guardar esta nota na Inbox para processar depois.",
          details: [{ label: "Nota", value: cmd.content }],
        },
        source
      );

    case "registrar_agua": {
      const blocked = futureLog(cmd.date, clock);
      if (blocked) return blocked;
      return proposal(
        {
          action: "registrar_agua",
          args: { amountMl: cmd.amountMl, date: cmd.date },
          summary: `Registrar ${cmd.amountMl} ml de água ${dayLabel(cmd.date, clock.todayKey)}.`,
          details: [
            { label: "Água", value: `${cmd.amountMl} ml` },
            { label: "Dia", value: dayLabel(cmd.date, clock.todayKey) },
          ],
        },
        source
      );
    }

    case "registrar_treino": {
      const blocked = futureLog(cmd.date, clock);
      if (blocked) return blocked;
      const typeLabel = WORKOUT_CATEGORY_LABELS[cmd.category];
      return proposal(
        {
          action: "registrar_treino",
          args: { activity: cmd.activity, category: cmd.category, modality: cmd.modality, durationMinutes: cmd.durationMinutes, date: cmd.date },
          summary: `Registrar treino de ${cmd.activity} (${cmd.durationMinutes} min) ${dayLabel(cmd.date, clock.todayKey)}.`,
          details: [
            { label: "Atividade", value: cmd.activity },
            { label: "Tipo", value: typeLabel },
            { label: "Duração", value: `${cmd.durationMinutes} min` },
            { label: "Dia", value: dayLabel(cmd.date, clock.todayKey) },
          ],
        },
        source
      );
    }

    case "registrar_leitura": {
      const blocked = futureLog(cmd.date, clock);
      if (blocked) return blocked;
      // Prefere livros em andamento; só procura no acervo todo se não achar nenhum.
      const active = ctx.books.filter((b) => b.status === "Lendo" || b.status === "Pausado");
      let found = resolveByName(cmd.bookQuery, active, (b) => b.title);
      if (!found.match && !found.ambiguous) found = resolveByName(cmd.bookQuery, ctx.books, (b) => b.title);
      if (found.ambiguous) return { type: "clarify", message: `Encontrei mais de um livro parecido: ${quoteList(found.candidateLabels)}. Qual deles?` };
      const book = found.match;
      if (!book) {
        return { type: "clarify", message: `Não encontrei "${cmd.bookQuery}" na sua Biblioteca. Cadastre o livro primeiro ou confira o título.` };
      }
      const current = Number(book.current_page ?? 0);
      const total = book.total_pages == null ? null : Number(book.total_pages);
      const after = current + cmd.pagesRead;
      const details: ProposalDetail[] = [
        { label: "Livro", value: book.title },
        { label: "Páginas", value: `${cmd.pagesRead}` },
        { label: "Progresso", value: `pág. ${current} → ${after}${total ? ` de ${total}` : ""}` },
        { label: "Dia", value: dayLabel(cmd.date, clock.todayKey) },
      ];
      if (cmd.durationMinutes) details.splice(2, 0, { label: "Duração", value: `${cmd.durationMinutes} min` });
      return proposal(
        {
          action: "registrar_leitura",
          args: { bookId: book.id, title: book.title, pagesRead: cmd.pagesRead, durationMinutes: cmd.durationMinutes, date: cmd.date },
          summary: `Registrar ${cmd.pagesRead} páginas lidas de "${book.title}" ${dayLabel(cmd.date, clock.todayKey)}.`,
          details,
        },
        source
      );
    }

    case "registrar_sono": {
      const blocked = futureLog(cmd.date, clock);
      if (blocked) return blocked;
      const span = sleepSpan(cmd.date, cmd.bedTime, cmd.wakeTime, clock.tz);
      const hours = Math.floor(span.minutes / 60);
      const mins = span.minutes % 60;
      return proposal(
        {
          action: "registrar_sono",
          args: { date: cmd.date, bedTime: cmd.bedTime, wakeTime: cmd.wakeTime },
          summary: `Registrar sono das ${cmd.bedTime} às ${cmd.wakeTime} (${hours}h${mins ? String(mins).padStart(2, "0") : ""}), acordando ${dayLabel(cmd.date, clock.todayKey)}.`,
          details: [
            { label: "Dormiu", value: cmd.bedTime },
            { label: "Acordou", value: `${cmd.wakeTime} · ${dayLabel(cmd.date, clock.todayKey)}` },
            { label: "Duração", value: `${hours}h${mins ? String(mins).padStart(2, "0") : ""}` },
          ],
        },
        source
      );
    }

    case "registrar_humor": {
      const blocked = futureLog(cmd.date, clock);
      if (blocked) return blocked;
      return proposal(
        {
          action: "registrar_humor",
          args: { mood: cmd.mood, energy: cmd.energy, date: cmd.date },
          summary: `Registrar humor ${cmd.mood}/5 e energia ${cmd.energy}/5 ${dayLabel(cmd.date, clock.todayKey)}.`,
          details: [
            { label: "Humor", value: `${cmd.mood}/5` },
            { label: "Energia", value: `${cmd.energy}/5` },
            { label: "Dia", value: dayLabel(cmd.date, clock.todayKey) },
          ],
        },
        source
      );
    }
  }
}

/** Dormir/acordar: o "dia" é o do despertar; se a hora de dormir é maior, foi na véspera. */
function sleepSpan(wakeDate: string, bedTime: string, wakeTime: string, tz: string) {
  const bedDate = bedTime >= wakeTime ? addDays(wakeDate, -1) : wakeDate;
  const wentToBedAt = localInstantIso(bedDate, bedTime, tz);
  const wokeUpAt = localInstantIso(wakeDate, wakeTime, tz);
  return { wentToBedAt, wokeUpAt, minutes: Math.round((Date.parse(wokeUpAt) - Date.parse(wentToBedAt)) / 60_000) };
}

/* --------------------- Gemini → intenção estruturada --------------------- */

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() ? Number(v) : NaN);
const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/**
 * Converte a chamada de função do Gemini numa intenção igual à do parser
 * local (mesmo caminho de resolução/validação daí em diante). Datas
 * relativas são resolvidas aqui, no fuso do usuário — nunca confiamos no
 * "hoje" da IA.
 */
function commandFromGemini(name: string, args: Record<string, unknown>, clock: UserClock): LocalCommand | { error: string } {
  const date = (key: string, direction: "past" | "future", fallback: string | null) => {
    const raw = str(args[key]);
    if (!raw) return fallback;
    return resolveDateWord(raw, clock.todayKey, direction) ?? undefined;
  };
  const badDate = { error: "Não entendi a data mencionada." };
  switch (name) {
    case "criar_tarefa": {
      const title = str(args.title).slice(0, 200);
      if (!title) return { error: "Não entendi o título da tarefa." };
      const dueDate = date("dueDate", "future", null);
      if (dueDate === undefined) return badDate;
      const p = str(args.priority);
      const priority = (TASK_PRIORITIES as readonly string[]).includes(p) ? (p as (typeof TASK_PRIORITIES)[number]) : "Média";
      return { action: "criar_tarefa", title, dueDate, priority };
    }
    case "concluir_tarefa":
      return { action: "concluir_tarefa", taskQuery: str(args.taskTitle) };
    case "marcar_habito": {
      const d = date("date", "past", clock.todayKey);
      if (!d) return badDate;
      return { action: "marcar_habito", habitQuery: str(args.habitName), date: d };
    }
    case "criar_meta": {
      const title = str(args.title).slice(0, 160);
      if (!title) return { error: "Não entendi o título da meta." };
      const dueDate = date("dueDate", "future", null);
      if (dueDate === undefined) return badDate;
      return { action: "criar_meta", title, dueDate };
    }
    case "criar_projeto": {
      const n = str(args.name).slice(0, 160);
      return n ? { action: "criar_projeto", name: n } : { error: "Não entendi o nome do projeto." };
    }
    case "capturar_inbox": {
      const content = str(args.content).slice(0, 2000);
      return content ? { action: "capturar_inbox", content } : { error: "Não entendi o texto da nota." };
    }
    case "registrar_agua": {
      const amountMl = Math.round(num(args.amountMl));
      if (!(amountMl >= 1 && amountMl <= 5000)) return { error: "Informe uma quantidade de água entre 1 ml e 5 litros." };
      const d = date("date", "past", clock.todayKey);
      if (!d) return badDate;
      return { action: "registrar_agua", amountMl, date: d };
    }
    case "registrar_treino": {
      const activity = str(args.activity).slice(0, 80);
      const minutes = Math.round(num(args.durationMinutes));
      if (!activity) return { error: "Não entendi qual foi o treino." };
      if (!(minutes >= 1 && minutes <= 600)) return { error: "Informe a duração do treino (1 a 600 minutos)." };
      const d = date("date", "past", clock.todayKey);
      if (!d) return badDate;
      const category = inferWorkoutCategory(activity);
      return {
        action: "registrar_treino",
        activity: activity[0].toUpperCase() + activity.slice(1),
        category,
        modality: category === "luta" ? inferFightModality(activity) ?? "outra" : null,
        durationMinutes: minutes,
        date: d,
      };
    }
    case "registrar_leitura": {
      const pages = Math.round(num(args.pagesRead));
      if (!(pages >= 1 && pages <= 2000)) return { error: "Informe quantas páginas foram lidas (1 a 2000)." };
      const minutes = Math.round(num(args.durationMinutes));
      const d = date("date", "past", clock.todayKey);
      if (!d) return badDate;
      return {
        action: "registrar_leitura",
        bookQuery: str(args.bookTitle),
        pagesRead: pages,
        durationMinutes: minutes >= 1 && minutes <= 1440 ? minutes : null,
        date: d,
      };
    }
    case "registrar_sono": {
      const bed = HHMM.exec(str(args.bedTime));
      const wake = HHMM.exec(str(args.wakeTime));
      if (!bed || !wake) return { error: "Preciso do horário em que você dormiu e acordou (ex.: 23:00 e 07:00)." };
      const d = date("date", "past", clock.todayKey);
      if (!d) return badDate;
      const fmt = (m: RegExpExecArray) => `${m[1].padStart(2, "0")}:${m[2]}`;
      return { action: "registrar_sono", date: d, bedTime: fmt(bed), wakeTime: fmt(wake) };
    }
    case "registrar_humor": {
      const mood = Math.round(num(args.mood));
      const energy = Math.round(num(args.energy));
      if (!(mood >= 1 && mood <= 5 && energy >= 1 && energy <= 5)) return { error: "Humor e energia precisam ir de 1 a 5." };
      const d = date("date", "past", clock.todayKey);
      if (!d) return badDate;
      return { action: "registrar_humor", mood, energy, date: d };
    }
    default:
      return { error: `Ação desconhecida proposta pela IA: "${name}".` };
  }
}

function buildAssistPrompt(message: string, ctx: AssistContext, clock: UserClock): string {
  return [
    "Você é o LifeOS Copilot. O usuário pode pedir para EXECUTAR uma ação real no app (criar tarefa/meta/projeto/evento, concluir ou mover tarefa, marcar hábito, guardar nota na Inbox, registrar água, treino, leitura, sono ou humor) ou só conversar/perguntar algo.",
    "",
    `Hoje é ${clock.todayKey} (fuso ${clock.tz}).`,
    "",
    "Tarefas em aberto (use o título exatamente como aqui ao concluir/mover):",
    ...(ctx.tasks.length ? ctx.tasks.map((t) => `- "${t.title}" (status: ${t.status})`) : ["- (nenhuma)"]),
    "",
    "Hábitos ativos:",
    ...(ctx.habits.length ? ctx.habits.map((h) => `- "${h.name}"`) : ["- (nenhum)"]),
    "",
    "Livros da biblioteca:",
    ...(ctx.books.length ? ctx.books.slice(0, 40).map((b) => `- "${b.title}" (${b.status})`) : ["- (nenhum)"]),
    "",
    `Mensagem do usuário: "${message}"`,
    "",
    "Regras: se a mensagem pedir claramente uma das ações, chame a função correspondente com os argumentos extraídos da mensagem. Nunca invente tarefa, hábito ou livro que não esteja nas listas acima; nunca invente números (quantidade, duração, páginas, horários) que o usuário não disse. Se faltar um dado obrigatório, ou se for pergunta/comentário, responda em texto curto, em português do Brasil — nunca finja executar algo.",
  ].join("\n");
}

/* ------------------------------ Propor ------------------------------ */

/**
 * Prévia SÓ com o parser local (sem IA, sem cota): usada pela paleta
 * enquanto o usuário digita. null = nenhum comando local reconhecido.
 */
export async function previewLocalCommand(ownerId: string, message: string): Promise<ProposeResult | null> {
  const db = getDb();
  const clock = await userClock(db, ownerId);
  const cmd = parseLocalCommand(message, clock.todayKey);
  if (!cmd) return null;
  const ctx = await buildAssistContext(db, ownerId);
  return buildProposal(cmd, ctx, clock, "local");
}

export async function proposeAction(ownerId: string, message: string): Promise<ProposeResult> {
  const local = await previewLocalCommand(ownerId, message);
  if (local) return local;

  const config = await getGeminiConfig();
  if (!config) {
    return {
      type: "error",
      message:
        'Não reconheci um comando rápido e a IA do Copilot ainda não foi configurada (peça a um administrador para cadastrar a API Key do Gemini). Tente algo como "bebi 500ml", "treino corrida 30min" ou "tarefa revisar relatório sexta".',
    };
  }

  const db = getDb();
  const [ctx, clock] = await Promise.all([buildAssistContext(db, ownerId), userClock(db, ownerId)]);
  const result = await generateWithTools(buildAssistPrompt(message, ctx, clock), ACTION_DECLARATIONS, config);
  if (!result.ok) return { type: "error", message: result.message };
  if (!result.functionCall) return { type: "reply", text: result.text ?? "..." };

  const { name, args } = result.functionCall;

  // Duas ações que o parser local não cobre: mover tarefa e criar evento.
  if (name === "mover_tarefa") {
    const newStatus = str(args.newStatus);
    if (!(TASK_STATUSES as readonly string[]).includes(newStatus)) {
      return { type: "clarify", message: `Não reconheci o status "${newStatus}". Os status disponíveis são: ${TASK_STATUSES.join(", ")}.` };
    }
    const needle = str(args.taskTitle);
    const { match, ambiguous, candidateLabels } = resolveByName(needle, ctx.tasks, (t) => t.title);
    if (ambiguous) return { type: "clarify", message: `Encontrei mais de uma tarefa parecida: ${quoteList(candidateLabels)}. Qual delas?` };
    if (!match) return { type: "clarify", message: `Não encontrei nenhuma tarefa aberta parecida com "${needle}". Pode confirmar o nome?` };
    return proposal(
      {
        action: "mover_tarefa",
        args: { taskId: match.id, title: match.title, newStatus },
        summary: `Mover a tarefa "${match.title}" para "${newStatus}".`,
        details: [
          { label: "Tarefa", value: match.title },
          { label: "Status", value: `${match.status} → ${newStatus}` },
        ],
      },
      "ia"
    );
  }
  if (name === "criar_evento") {
    const title = str(args.title).slice(0, 200);
    const date = resolveDateWord(str(args.date), clock.todayKey, "future");
    if (!title || !date) return { type: "error", message: "Não entendi o título ou a data do evento." };
    return proposal(
      {
        action: "criar_evento",
        args: { title, date },
        summary: `Criar o evento "${title}" em ${dayLabel(date, clock.todayKey)}.`,
        details: [
          { label: "Evento", value: title },
          { label: "Dia", value: `${dayLabel(date, clock.todayKey)} · dia inteiro` },
        ],
      },
      "ia"
    );
  }

  const cmd = commandFromGemini(name, args, clock);
  if ("error" in cmd) return { type: "error", message: cmd.error };
  return buildProposal(cmd, ctx, clock, "ia");
}

/* ------------------------------ Confirmar ------------------------------ */

const dateKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), "Data inválida.");
const idSchema = z.string().trim().min(1).max(64);
const hhmmSchema = z.string().regex(HHMM, "Horário inválido.");

const CONFIRM_SCHEMAS = {
  criar_tarefa: z.object({
    title: z.string().trim().min(1).max(200),
    dueDate: dateKeySchema.nullable().optional(),
    priority: z.enum(TASK_PRIORITIES).optional().default("Média"),
  }),
  concluir_tarefa: z.object({ taskId: idSchema }),
  mover_tarefa: z.object({ taskId: idSchema, newStatus: z.enum(TASK_STATUSES) }),
  marcar_habito: z.object({ habitId: idSchema, date: dateKeySchema }),
  criar_evento: z.object({ title: z.string().trim().min(1).max(200), date: dateKeySchema }),
  criar_meta: z.object({ title: z.string().trim().min(1).max(160), dueDate: dateKeySchema.nullable().optional() }),
  criar_projeto: z.object({ name: z.string().trim().min(1).max(160) }),
  capturar_inbox: z.object({ content: z.string().trim().min(1).max(2000) }),
  registrar_agua: z.object({ amountMl: z.number().int().min(1).max(5000), date: dateKeySchema }),
  registrar_treino: z.object({
    activity: z.string().trim().min(1).max(80),
    category: z.string().optional(),
    modality: z.string().nullable().optional(),
    durationMinutes: z.number().int().min(1).max(600),
    date: dateKeySchema,
  }),
  registrar_leitura: z.object({
    bookId: idSchema,
    pagesRead: z.number().int().min(1).max(2000),
    durationMinutes: z.number().int().min(1).max(1440).nullable().optional(),
    date: dateKeySchema,
  }),
  registrar_sono: z.object({ date: dateKeySchema, bedTime: hhmmSchema, wakeTime: hhmmSchema }),
  registrar_humor: z.object({ mood: z.number().int().min(1).max(5), energy: z.number().int().min(1).max(5), date: dateKeySchema }),
} satisfies Record<CopilotAction, z.ZodTypeAny>;

export interface ConfirmResult {
  ok: boolean;
  message: string;
  /** Tela para abrir o que foi criado/alterado (opcional). */
  link?: string;
}

const fail = (message: string): ConfirmResult => ({ ok: false, message });
const notFuture = (date: string, clock: UserClock) => (date > clock.todayKey ? fail("Não dá para registrar algo numa data futura.") : null);

function isCopilotAction(v: string): v is CopilotAction {
  return (COPILOT_ACTIONS as readonly string[]).includes(v);
}

/**
 * Executa a ação já proposta e EXPLICITAMENTE confirmada pelo usuário.
 * Nunca confia no que veio da proposta: revalida tudo e a posse.
 */
export async function confirmAction(ownerId: string, action: string, rawArgs: Record<string, unknown>): Promise<ConfirmResult> {
  if (!isCopilotAction(action)) return fail(`Ação desconhecida: "${action}".`);
  const parsed = CONFIRM_SCHEMAS[action].safeParse(rawArgs);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados da ação inválidos.");
  const db = getDb();
  const clock = await userClock(db, ownerId);
  return executeAction(db, ownerId, clock, action, parsed.data as Record<string, unknown>);
}

async function executeAction(db: Db, ownerId: string, clock: UserClock, action: CopilotAction, a: Record<string, unknown>): Promise<ConfirmResult> {
  switch (action) {
    case "criar_tarefa": {
      const input = createTaskSchema.parse({ title: a.title, priority: a.priority, dueDate: a.dueDate ?? null, status: "A Fazer" });
      const created = (await insertTask(db, ownerId, input)) as unknown as { id: string };
      return { ok: true, message: `Tarefa "${input.title}" criada.`, link: `/tarefas?task=${created.id}` };
    }
    case "concluir_tarefa":
    case "mover_tarefa": {
      const taskId = String(a.taskId);
      const status = action === "concluir_tarefa" ? "Concluído" : String(a.newStatus);
      const existing = await db.execute({ sql: "SELECT title FROM tasks WHERE id = ? AND owner_id = ?", args: [taskId, ownerId] });
      const row = existing.rows[0] as unknown as { title: string } | undefined;
      if (!row) return fail("Essa tarefa não existe mais (ou foi removida).");
      // Mesmo caminho do Kanban: recorrência, hábito vinculado, XP e contrato.
      if (!(await moveTaskStatus(db, ownerId, taskId, status))) return fail("Essa tarefa não existe mais (ou foi removida).");
      return {
        ok: true,
        message: status === "Concluído" ? `Tarefa "${row.title}" concluída.` : `Tarefa "${row.title}" movida para "${status}".`,
        link: `/tarefas?task=${taskId}`,
      };
    }
    case "marcar_habito": {
      const habitId = String(a.habitId);
      const date = String(a.date);
      const blocked = notFuture(date, clock);
      if (blocked) return blocked;
      const existing = await db.execute({
        sql: "SELECT name, target_count FROM habits WHERE id = ? AND owner_id = ? AND archived_at IS NULL",
        args: [habitId, ownerId],
      });
      const row = existing.rows[0] as unknown as { name: string; target_count: number | null } | undefined;
      if (!row) return fail("Esse hábito não existe mais (ou foi arquivado).");
      // "Cumprido" = meta do dia atingida; MAX evita reduzir um check-in maior já feito na tela.
      const count = Math.max(1, Number(row.target_count ?? 1));
      await db.execute({
        sql: `INSERT INTO habit_entries (id, habit_id, owner_id, entry_date, count)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT (habit_id, entry_date) DO UPDATE SET count = MAX(habit_entries.count, excluded.count)`,
        args: [nanoid(), habitId, ownerId, date, count],
      });
      await awardHabitCheckIn(db, ownerId, habitId, date);
      return { ok: true, message: `Hábito "${row.name}" marcado ${dayLabel(date, clock.todayKey)}.`, link: "/habitos" };
    }
    case "criar_evento": {
      const input = createEventSchema.parse({ title: a.title, startsAt: a.date, allDay: true });
      await insertManualEvent(db, ownerId, input);
      return { ok: true, message: `Evento "${input.title}" criado em ${dayLabel(String(a.date), clock.todayKey)}.`, link: "/calendario" };
    }
    case "criar_meta": {
      const input = createGoalSchema.parse({ title: a.title, dueDate: a.dueDate ?? undefined, kind: "task_based" });
      const created = (await insertGoal(db, ownerId, input)) as unknown as { id: string };
      return { ok: true, message: `Meta "${input.title}" criada.`, link: "/metas" };
    }
    case "criar_projeto": {
      const input = createProjectSchema.parse({ name: a.name });
      const created = await insertProject(db, ownerId, input);
      const id = (created as { id?: unknown } | null)?.id;
      return { ok: true, message: `Projeto "${input.name}" criado.`, link: id ? `/projetos/${String(id)}` : "/projetos" };
    }
    case "capturar_inbox": {
      const input = createInboxItemSchema.parse({ content: a.content });
      await insertInboxItem(db, ownerId, input.content);
      return { ok: true, message: "Nota guardada na Inbox.", link: "/inbox" };
    }
    case "registrar_agua": {
      const date = String(a.date);
      const blocked = notFuture(date, clock);
      if (blocked) return blocked;
      const input = waterEntrySchema.parse({ amountMl: a.amountMl, recordedAt: instantForDay(date, clock) });
      await insertWaterEntry(db, ownerId, input);
      return { ok: true, message: `${input.amountMl} ml de água registrados.`, link: "/saude" };
    }
    case "registrar_treino": {
      const date = String(a.date);
      const blocked = notFuture(date, clock);
      if (blocked) return blocked;
      const activity = String(a.activity);
      // A categoria é sempre re-derivada da atividade (não confiamos no cliente).
      const category: WorkoutCategory = inferWorkoutCategory(activity);
      const modality = category === "luta" ? inferFightModality(activity) ?? "outra" : null;
      // Tipo "outro" guarda o nome livre ("Escalada") em kind; tipos conhecidos usam o rótulo padrão.
      const input = workoutSchema.parse({
        ...(category === "outro" ? { kind: activity } : { category }),
        modality,
        durationMinutes: a.durationMinutes,
        performedAt: instantForDay(date, clock),
      });
      await insertWorkout(db, ownerId, input);
      return { ok: true, message: `Treino de ${activity} (${input.durationMinutes} min) registrado.`, link: "/saude" };
    }
    case "registrar_leitura": {
      const date = String(a.date);
      const blocked = notFuture(date, clock);
      if (blocked) return blocked;
      const bookId = String(a.bookId);
      const book = await db.execute({ sql: "SELECT title FROM books WHERE id = ? AND owner_id = ?", args: [bookId, ownerId] });
      const row = book.rows[0] as unknown as { title: string } | undefined;
      if (!row) return fail("Esse livro não existe mais (ou foi removido).");
      await insertReadingSession(db, ownerId, bookId, {
        startedAt: instantForDay(date, clock),
        durationMinutes: (a.durationMinutes as number | null | undefined) ?? null,
        pagesRead: Number(a.pagesRead),
      });
      return { ok: true, message: `${a.pagesRead} páginas de "${row.title}" registradas.`, link: `/biblioteca/${bookId}` };
    }
    case "registrar_sono": {
      const date = String(a.date);
      const blocked = notFuture(date, clock);
      if (blocked) return blocked;
      const span = sleepSpan(date, String(a.bedTime), String(a.wakeTime), clock.tz);
      const input = sleepEntrySchema.safeParse({ wentToBedAt: span.wentToBedAt, wokeUpAt: span.wokeUpAt });
      if (!input.success) return fail(input.error.issues[0]?.message ?? "Horários de sono inválidos.");
      if (Date.parse(input.data.wokeUpAt) > Date.now()) return fail("O horário de acordar ainda não chegou.");
      const created = await insertSleepEntry(db, ownerId, input.data);
      if (!created) return fail("O horário de acordar precisa ser depois do horário em que você dormiu.");
      return { ok: true, message: "Sono registrado.", link: "/saude" };
    }
    case "registrar_humor": {
      const date = String(a.date);
      const blocked = notFuture(date, clock);
      if (blocked) return blocked;
      const input = moodEntrySchema.parse({ mood: a.mood, energy: a.energy, recordedAt: instantForDay(date, clock) });
      await insertMoodEntry(db, ownerId, input);
      return { ok: true, message: "Humor e energia registrados.", link: "/saude" };
    }
  }
}
