import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import {
  ACTION_MODE,
  DEFAULT_SETTINGS,
  PROTOCOL_CATEGORIES,
  PROTOCOL_TEMPLATES,
  TRIGGER_METRICS,
  templateByKey,
  type ActionType,
  type ProtocolArt,
  type ProtocolCategory,
  type ProtocolSettings,
  type StepDef,
  type TemplateDef,
  type Trigger,
  type TriggerMetric,
} from "../config/protocols.js";
import { computeCapacitySummary } from "./capacityPlannerService.js";
import { todayKeyFor } from "./gamificationService.js";
import { executeStep, previewStep, type ActionContext, type StepInput, type StepPreview } from "./protocolActionEngine.js";

/**
 * Protocolos: procedimentos "quando X acontecer, siga Y". Templates vêm do
 * catálogo (só leitura); protocolos do usuário ficam no banco. Gatilhos só
 * geram SUGESTÃO. Executar sempre passa por preview + confirmação, e cada
 * execução vira um registro auditável (protocol_runs / protocol_run_steps).
 */

export class ProtocolError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export interface ProtocolStepView {
  ref: string;
  position: number;
  title: string;
  description: string | null;
  actionType: ActionType;
  mode: "auto" | "suggested" | "manual";
  config: Record<string, unknown>;
  optional: boolean;
  minutes: number;
}

export interface ProtocolView {
  ref: string;
  kind: "template" | "mine";
  sourceTemplate: string | null;
  name: string;
  description: string;
  category: ProtocolCategory;
  triggerDescription: string;
  trigger: Trigger;
  art: ProtocolArt;
  settings: ProtocolSettings;
  steps: ProtocolStepView[];
  totalMinutes: number;
  favorite: boolean;
  uses: number;
  completedRuns: number;
  lastRunAt: string | null;
  triggered: boolean;
  triggerReason: string | null;
  relevance: number;
  createdAt: string | null;
}

export type ProtocolContext = Partial<Record<TriggerMetric, number>> & { today: string; weekday: number };

const sqlToIso = (v: unknown) => (typeof v === "string" && v ? (v.includes("T") ? v : `${v.replace(" ", "T")}Z`) : null);
const shiftDay = (day: string, d: number) => new Date(Date.parse(`${day}T12:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
const parseJson = <T,>(v: unknown, fallback: T): T => {
  try {
    return v == null ? fallback : (JSON.parse(String(v)) as T);
  } catch {
    return fallback;
  }
};

/* ------------------------------ Contexto real ------------------------------ */

/** Lê só métricas que existem nos dados do usuário; sem dado, a métrica fica ausente. */
export async function loadProtocolContext(db: Client, ownerId: string): Promise<ProtocolContext> {
  const today = await todayKeyFor(db, ownerId);
  const tomorrow = shiftDay(today, 1);
  const [sleep, mood, overdue, dueToday, events, capacity] = await Promise.all([
    db.execute({ sql: "SELECT duration_minutes FROM sleep_entries WHERE owner_id = ? AND woke_up_at >= datetime('now', '-30 hours') AND duration_minutes IS NOT NULL ORDER BY woke_up_at DESC LIMIT 1", args: [ownerId] }),
    db.execute({ sql: "SELECT energy FROM mood_entries WHERE owner_id = ? AND recorded_at >= datetime('now', '-24 hours') ORDER BY recorded_at DESC LIMIT 1", args: [ownerId] }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM tasks WHERE owner_id = ? AND status != 'Concluído' AND due_date IS NOT NULL AND due_date < date(?)", args: [ownerId, today] }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM tasks WHERE owner_id = ? AND status != 'Concluído' AND (due_date >= date(?2) AND due_date < date(?2, '+1 day'))", args: [ownerId, today] }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM events WHERE owner_id = ? AND (starts_at >= date(?2) AND starts_at < date(?2, '+1 day'))", args: [ownerId, tomorrow] }),
    computeCapacitySummary(db, ownerId, today).catch(() => null),
  ]);
  const ctx: ProtocolContext = { today, weekday: new Date(`${today}T12:00:00Z`).getUTCDay() };
  if (sleep.rows[0]) ctx.sleep_hours = Math.round((Number(sleep.rows[0].duration_minutes) / 60) * 100) / 100;
  if (mood.rows[0]) ctx.energy = Number(mood.rows[0].energy);
  ctx.overdue_tasks = Number(overdue.rows[0]?.n ?? 0);
  ctx.tasks_due_today = Number(dueToday.rows[0]?.n ?? 0);
  ctx.events_tomorrow = Number(events.rows[0]?.n ?? 0);
  if (capacity && capacity.plannedMinutes > 0) ctx.capacity_pct = Math.round(capacity.occupancyRate * 100);
  return ctx;
}

const OPS = { lt: (a: number, b: number) => a < b, lte: (a: number, b: number) => a <= b, gt: (a: number, b: number) => a > b, gte: (a: number, b: number) => a >= b };
const OP_LABEL = { lt: "<", lte: "≤", gt: ">", gte: "≥" };
const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export function evaluateTrigger(trigger: Trigger, ctx: ProtocolContext): { triggered: boolean; reason: string | null } {
  if (trigger.type === "manual") return { triggered: false, reason: null };
  if (trigger.type === "time") return trigger.weekday === ctx.weekday ? { triggered: true, reason: `Hoje é ${WEEKDAYS[ctx.weekday]}.` } : { triggered: false, reason: null };
  if (trigger.type === "event") {
    const v = ctx.events_tomorrow;
    return v !== undefined && v >= trigger.min ? { triggered: true, reason: `${v} compromisso${v > 1 ? "s" : ""} amanhã.` } : { triggered: false, reason: null };
  }
  const value = ctx[trigger.metric];
  if (value === undefined) return { triggered: false, reason: null };
  if (!OPS[trigger.op](value, trigger.value)) return { triggered: false, reason: null };
  const meta = TRIGGER_METRICS.find((m) => m.id === trigger.metric)!;
  const shown = trigger.metric === "sleep_hours" ? `${Math.floor(value)}h${String(Math.round((value % 1) * 60)).padStart(2, "0")}` : `${value}${meta.unit}`;
  return { triggered: true, reason: `${meta.label}: ${shown} (${OP_LABEL[trigger.op]} ${trigger.value}${meta.unit}).` };
}

/**
 * Relevância determinística: gatilho ativo pesa mais; depois favorito,
 * uso real e uso recente. Sem aleatoriedade e sem IA.
 */
export function calculateProtocolRelevance(p: { triggered: boolean; favorite: boolean; uses: number; lastRunAt: string | null }, now = Date.now()): number {
  let score = 0;
  if (p.triggered) score += 100;
  if (p.favorite) score += 20;
  score += Math.min(30, p.uses * 3);
  if (p.lastRunAt && now - Date.parse(p.lastRunAt) < 7 * 86_400_000) score += 10;
  return score;
}

/* ------------------------------ Leitura ------------------------------ */

function templateSteps(t: TemplateDef): ProtocolStepView[] {
  return t.steps.map((s, i) => toStepView(`t:${t.key}:${i}`, i, s));
}

function toStepView(ref: string, position: number, s: StepDef): ProtocolStepView {
  return {
    ref,
    position,
    title: s.title,
    description: s.description ?? null,
    actionType: s.actionType,
    mode: ACTION_MODE[s.actionType],
    config: s.config ?? {},
    optional: !!s.optional,
    minutes: s.minutes ?? 0,
  };
}

async function usageByRef(db: Client, ownerId: string) {
  const r = await db.execute({
    sql: `SELECT protocol_ref, COUNT(*) AS uses, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed, MAX(started_at) AS last_at
          FROM protocol_runs WHERE owner_id = ? AND status != 'canceled' GROUP BY protocol_ref`,
    args: [ownerId],
  });
  return new Map(r.rows.map((x) => [String(x.protocol_ref), { uses: Number(x.uses), completed: Number(x.completed ?? 0), lastAt: sqlToIso(x.last_at) }]));
}

export async function listProtocols(db: Client, ownerId: string, ctx?: ProtocolContext): Promise<ProtocolView[]> {
  const [rows, steps, favs, usage, context] = await Promise.all([
    db.execute({ sql: "SELECT * FROM protocols WHERE owner_id = ? AND is_active = 1 ORDER BY created_at ASC", args: [ownerId] }),
    db.execute({ sql: "SELECT * FROM protocol_steps WHERE owner_id = ? ORDER BY position ASC", args: [ownerId] }),
    db.execute({ sql: "SELECT protocol_ref FROM protocol_favorites WHERE owner_id = ?", args: [ownerId] }),
    usageByRef(db, ownerId),
    ctx ? Promise.resolve(ctx) : loadProtocolContext(db, ownerId),
  ]);
  const favSet = new Set(favs.rows.map((f) => String(f.protocol_ref)));
  const stepsBy = new Map<string, ProtocolStepView[]>();
  for (const s of steps.rows) {
    const list = stepsBy.get(String(s.protocol_id)) ?? [];
    list.push(
      toStepView(`s:${String(s.id)}`, Number(s.position), {
        title: String(s.title),
        description: s.description == null ? undefined : String(s.description),
        actionType: String(s.action_type) as ActionType,
        config: parseJson(s.action_config_json, {}),
        optional: Number(s.is_optional) === 1,
        minutes: Number(s.estimated_minutes ?? 0),
      }),
    );
    stepsBy.set(String(s.protocol_id), list);
  }
  const finish = (base: Omit<ProtocolView, "favorite" | "uses" | "completedRuns" | "lastRunAt" | "triggered" | "triggerReason" | "relevance" | "totalMinutes">): ProtocolView => {
    const u = usage.get(base.ref);
    const t = evaluateTrigger(base.trigger, context);
    const view = {
      ...base,
      totalMinutes: base.steps.reduce((s, x) => s + x.minutes, 0),
      favorite: favSet.has(base.ref),
      uses: u?.uses ?? 0,
      completedRuns: u?.completed ?? 0,
      lastRunAt: u?.lastAt ?? null,
      triggered: t.triggered,
      triggerReason: t.reason,
      relevance: 0,
    };
    view.relevance = calculateProtocolRelevance(view);
    return view;
  };
  const mine = rows.rows.map((r) =>
    finish({
      ref: `p:${String(r.id)}`,
      kind: "mine",
      sourceTemplate: r.source_template == null ? null : String(r.source_template),
      name: String(r.name),
      description: String(r.description ?? ""),
      category: String(r.category) as ProtocolCategory,
      triggerDescription: String(r.trigger_description ?? ""),
      trigger: parseJson<Trigger>(r.trigger_json, { type: "manual" }),
      art: String(r.art) as ProtocolArt,
      settings: { ...DEFAULT_SETTINGS, ...parseJson<Partial<ProtocolSettings>>(r.settings_json, {}) },
      steps: stepsBy.get(String(r.id)) ?? [],
      createdAt: sqlToIso(r.created_at),
    }),
  );
  const templates = PROTOCOL_TEMPLATES.map((t) =>
    finish({
      ref: `t:${t.key}`,
      kind: "template",
      sourceTemplate: null,
      name: t.name,
      description: t.description,
      category: t.category,
      triggerDescription: t.triggerDescription,
      trigger: t.trigger,
      art: t.art,
      settings: DEFAULT_SETTINGS,
      steps: templateSteps(t),
      createdAt: null,
    }),
  );
  return [...mine, ...templates];
}

export async function getProtocol(db: Client, ownerId: string, ref: string): Promise<ProtocolView> {
  const p = (await listProtocols(db, ownerId)).find((x) => x.ref === ref);
  if (!p) throw new ProtocolError("Protocolo não encontrado.", 404);
  return p;
}

/** Destaque: maior relevância; empate → mais usado → nome (determinístico). */
export function pickFeatured(list: ProtocolView[]): ProtocolView | null {
  return [...list].sort((a, b) => b.relevance - a.relevance || b.uses - a.uses || a.name.localeCompare(b.name, "pt-BR"))[0] ?? null;
}

/* ------------------------------ Escrita ------------------------------ */

export interface ProtocolInput {
  name: string;
  description?: string;
  category: ProtocolCategory;
  triggerDescription?: string;
  trigger: Trigger;
  art: ProtocolArt;
  settings?: Partial<ProtocolSettings>;
  steps: Array<{ title: string; description?: string | null; actionType: ActionType; config?: Record<string, unknown>; optional?: boolean; minutes?: number }>;
}

function stepStatements(protocolId: string, ownerId: string, steps: ProtocolInput["steps"]) {
  return steps.map((s, i) => ({
    sql: `INSERT INTO protocol_steps (id, protocol_id, owner_id, position, title, description, action_type, action_config_json, is_optional, estimated_minutes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [nanoid(), protocolId, ownerId, i, s.title, s.description ?? null, s.actionType, JSON.stringify(s.config ?? {}), s.optional ? 1 : 0, s.minutes ?? 0],
  }));
}

export async function createProtocol(db: Client, ownerId: string, input: ProtocolInput, sourceTemplate: string | null = null): Promise<ProtocolView> {
  if (!PROTOCOL_CATEGORIES.some((c) => c.id === input.category)) throw new ProtocolError("Categoria inválida.");
  const id = nanoid();
  await db.batch(
    [
      {
        sql: `INSERT INTO protocols (id, owner_id, source_template, name, description, category, trigger_description, trigger_json, art, settings_json)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, ownerId, sourceTemplate, input.name, input.description ?? "", input.category, input.triggerDescription ?? "", JSON.stringify(input.trigger), input.art, JSON.stringify({ ...DEFAULT_SETTINGS, ...(input.settings ?? {}) })],
      },
      ...stepStatements(id, ownerId, input.steps),
    ],
    "write",
  );
  return getProtocol(db, ownerId, `p:${id}`);
}

async function ownProtocolId(db: Client, ownerId: string, ref: string): Promise<string> {
  if (!ref.startsWith("p:")) throw new ProtocolError("Templates globais não podem ser editados. Adicione uma cópia à sua conta.", 403);
  const id = ref.slice(2);
  const r = await db.execute({ sql: "SELECT id FROM protocols WHERE id = ? AND owner_id = ? AND is_active = 1", args: [id, ownerId] });
  if (!r.rows.length) throw new ProtocolError("Protocolo não encontrado.", 404);
  return id;
}

export async function updateProtocol(db: Client, ownerId: string, ref: string, input: ProtocolInput): Promise<ProtocolView> {
  const id = await ownProtocolId(db, ownerId, ref);
  await db.batch(
    [
      {
        sql: `UPDATE protocols SET name = ?, description = ?, category = ?, trigger_description = ?, trigger_json = ?, art = ?, settings_json = ?, updated_at = datetime('now')
              WHERE id = ? AND owner_id = ?`,
        args: [input.name, input.description ?? "", input.category, input.triggerDescription ?? "", JSON.stringify(input.trigger), input.art, JSON.stringify({ ...DEFAULT_SETTINGS, ...(input.settings ?? {}) }), id, ownerId],
      },
      { sql: "DELETE FROM protocol_steps WHERE protocol_id = ? AND owner_id = ?", args: [id, ownerId] },
      ...stepStatements(id, ownerId, input.steps),
    ],
    "write",
  );
  return getProtocol(db, ownerId, ref);
}

/** Exclui o protocolo (o histórico de execuções fica, para métricas e Timeline). */
export async function deleteProtocol(db: Client, ownerId: string, ref: string): Promise<void> {
  const id = await ownProtocolId(db, ownerId, ref);
  await db.batch(
    [
      { sql: "DELETE FROM protocol_steps WHERE protocol_id = ? AND owner_id = ?", args: [id, ownerId] },
      { sql: "DELETE FROM protocols WHERE id = ? AND owner_id = ?", args: [id, ownerId] },
      { sql: "DELETE FROM protocol_favorites WHERE owner_id = ? AND protocol_ref = ?", args: [ownerId, ref] },
    ],
    "write",
  );
}

/** Copia um template para a conta (uma cópia por template; repetir devolve a existente). */
export async function cloneTemplate(db: Client, ownerId: string, key: string): Promise<ProtocolView> {
  const t = templateByKey(key);
  if (!t) throw new ProtocolError("Template não encontrado.", 404);
  const existing = await db.execute({ sql: "SELECT id FROM protocols WHERE owner_id = ? AND source_template = ? AND is_active = 1 LIMIT 1", args: [ownerId, key] });
  if (existing.rows.length) return getProtocol(db, ownerId, `p:${String(existing.rows[0].id)}`);
  return createProtocol(
    db,
    ownerId,
    {
      name: t.name,
      description: t.description,
      category: t.category,
      triggerDescription: t.triggerDescription,
      trigger: t.trigger,
      art: t.art,
      steps: t.steps.map((s) => ({ title: s.title, description: s.description ?? null, actionType: s.actionType, config: s.config, optional: s.optional, minutes: s.minutes })),
    },
    key,
  );
}

export async function setFavorite(db: Client, ownerId: string, ref: string, favorite: boolean): Promise<void> {
  await getProtocol(db, ownerId, ref); // valida posse/existência
  await db.execute(
    favorite
      ? { sql: "INSERT INTO protocol_favorites (owner_id, protocol_ref) VALUES (?, ?) ON CONFLICT DO NOTHING", args: [ownerId, ref] }
      : { sql: "DELETE FROM protocol_favorites WHERE owner_id = ? AND protocol_ref = ?", args: [ownerId, ref] },
  );
}

/* ------------------------------ Execução ------------------------------ */

const toInput = (s: ProtocolStepView): StepInput => ({ ref: s.ref, title: s.title, description: s.description, actionType: s.actionType, config: s.config, optional: s.optional, minutes: s.minutes });

async function actionContext(db: Client, ownerId: string): Promise<ActionContext> {
  const today = await todayKeyFor(db, ownerId);
  return { ownerId, today, tomorrow: shiftDay(today, 1) };
}

/** Preview: o que cada passo faria agora — nada é gravado. */
export async function previewProtocolExecution(db: Client, ownerId: string, ref: string): Promise<{ protocol: ProtocolView; steps: StepPreview[] }> {
  const protocol = await getProtocol(db, ownerId, ref);
  const ctx = await actionContext(db, ownerId);
  const steps = [];
  for (const s of protocol.steps) steps.push(await previewStep(db, toInput(s), ctx));
  return { protocol, steps };
}

type RunStatus = "started" | "partial" | "completed" | "canceled";
type StepStatus = "pending" | "skipped" | "completed" | "failed";

function runStatusFrom(steps: StepStatus[]): RunStatus {
  if (steps.includes("pending")) return "started";
  if (steps.length > 0 && steps.every((s) => s === "completed")) return "completed";
  return "partial";
}

export interface ExecuteInput {
  requestId: string;
  steps: Array<{ ref: string; selected: boolean; taskId?: string | null }>;
}

/**
 * Executa SOMENTE os passos marcados. Idempotente por requestId: repetir
 * a mesma confirmação devolve a execução já registrada.
 */
export async function executeProtocol(db: Client, ownerId: string, ref: string, input: ExecuteInput) {
  const dup = await db.execute({ sql: "SELECT id FROM protocol_runs WHERE owner_id = ? AND request_id = ?", args: [ownerId, input.requestId] });
  if (dup.rows.length) return { ...(await getRun(db, ownerId, String(dup.rows[0].id))), replayed: true };

  const protocol = await getProtocol(db, ownerId, ref);
  const chosen = new Map(input.steps.map((s) => [s.ref, s]));
  if ([...chosen.keys()].some((k) => !protocol.steps.some((s) => s.ref === k))) throw new ProtocolError("Há passos que não pertencem a este protocolo.");
  if (!protocol.steps.some((s) => chosen.get(s.ref)?.selected)) throw new ProtocolError("Selecione pelo menos uma ação.");

  const ctx = await actionContext(db, ownerId);
  const context = await loadProtocolContext(db, ownerId);
  const runId = nanoid();
  try {
    await db.execute({
      sql: "INSERT INTO protocol_runs (id, owner_id, protocol_ref, protocol_name, status, context_json, request_id) VALUES (?, ?, ?, ?, 'started', ?, ?)",
      args: [runId, ownerId, ref, protocol.name, JSON.stringify(context), input.requestId],
    });
  } catch (err) {
    // Mesma confirmação em paralelo: a UNIQUE barrou a segunda.
    const again = await db.execute({ sql: "SELECT id FROM protocol_runs WHERE owner_id = ? AND request_id = ?", args: [ownerId, input.requestId] });
    if (again.rows.length) return { ...(await getRun(db, ownerId, String(again.rows[0].id))), replayed: true };
    throw err;
  }

  const statuses: StepStatus[] = [];
  const navigate: string[] = [];
  for (const step of protocol.steps) {
    const sel = chosen.get(step.ref);
    let status: StepStatus = "skipped";
    let result: Record<string, unknown> = { message: "Não selecionado." };
    if (sel?.selected) {
      try {
        const r = await executeStep(db, toInput(step), ctx, { taskId: sel.taskId ?? null });
        status = r.status;
        result = { message: r.message, ...(r.data ?? {}) };
        if (typeof r.data?.navigate === "string") navigate.push(r.data.navigate);
      } catch (err) {
        status = "failed";
        result = { message: err instanceof Error ? err.message.slice(0, 200) : "Falha ao executar a ação." };
      }
    }
    statuses.push(status);
    await db.execute({
      sql: `INSERT INTO protocol_run_steps (id, run_id, owner_id, step_ref, position, title, action_type, mode, status, result_json, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${status === "completed" ? "datetime('now')" : "NULL"})`,
      args: [nanoid(), runId, ownerId, step.ref, step.position, step.title, step.actionType, step.mode, status, JSON.stringify(result)],
    });
  }
  const runStatus = runStatusFrom(statuses);
  await db.execute({
    sql: `UPDATE protocol_runs SET status = ?, completed_at = ${runStatus === "started" ? "NULL" : "datetime('now')"} WHERE id = ? AND owner_id = ?`,
    args: [runStatus, runId, ownerId],
  });
  return { ...(await getRun(db, ownerId, runId)), replayed: false, navigate: navigate[0] ?? null };
}

export async function getRun(db: Client, ownerId: string, runId: string) {
  const [run, steps] = await Promise.all([
    db.execute({ sql: "SELECT * FROM protocol_runs WHERE id = ? AND owner_id = ?", args: [runId, ownerId] }),
    db.execute({ sql: "SELECT * FROM protocol_run_steps WHERE run_id = ? AND owner_id = ? ORDER BY position ASC", args: [runId, ownerId] }),
  ]);
  const r = run.rows[0];
  if (!r) throw new ProtocolError("Execução não encontrada.", 404);
  return {
    id: String(r.id),
    protocolRef: String(r.protocol_ref),
    protocolName: String(r.protocol_name),
    status: String(r.status) as RunStatus,
    startedAt: sqlToIso(r.started_at)!,
    completedAt: sqlToIso(r.completed_at),
    steps: steps.rows.map((s) => ({
      ref: String(s.step_ref),
      position: Number(s.position),
      title: String(s.title),
      actionType: String(s.action_type) as ActionType,
      mode: String(s.mode),
      status: String(s.status) as StepStatus,
      result: parseJson<Record<string, unknown>>(s.result_json, {}),
      completedAt: sqlToIso(s.completed_at),
    })),
  };
}

export async function listRuns(db: Client, ownerId: string, opts: { status?: RunStatus; limit?: number } = {}) {
  const r = await db.execute({
    sql: `SELECT id FROM protocol_runs WHERE owner_id = ? ${opts.status ? "AND status = ?" : ""} ORDER BY started_at DESC, rowid DESC LIMIT ?`,
    args: opts.status ? [ownerId, opts.status, opts.limit ?? 20] : [ownerId, opts.limit ?? 20],
  });
  return Promise.all(r.rows.map((x) => getRun(db, ownerId, String(x.id))));
}

/** Marca um passo manual (pendente) como feito ou pulado e recalcula o status da execução. */
export async function updateRunStep(db: Client, ownerId: string, runId: string, stepRef: string, status: "completed" | "skipped") {
  const run = await getRun(db, ownerId, runId);
  if (run.status === "canceled") throw new ProtocolError("Esta execução foi cancelada.", 409);
  const step = run.steps.find((s) => s.ref === stepRef);
  if (!step) throw new ProtocolError("Passo não encontrado.", 404);
  if (step.status !== "pending") throw new ProtocolError("Só passos pendentes podem ser atualizados.", 409);
  await db.execute({
    sql: `UPDATE protocol_run_steps SET status = ?, completed_at = ${status === "completed" ? "datetime('now')" : "NULL"} WHERE run_id = ? AND owner_id = ? AND step_ref = ? AND status = 'pending'`,
    args: [status, runId, ownerId, stepRef],
  });
  const next = runStatusFrom(run.steps.map((s) => (s.ref === stepRef ? status : s.status)));
  await db.execute({
    sql: `UPDATE protocol_runs SET status = ?, completed_at = ${next === "started" ? "NULL" : "datetime('now')"} WHERE id = ? AND owner_id = ?`,
    args: [next, runId, ownerId],
  });
  return getRun(db, ownerId, runId);
}

/** Cancela uma execução em andamento (ações já feitas não são desfeitas automaticamente). */
export async function cancelRun(db: Client, ownerId: string, runId: string) {
  const run = await getRun(db, ownerId, runId);
  if (run.status !== "started") throw new ProtocolError("Só execuções em andamento podem ser canceladas.", 409);
  await db.batch(
    [
      { sql: "UPDATE protocol_run_steps SET status = 'skipped' WHERE run_id = ? AND owner_id = ? AND status = 'pending'", args: [runId, ownerId] },
      { sql: "UPDATE protocol_runs SET status = 'canceled', completed_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [runId, ownerId] },
    ],
    "write",
  );
  return getRun(db, ownerId, runId);
}

/** Estatísticas reais (sem inferir causalidade). */
export async function getProtocolUsageStats(db: Client, ownerId: string) {
  const r = await db.execute({
    sql: `SELECT protocol_ref, protocol_name, COUNT(*) AS runs, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
          FROM protocol_runs WHERE owner_id = ? AND status != 'canceled' GROUP BY protocol_ref ORDER BY runs DESC LIMIT 10`,
    args: [ownerId],
  });
  const rows = r.rows.map((x) => ({ ref: String(x.protocol_ref), name: String(x.protocol_name), runs: Number(x.runs), completed: Number(x.completed ?? 0) }));
  const total = rows.reduce((s, x) => s + x.runs, 0);
  const done = rows.reduce((s, x) => s + x.completed, 0);
  return { totalRuns: total, completionRate: total ? Math.round((done / total) * 100) : null, top: rows };
}

/** Sugestões para Hoje: protocolos com gatilho ativo e sugestão ligada (nunca executa). */
export async function getProtocolSuggestions(db: Client, ownerId: string) {
  const context = await loadProtocolContext(db, ownerId);
  const list = await listProtocols(db, ownerId, context);
  // Se o usuário tem cópia de um template, a cópia substitui o template.
  const cloned = new Set(list.filter((p) => p.kind === "mine" && p.sourceTemplate).map((p) => `t:${p.sourceTemplate}`));
  return list
    .filter((p) => !cloned.has(p.ref) && p.triggered && p.settings.suggestAuto && p.settings.showToday)
    .sort((a, b) => b.relevance - a.relevance || a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, 2)
    .map((p) => ({ ref: p.ref, name: p.name, art: p.art, category: p.category, reason: p.triggerReason }));
}

export async function getDailyPriority(db: Client, ownerId: string) {
  const today = await todayKeyFor(db, ownerId);
  const r = await db.execute({
    sql: `SELECT d.task_id, t.title FROM daily_priorities d JOIN tasks t ON t.id = d.task_id AND t.owner_id = d.owner_id
          WHERE d.owner_id = ? AND d.day_key = ? AND t.status != 'Concluído'`,
    args: [ownerId, today],
  });
  const recovery = await db.execute({ sql: "SELECT 1 FROM recovery_days WHERE owner_id = ? AND day_key = ?", args: [ownerId, today] });
  return { taskId: r.rows[0] ? String(r.rows[0].task_id) : null, title: r.rows[0] ? String(r.rows[0].title) : null, recovery: recovery.rows.length > 0 };
}
