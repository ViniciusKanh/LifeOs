import { z } from "zod";
import { OPEN_SCREEN_PATHS, PROTOCOL_ARTS, PROTOCOL_CATEGORIES, TRIGGER_METRICS } from "../config/protocols.js";

/**
 * Validação dos protocolos criados pelo usuário. Cada tipo de ação tem
 * um schema de configuração próprio (validateProtocolActions): nada de
 * campos livres que virem SQL, URL arbitrária ou ação desconhecida.
 */
const priority = z.enum(["Baixa", "Média", "Alta"]);
const base = { title: z.string().trim().min(1, "Dê um nome ao passo.").max(120), description: z.string().trim().max(300).nullable().optional(), optional: z.boolean().optional(), minutes: z.number().int().min(0).max(240).optional() };

export const stepSchema = z.discriminatedUnion("actionType", [
  z.object({ ...base, actionType: z.literal("OPEN_SCREEN"), config: z.object({ path: z.enum(OPEN_SCREEN_PATHS) }) }),
  z.object({ ...base, actionType: z.literal("CREATE_TASK"), config: z.object({ title: z.string().trim().min(1).max(120), priority: priority.default("Média"), dueInDays: z.number().int().min(0).max(30).default(0) }) }),
  z.object({
    ...base,
    actionType: z.literal("CREATE_HABIT"),
    config: z.object({ name: z.string().trim().min(1).max(80), category: z.string().trim().max(40).optional(), frequency: z.enum(["daily", "times_per_week", "weekly"]).default("daily"), targetCount: z.number().int().min(1).max(14).default(1) }),
  }),
  z.object({ ...base, actionType: z.literal("ADJUST_CAPACITY"), config: z.object({ reducePct: z.number().int().min(5).max(60) }) }),
  z.object({ ...base, actionType: z.literal("SET_DAILY_PRIORITY"), config: z.object({}).default({}) }),
  z.object({ ...base, actionType: z.literal("ACTIVATE_RECOVERY"), config: z.object({}).default({}) }),
  z.object({ ...base, actionType: z.literal("ADD_REMINDER"), config: z.object({ time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), title: z.string().trim().min(1).max(80) }) }),
  z.object({ ...base, actionType: z.literal("START_FOCUS"), config: z.object({ minutes: z.number().int().min(5).max(120) }) }),
  z.object({ ...base, actionType: z.literal("SHOW_INSTRUCTION"), config: z.object({ text: z.string().trim().min(1).max(300) }) }),
  z.object({ ...base, actionType: z.literal("CHECKLIST"), config: z.object({ items: z.array(z.string().trim().min(1).max(80)).min(1).max(10) }) }),
  z.object({ ...base, actionType: z.literal("DEFER_TASK"), config: z.object({ scope: z.enum(["deep_work", "low"]) }) }),
  z.object({ ...base, actionType: z.literal("CUSTOM"), config: z.object({}).default({}) }),
]);

const metricIds = TRIGGER_METRICS.map((m) => m.id) as [string, ...string[]];
export const triggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("manual") }),
  z.object({ type: z.literal("data"), metric: z.enum(metricIds), op: z.enum(["lt", "lte", "gt", "gte"]), value: z.number().min(0).max(1000) }),
  z.object({ type: z.literal("time"), weekday: z.number().int().min(0).max(6) }),
  z.object({ type: z.literal("event"), metric: z.literal("events_tomorrow"), min: z.number().int().min(1).max(20) }),
]);

const categoryIds = PROTOCOL_CATEGORIES.map((c) => c.id) as [string, ...string[]];
export const protocolSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome ao protocolo.").max(60),
  description: z.string().trim().max(300).optional(),
  category: z.enum(categoryIds),
  triggerDescription: z.string().trim().max(160).optional(),
  trigger: triggerSchema,
  art: z.enum(PROTOCOL_ARTS),
  settings: z.object({ suggestAuto: z.boolean(), showToday: z.boolean(), showOracle: z.boolean() }).partial().optional(),
  steps: z.array(stepSchema).min(1, "Adicione pelo menos uma ação.").max(15),
});

export const executeSchema = z.object({
  requestId: z.string().trim().min(8).max(64),
  steps: z.array(z.object({ ref: z.string().min(1).max(120), selected: z.boolean(), taskId: z.string().max(64).nullable().optional() })).min(1).max(15),
});

export const runStepSchema = z.object({ status: z.enum(["completed", "skipped"]) });

export const desiredBuildSchema = z.object({
  presetId: z.string().max(40).nullable().optional(),
  name: z.string().trim().min(1).max(60),
  targets: z.object({ knowledge: z.number(), discipline: z.number(), focus: z.number(), health: z.number(), creativity: z.number(), wellbeing: z.number() }).partial(),
});

/** Usado também nos testes: valida a lista de ações de um protocolo. */
export function validateProtocolActions(steps: unknown) {
  return z.array(stepSchema).min(1).max(15).safeParse(steps);
}
