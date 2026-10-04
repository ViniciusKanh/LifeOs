import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { ACTION_LABEL, ACTION_MODE, type ActionMode, type ActionType } from "../config/protocols.js";
import { computeCapacitySummary, getDayTasks, type DayTask } from "./capacityPlannerService.js";

/**
 * Motor genérico de ações de Protocolos. Cada tipo tem um PREVIEW (o que
 * mudaria, sem gravar nada) e um EXECUTOR (só chamado depois da
 * confirmação). Nenhum protocolo tem código próprio: tudo passa por aqui.
 * Nunca apaga tarefas — no máximo adia prazos (reversível).
 */

export interface StepInput {
  ref: string;
  title: string;
  description: string | null;
  actionType: ActionType;
  config: Record<string, unknown>;
  optional: boolean;
  minutes: number;
}

export interface ActionContext {
  ownerId: string;
  today: string;
  tomorrow: string;
}

export interface StepPreview {
  ref: string;
  title: string;
  description: string | null;
  actionType: ActionType;
  actionLabel: string;
  mode: ActionMode;
  optional: boolean;
  minutes: number;
  /** Selecionado por padrão no modal (automáticas e sugeridas não opcionais). */
  defaultSelected: boolean;
  /** Resumo legível do efeito (ex.: "Carga: 82% → 66%"). */
  summary: string | null;
  details: Record<string, unknown>;
  /** Ação sem efeito possível agora (ex.: nada para adiar). */
  noop: boolean;
}

export interface StepResult {
  status: "completed" | "failed" | "pending" | "skipped";
  message: string;
  data?: Record<string, unknown>;
}

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const pct = (rate: number) => Math.round(rate * 100);
const addMinutes = (hhmm: string, add: number) => {
  const [h, m] = hhmm.split(":").map(Number);
  const t = Math.min(23 * 60 + 59, h * 60 + m + add);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
const PRIORITY_RANK = { Baixa: 0, "Média": 1, Alta: 2 } as const;

/** Missões que reduziriam a carga: nunca as de prioridade Alta; menor prioridade e maior estimativa primeiro. */
function pickForCapacity(tasks: DayTask[], reduceMinutes: number) {
  const candidates = tasks.filter((t) => !t.done && t.priority !== "Alta" && (t.estimateMinutes ?? 0) > 0).sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (b.estimateMinutes ?? 0) - (a.estimateMinutes ?? 0));
  const picked: DayTask[] = [];
  let removed = 0;
  for (const t of candidates) {
    if (removed >= reduceMinutes) break;
    picked.push(t);
    removed += t.estimateMinutes ?? 0;
  }
  return { picked, removed };
}

function pickForDefer(tasks: DayTask[], scope: string) {
  return tasks.filter((t) => !t.done && (scope === "low" ? t.priority === "Baixa" : t.effortType === "deep_work" && t.priority !== "Alta"));
}

async function priorityCandidates(db: Client, ctx: ActionContext) {
  const r = await db.execute({
    sql: `SELECT id, title, priority, due_date FROM tasks WHERE owner_id = ? AND status != 'Concluído'
          AND (date(due_date) <= date(?) OR priority = 'Alta')
          ORDER BY CASE priority WHEN 'Alta' THEN 0 WHEN 'Média' THEN 1 ELSE 2 END, due_date IS NULL, due_date ASC LIMIT 6`,
    args: [ctx.ownerId, ctx.today],
  });
  return r.rows.map((x) => ({ id: String(x.id), title: String(x.title), priority: String(x.priority), dueDate: x.due_date == null ? null : String(x.due_date).slice(0, 10) }));
}

export async function previewStep(db: Client, step: StepInput, ctx: ActionContext): Promise<StepPreview> {
  const mode = ACTION_MODE[step.actionType];
  const base: StepPreview = {
    ref: step.ref,
    title: step.title,
    description: step.description,
    actionType: step.actionType,
    actionLabel: ACTION_LABEL[step.actionType],
    mode,
    optional: step.optional,
    minutes: step.minutes,
    defaultSelected: !step.optional,
    summary: null,
    details: {},
    noop: false,
  };
  const c = step.config;
  switch (step.actionType) {
    case "ADJUST_CAPACITY": {
      const [summary, tasks] = await Promise.all([computeCapacitySummary(db, ctx.ownerId, ctx.today), getDayTasks(db, ctx.ownerId, ctx.today)]);
      const reducePct = num(c.reducePct, 20);
      const { picked, removed } = pickForCapacity(tasks, Math.ceil((summary.plannedMinutes * reducePct) / 100));
      const avail = summary.freeMinutes;
      const after = avail > 0 ? (summary.plannedMinutes - removed) / avail : 0;
      return {
        ...base,
        summary: picked.length ? `Carga: ${pct(summary.occupancyRate)}% → ${pct(after)}% (adia ${picked.length} missão${picked.length > 1 ? "ões" : ""} para amanhã)` : "Nenhuma missão adiável com estimativa hoje.",
        details: { before: pct(summary.occupancyRate), after: pct(after), tasks: picked.map((t) => ({ id: t.id, title: t.title, priority: t.priority, minutes: t.estimateMinutes })) },
        noop: picked.length === 0,
        defaultSelected: base.defaultSelected && picked.length > 0,
      };
    }
    case "DEFER_TASK": {
      const tasks = pickForDefer(await getDayTasks(db, ctx.ownerId, ctx.today), str(c.scope, "deep_work"));
      return {
        ...base,
        summary: tasks.length ? `Adia ${tasks.length} missão${tasks.length > 1 ? "ões" : ""} para amanhã` : "Nenhuma missão nesse perfil hoje.",
        details: { tasks: tasks.map((t) => ({ id: t.id, title: t.title, priority: t.priority })) },
        noop: tasks.length === 0,
        defaultSelected: base.defaultSelected && tasks.length > 0,
      };
    }
    case "SET_DAILY_PRIORITY": {
      const candidates = await priorityCandidates(db, ctx);
      return { ...base, summary: candidates[0] ? `Sugestão: ${candidates[0].title}` : "Nenhuma missão aberta para priorizar.", details: { candidates, suggested: candidates[0]?.id ?? null }, noop: candidates.length === 0, defaultSelected: base.defaultSelected && candidates.length > 0 };
    }
    case "ACTIVATE_RECOVERY": {
      const r = await db.execute({ sql: "SELECT 1 FROM recovery_days WHERE owner_id = ? AND day_key = ?", args: [ctx.ownerId, ctx.today] });
      return { ...base, summary: r.rows.length ? "O modo recuperação já está ativo hoje." : "Marca hoje como dia de recuperação.", noop: r.rows.length > 0 };
    }
    case "ADD_REMINDER":
      return { ...base, summary: `Lembrete às ${str(c.time, "21:00")}: ${str(c.title, step.title)}`, details: { time: str(c.time, "21:00"), title: str(c.title, step.title) } };
    case "CREATE_TASK":
      return { ...base, summary: `Nova missão: ${str(c.title, step.title)}`, details: { title: str(c.title, step.title), priority: str(c.priority, "Média"), dueInDays: num(c.dueInDays, 0) } };
    case "CREATE_HABIT":
      return { ...base, summary: `Novo contrato: ${str(c.name, step.title)}`, details: { name: str(c.name, step.title) } };
    case "OPEN_SCREEN":
      return { ...base, summary: `Abre ${str(c.path, "/hoje")}`, details: { path: str(c.path, "/hoje") } };
    case "START_FOCUS":
      return { ...base, summary: `Foco de ${num(c.minutes, 25)} minutos (inicie em Hoje)`, details: { path: "/hoje", minutes: num(c.minutes, 25) } };
    case "CHECKLIST":
      return { ...base, details: { items: Array.isArray(c.items) ? c.items.filter((i): i is string => typeof i === "string") : [] }, summary: "Você marca quando concluir." };
    case "SHOW_INSTRUCTION":
      return { ...base, summary: str(c.text) || null };
    default:
      return { ...base, summary: "Você marca quando concluir." };
  }
}

/**
 * Executa um passo JÁ confirmado. Passos manuais nunca são dados como
 * feitos aqui (o LifeOS não afirma que você caminhou): ficam pendentes.
 */
export async function executeStep(db: Client, step: StepInput, ctx: ActionContext, input: { taskId?: string | null }): Promise<StepResult> {
  const c = step.config;
  if (ACTION_MODE[step.actionType] === "manual") return { status: "pending", message: "Aguardando você marcar como feito." };
  switch (step.actionType) {
    case "OPEN_SCREEN":
      return { status: "completed", message: "Tela aberta.", data: { navigate: str(c.path, "/hoje") } };
    case "START_FOCUS":
      return { status: "completed", message: "Inicie o foco em Hoje.", data: { navigate: "/hoje" } };
    case "ADJUST_CAPACITY":
    case "DEFER_TASK": {
      let ids: string[];
      if (step.actionType === "ADJUST_CAPACITY") {
        const [summary, tasks] = await Promise.all([computeCapacitySummary(db, ctx.ownerId, ctx.today), getDayTasks(db, ctx.ownerId, ctx.today)]);
        ids = pickForCapacity(tasks, Math.ceil((summary.plannedMinutes * num(c.reducePct, 20)) / 100)).picked.map((t) => t.id);
      } else {
        ids = pickForDefer(await getDayTasks(db, ctx.ownerId, ctx.today), str(c.scope, "deep_work")).map((t) => t.id);
      }
      if (ids.length === 0) return { status: "completed", message: "Nada para adiar hoje." };
      const ph = ids.map(() => "?").join(", ");
      await db.batch(
        [
          { sql: `UPDATE tasks SET due_date = ?, updated_at = datetime('now') WHERE owner_id = ? AND status != 'Concluído' AND id IN (${ph})`, args: [ctx.tomorrow, ctx.ownerId, ...ids] },
          { sql: `DELETE FROM planned_time_blocks WHERE owner_id = ? AND date = ? AND entity_type = 'task' AND entity_id IN (${ph})`, args: [ctx.ownerId, ctx.today, ...ids] },
        ],
        "write",
      );
      return { status: "completed", message: `${ids.length} missão${ids.length > 1 ? "ões" : ""} adiada${ids.length > 1 ? "s" : ""} para amanhã.`, data: { taskIds: ids, to: ctx.tomorrow } };
    }
    case "SET_DAILY_PRIORITY": {
      const candidates = await priorityCandidates(db, ctx);
      const chosen = input.taskId ? candidates.find((t) => t.id === input.taskId) : candidates[0];
      if (!chosen) return { status: "failed", message: "Missão inválida ou indisponível para hoje." };
      await db.execute({
        sql: `INSERT INTO daily_priorities (owner_id, day_key, task_id, source) VALUES (?, ?, ?, 'protocol')
              ON CONFLICT (owner_id, day_key) DO UPDATE SET task_id = excluded.task_id, source = excluded.source, created_at = datetime('now')`,
        args: [ctx.ownerId, ctx.today, chosen.id],
      });
      return { status: "completed", message: `Missão principal: ${chosen.title}.`, data: { taskId: chosen.id } };
    }
    case "ACTIVATE_RECOVERY":
      await db.execute({ sql: "INSERT INTO recovery_days (owner_id, day_key, source) VALUES (?, ?, 'protocol') ON CONFLICT DO NOTHING", args: [ctx.ownerId, ctx.today] });
      return { status: "completed", message: "Modo recuperação ativo hoje." };
    case "ADD_REMINDER": {
      const time = /^\d{2}:\d{2}$/.test(str(c.time)) ? str(c.time) : "21:00";
      const title = `Lembrete: ${str(c.title, step.title)}`.slice(0, 120);
      await db.execute({
        sql: `INSERT INTO planned_time_blocks (id, owner_id, date, start_time, end_time, entity_type, entity_id, title, block_type) VALUES (?, ?, ?, ?, ?, 'free_block', NULL, ?, 'light')`,
        args: [nanoid(), ctx.ownerId, ctx.today, time, addMinutes(time, 5), title],
      });
      return { status: "completed", message: `Lembrete criado às ${time}.` };
    }
    case "CREATE_TASK": {
      const id = nanoid();
      const due = new Date(Date.parse(`${ctx.today}T12:00:00Z`) + Math.max(0, num(c.dueInDays, 0)) * 86_400_000).toISOString().slice(0, 10);
      const priority = ["Baixa", "Média", "Alta"].includes(str(c.priority)) ? str(c.priority) : "Média";
      await db.execute({ sql: "INSERT INTO tasks (id, owner_id, title, status, priority, due_date) VALUES (?, ?, ?, 'A Fazer', ?, ?)", args: [id, ctx.ownerId, str(c.title, step.title).slice(0, 200), priority, due] });
      return { status: "completed", message: "Missão criada.", data: { taskId: id } };
    }
    case "CREATE_HABIT": {
      const name = str(c.name, step.title).slice(0, 80);
      const exists = await db.execute({ sql: "SELECT id FROM habits WHERE owner_id = ? AND lower(name) = lower(?) LIMIT 1", args: [ctx.ownerId, name] });
      if (exists.rows.length) return { status: "completed", message: "Você já tem esse contrato.", data: { habitId: String(exists.rows[0].id) } };
      const id = nanoid();
      const freq = ["daily", "times_per_week", "weekly"].includes(str(c.frequency)) ? str(c.frequency) : "daily";
      await db.execute({ sql: "INSERT INTO habits (id, owner_id, name, icon, category, frequency, target_count) VALUES (?, ?, ?, NULL, ?, ?, ?)", args: [id, ctx.ownerId, name, str(c.category) || null, freq, Math.max(1, num(c.targetCount, 1))] });
      return { status: "completed", message: "Contrato criado.", data: { habitId: id } };
    }
    default:
      return { status: "pending", message: "Aguardando você marcar como feito." };
  }
}
