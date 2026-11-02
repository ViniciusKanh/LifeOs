import { nanoid } from "nanoid";
import type { getDb } from "../db/client.js";
import { recordInAppNotification } from "./notificationTriggersService.js";
import { sendPushToUser } from "./pushService.js";

type Db = ReturnType<typeof getDb>;

/**
 * Automações do Grimório e de Metas — estado por usuário.
 *
 * O CATÁLOGO (o que cada automação faz, quando roda e a configuração
 * padrão) fica aqui no código; o banco guarda só o que é do usuário:
 * ligada/desligada, configuração, última/próxima execução e histórico
 * (module_automations + module_automation_runs).
 *
 * A execução reaproveita o cron diário já existente (/api/cron/notification-triggers)
 * e o botão "Executar agora" — não há um segundo motor de agendamento.
 * Idempotência: cada execução tem um run_key (ex.: o dia local) e a
 * tabela de execuções tem UNIQUE (automation_id, run_key).
 */

export type AutomationModule = "grimoire" | "goals";
export type AutomationTrigger = "daily" | "weekly" | "event" | "manual";
export type RunStatus = "ok" | "skipped" | "error";

export interface AutomationDef {
  module: AutomationModule;
  key: string;
  label: string;
  description: string;
  trigger: AutomationTrigger;
  /** Explica o disparo em linguagem simples (mostrado na UI). */
  triggerLabel: string;
  usesAi: boolean;
  defaultEnabled: boolean;
  defaultConfig: Record<string, unknown>;
}

export const AUTOMATION_DEFS: AutomationDef[] = [
  {
    module: "grimoire",
    key: "diary_cards",
    label: "Gerar cartões do Diário",
    description: "Lê as entradas recentes do Diário com texto suficiente e propõe perguntas e respostas. Os cartões ficam na fila para você aprovar.",
    trigger: "daily",
    triggerLabel: "Uma vez por dia (e em “Executar agora”)",
    usesAi: true,
    defaultEnabled: false,
    defaultConfig: { deckId: null, minWords: 80, lookbackDays: 3, maxEntries: 2, cardsPerEntry: 5 },
  },
  {
    module: "grimoire",
    key: "smart_import",
    label: "Importar PDF / texto / anotações",
    description: "Documento → extração → resumo → cartões sugeridos. Roda a cada importação; nada entra no baralho sem aprovação.",
    trigger: "event",
    triggerLabel: "A cada importação",
    usesAi: true,
    defaultEnabled: true,
    defaultConfig: { cardsPerImport: 12, withSummary: true },
  },
  {
    module: "grimoire",
    key: "priority_review",
    label: "Revisão por prioridade",
    description: "Ordena a fila do dia por atraso, lapsos e facilidade (SM-2) e respeita um limite diário de revisões.",
    trigger: "event",
    triggerLabel: "Sempre que a fila do dia é montada",
    usesAi: false,
    defaultEnabled: true,
    defaultConfig: { dailyLimit: 150 },
  },
  {
    module: "grimoire",
    key: "smart_summary",
    label: "Resumo + flashcards com IA",
    description: "Ao importar ou colar um conteúdo, gera um resumo estruturado, conceitos-chave e perguntas — tudo editável antes de salvar.",
    trigger: "event",
    triggerLabel: "Junto com a importação",
    usesAi: true,
    defaultEnabled: true,
    defaultConfig: { concepts: true, questions: true },
  },
  {
    module: "grimoire",
    key: "study_reminder",
    label: "Lembrete de ritual diário",
    description: "Avisa quando há cartões para revisar hoje, no app e/ou por push.",
    trigger: "daily",
    triggerLabel: "Uma vez por dia, no lembrete diário do LifeOS",
    usesAi: false,
    defaultEnabled: false,
    defaultConfig: { preferredHour: 19, minDue: 1, inApp: true, push: true },
  },
  {
    module: "grimoire",
    key: "goal_sync",
    label: "Sincronizar com Metas",
    description: "Baralhos vinculados a uma meta avançam o progresso dela (1 dia de estudo por baralho ou o domínio do baralho), sem contar duas vezes.",
    trigger: "event",
    triggerLabel: "A cada revisão",
    usesAi: false,
    defaultEnabled: true,
    defaultConfig: {},
  },
  {
    module: "goals",
    key: "progress_sync",
    label: "Atualizar progresso automático",
    description: "Recalcula metas ligadas a projetos e ao Grimório e registra a evolução no histórico (só quando o valor muda).",
    trigger: "daily",
    triggerLabel: "Uma vez por dia (e em “Executar agora”)",
    usesAi: false,
    defaultEnabled: true,
    defaultConfig: {},
  },
  {
    module: "goals",
    key: "ai_breakdown",
    label: "Gerar subtarefas com IA",
    description: "Ao planejar uma meta, a IA propõe etapas, tarefas, marcos e prazos. Você edita e confirma antes de criar qualquer tarefa.",
    trigger: "manual",
    triggerLabel: "Pelo botão “Planejar com IA” de cada meta",
    usesAi: true,
    defaultEnabled: true,
    defaultConfig: {},
  },
  {
    module: "goals",
    key: "deadline_alerts",
    label: "Alertas de prazo",
    description: "Avisa sobre metas perto do prazo com progresso abaixo do esperado, metas atrasadas e metas paradas.",
    trigger: "daily",
    triggerLabel: "Uma vez por dia",
    usesAi: false,
    defaultEnabled: false,
    defaultConfig: { daysBefore: 7, stalledDays: 14, inApp: true, push: true },
  },
  {
    module: "goals",
    key: "weekly_plan",
    label: "Planejamento semanal",
    description: "Monta uma sugestão de semana com as tarefas das metas ativas, por prazo e prioridade, respeitando um limite por dia.",
    trigger: "weekly",
    triggerLabel: "Toda semana (e em “Executar agora”)",
    usesAi: false,
    defaultEnabled: false,
    defaultConfig: { tasksPerDay: 3, includeWeekend: false },
  },
  {
    module: "goals",
    key: "forecast",
    label: "Previsão de conclusão",
    description: "Estima a data de conclusão pelo ritmo real do histórico de progresso. Sem histórico suficiente, mostra que faltam dados.",
    trigger: "event",
    triggerLabel: "Ao abrir as metas",
    usesAi: false,
    defaultEnabled: true,
    defaultConfig: {},
  },
  {
    module: "goals",
    key: "smart_replan",
    label: "Replanejamento inteligente",
    description: "Para metas atrasadas ou em risco, sugere novo cronograma, redistribuição das tarefas e ajuste de prioridade — aplicado só com sua aprovação.",
    trigger: "daily",
    triggerLabel: "Uma vez por dia",
    usesAi: false,
    defaultEnabled: false,
    defaultConfig: {},
  },
];

export function findDef(module: AutomationModule, key: string): AutomationDef | undefined {
  return AUTOMATION_DEFS.find((d) => d.module === module && d.key === key);
}

export interface AutomationView extends AutomationDef {
  id: string | null;
  enabled: boolean;
  config: Record<string, unknown>;
  lastRunAt: string | null;
  lastStatus: RunStatus | null;
  lastMessage: string | null;
  nextRunAt: string | null;
}

type Row = Record<string, unknown>;

function parseConfig(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string") return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Próxima execução prevista pelo cron diário (12:05 UTC, ver vercel.json). */
export function nextCronRun(trigger: AutomationTrigger, now = new Date()): string | null {
  if (trigger !== "daily" && trigger !== "weekly") return null;
  const d = new Date(now);
  d.setUTCHours(12, 5, 0, 0);
  if (d <= now) d.setUTCDate(d.getUTCDate() + 1);
  if (trigger === "weekly") while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

export async function listAutomations(db: Db, ownerId: string, module: AutomationModule): Promise<AutomationView[]> {
  const r = await db.execute({ sql: "SELECT * FROM module_automations WHERE owner_id = ? AND module = ?", args: [ownerId, module] });
  const byKey = new Map((r.rows as unknown as Row[]).map((row) => [String(row.key), row]));
  return AUTOMATION_DEFS.filter((d) => d.module === module).map((def) => {
    const row = byKey.get(def.key);
    // _state é interno (ex.: o que já foi processado) e não vai para a UI.
    const stored = row ? parseConfig(row.config_json) : {};
    delete stored._state;
    return {
      ...def,
      id: row ? String(row.id) : null,
      enabled: row ? Number(row.enabled) === 1 : def.defaultEnabled,
      config: { ...def.defaultConfig, ...stored },
      lastRunAt: row?.last_run_at ? String(row.last_run_at) : null,
      lastStatus: (row?.last_status as RunStatus | null) ?? null,
      lastMessage: row?.last_message ? String(row.last_message) : null,
      nextRunAt: (row ? Number(row.enabled) === 1 : def.defaultEnabled) ? nextCronRun(def.trigger) : null,
    };
  });
}

export async function getAutomation(db: Db, ownerId: string, module: AutomationModule, key: string): Promise<AutomationView | null> {
  return (await listAutomations(db, ownerId, module)).find((a) => a.key === key) ?? null;
}

/** Garante a linha do usuário (necessária para gravar histórico). */
async function ensureRow(db: Db, ownerId: string, def: AutomationDef): Promise<string> {
  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO module_automations (id, owner_id, module, key, enabled, config_json) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (owner_id, module, key) DO NOTHING`,
    args: [id, ownerId, def.module, def.key, def.defaultEnabled ? 1 : 0, JSON.stringify(def.defaultConfig)],
  });
  const r = await db.execute({ sql: "SELECT id FROM module_automations WHERE owner_id = ? AND module = ? AND key = ?", args: [ownerId, def.module, def.key] });
  return String(r.rows[0]!.id);
}

/** Só chaves conhecidas da configuração padrão são aceitas (sem texto livre arbitrário no estado). */
export function sanitizeConfig(def: AutomationDef, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, base] of Object.entries(def.defaultConfig)) {
    if (!(k in patch)) continue;
    const v = patch[k];
    if (typeof base === "number" && typeof v === "number" && Number.isFinite(v)) out[k] = Math.max(0, Math.min(1000, Math.round(v)));
    else if (typeof base === "boolean" && typeof v === "boolean") out[k] = v;
    else if (base === null && (v === null || (typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v)))) out[k] = v;
  }
  return out;
}

export async function updateAutomation(
  db: Db,
  ownerId: string,
  module: AutomationModule,
  key: string,
  patch: { enabled?: boolean; config?: Record<string, unknown> },
): Promise<AutomationView | null> {
  const def = findDef(module, key);
  if (!def) return null;
  const id = await ensureRow(db, ownerId, def);
  const raw = await db.execute({ sql: "SELECT config_json FROM module_automations WHERE id = ?", args: [id] });
  const config = { ...def.defaultConfig, ...parseConfig(raw.rows[0]?.config_json), ...(patch.config ? sanitizeConfig(def, patch.config) : {}) };
  await db.execute({
    sql: "UPDATE module_automations SET enabled = COALESCE(?, enabled), config_json = ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?",
    args: [patch.enabled === undefined ? null : patch.enabled ? 1 : 0, JSON.stringify(config), id, ownerId],
  });
  return getAutomation(db, ownerId, module, key);
}

/** Estado interno da automação (ex.: entradas do Diário já processadas) — não é editável pelo usuário. */
export async function readAutomationState(db: Db, ownerId: string, module: AutomationModule, key: string): Promise<Record<string, unknown>> {
  const r = await db.execute({ sql: "SELECT config_json FROM module_automations WHERE owner_id = ? AND module = ? AND key = ?", args: [ownerId, module, key] });
  const cfg = parseConfig(r.rows[0]?.config_json);
  return (cfg._state as Record<string, unknown> | undefined) ?? {};
}

export async function writeAutomationState(db: Db, ownerId: string, module: AutomationModule, key: string, state: Record<string, unknown>): Promise<void> {
  const def = findDef(module, key);
  if (!def) return;
  const id = await ensureRow(db, ownerId, def);
  const r = await db.execute({ sql: "SELECT config_json FROM module_automations WHERE id = ?", args: [id] });
  const cfg = parseConfig(r.rows[0]?.config_json);
  await db.execute({ sql: "UPDATE module_automations SET config_json = ? WHERE id = ? AND owner_id = ?", args: [JSON.stringify({ ...cfg, _state: state }), id, ownerId] });
}

/**
 * Abre uma execução. Devolve null se já existe uma com o mesmo run_key
 * (idempotência: o cron e o botão não executam a mesma janela duas vezes).
 */
export async function beginRun(db: Db, ownerId: string, def: AutomationDef, trigger: "manual" | "cron" | "event", runKey: string): Promise<string | null> {
  const automationId = await ensureRow(db, ownerId, def);
  const id = nanoid();
  const r = await db.execute({
    sql: `INSERT INTO module_automation_runs (id, owner_id, automation_id, trigger_type, run_key, status) VALUES (?, ?, ?, ?, ?, 'skipped')
          ON CONFLICT (automation_id, run_key) DO NOTHING`,
    args: [id, ownerId, automationId, trigger, runKey],
  });
  return r.rowsAffected > 0 ? id : null;
}

export async function finishRun(db: Db, ownerId: string, def: AutomationDef, runId: string, status: RunStatus, summary: string): Promise<void> {
  const automationId = await ensureRow(db, ownerId, def);
  await db.batch(
    [
      { sql: "UPDATE module_automation_runs SET status = ?, summary = ?, finished_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [status, summary.slice(0, 500), runId, ownerId] },
      {
        sql: "UPDATE module_automations SET last_run_at = datetime('now'), last_status = ?, last_message = ?, next_run_at = ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?",
        args: [status, summary.slice(0, 500), nextCronRun(def.trigger), automationId, ownerId],
      },
    ],
    "write",
  );
}

export async function listRuns(db: Db, ownerId: string, module: AutomationModule, key: string, limit = 15) {
  const r = await db.execute({
    sql: `SELECT r.trigger_type, r.status, r.summary, r.started_at, r.finished_at FROM module_automation_runs r
          JOIN module_automations a ON a.id = r.automation_id AND a.owner_id = r.owner_id
          WHERE r.owner_id = ? AND a.module = ? AND a.key = ? ORDER BY r.started_at DESC LIMIT ?`,
    args: [ownerId, module, key, limit],
  });
  return (r.rows as unknown as Row[]).map((x) => ({
    trigger: String(x.trigger_type),
    status: String(x.status) as RunStatus,
    summary: x.summary ? String(x.summary) : null,
    startedAt: String(x.started_at),
    finishedAt: x.finished_at ? String(x.finished_at) : null,
  }));
}

/** Notificação de automação: no app e/ou push, conforme a configuração da própria automação. */
export async function notifyFromAutomation(
  db: Db,
  ownerId: string,
  input: { eventType: string; title: string; body: string; url: string; inApp: boolean; push: boolean },
): Promise<{ inApp: boolean; push: number }> {
  let push = 0;
  if (input.inApp) await recordInAppNotification(db, ownerId, input.eventType, { title: input.title, body: input.body, url: input.url });
  if (input.push) {
    try {
      push = (await sendPushToUser(ownerId, { title: input.title, body: input.body, url: input.url })).sent;
    } catch (err) {
      console.error("[automação] falha no push:", err);
    }
  }
  return { inApp: input.inApp, push };
}

/** Segunda-feira (YYYY-MM-DD) da semana de um dia local. */
export function mondayKey(dayKey: string): string {
  const d = new Date(`${dayKey}T00:00:00Z`);
  const wd = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - wd);
  return d.toISOString().slice(0, 10);
}
