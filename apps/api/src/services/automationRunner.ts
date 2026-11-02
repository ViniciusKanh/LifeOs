import type { getDb } from "../db/client.js";
import { todayKeyFor } from "./gamificationService.js";
import {
  AUTOMATION_DEFS,
  beginRun,
  findDef,
  finishRun,
  getAutomation,
  mondayKey,
  notifyFromAutomation,
  type AutomationModule,
  type RunStatus,
} from "./automationService.js";
import { runDiaryCards, studyReminderPayload } from "./grimoireHubService.js";
import { runDeadlineAlerts, runProgressSync, runSmartReplan, runWeeklyPlan } from "./goalsHubService.js";
import { syncDeckGoalAfterStudy } from "./grimoireService.js";

type Db = ReturnType<typeof getDb>;
type Outcome = { status: RunStatus; summary: string };

/**
 * Executor das automações (separado do catálogo para evitar dependência
 * circular entre serviços). Usado pelo botão "Executar agora" e pelo cron
 * diário já existente. Cada execução fica no histórico.
 */
async function execute(db: Db, ownerId: string, module: AutomationModule, key: string, config: Record<string, unknown>): Promise<Outcome> {
  const id = `${module}:${key}`;
  switch (id) {
    case "grimoire:diary_cards":
      return runDiaryCards(db, ownerId, config);
    case "grimoire:study_reminder": {
      const p = await studyReminderPayload(db, ownerId, Number(config.minDue ?? 1));
      if (!p) return { status: "skipped", summary: "Nada para revisar hoje (ou o ritual já foi concluído)." };
      const hour = Number(config.preferredHour ?? 19);
      await notifyFromAutomation(db, ownerId, {
        eventType: "grimoire_reminder",
        title: "Ritual do Grimório",
        body: `${p.due} cartão(ões) vencido(s) e ${p.fresh} novo(s) esperando por você. Seu horário de estudo: ${hour}h.`,
        url: "/grimorio",
        inApp: config.inApp !== false,
        push: config.push === true,
      });
      return { status: "ok", summary: `Lembrete enviado (${p.due} vencidos, ${p.fresh} novos).` };
    }
    case "grimoire:goal_sync": {
      const today = await todayKeyFor(db, ownerId);
      const r = await db.execute({ sql: "SELECT id FROM flashcard_decks WHERE owner_id = ? AND goal_id IS NOT NULL AND goal_sync_mode = 'mastery' AND archived_at IS NULL", args: [ownerId] });
      let n = 0;
      for (const row of r.rows) if ((await syncDeckGoalAfterStudy(db, ownerId, String(row.id), today)).updated) n++;
      return r.rows.length === 0
        ? { status: "skipped", summary: "Nenhum baralho em modo “domínio” vinculado a meta. Os dias de estudo são contados a cada revisão." }
        : { status: "ok", summary: `${n} meta(s) atualizada(s) pelo domínio dos baralhos.` };
    }
    case "goals:progress_sync":
      return runProgressSync(db, ownerId);
    case "goals:deadline_alerts":
      return runDeadlineAlerts(db, ownerId, config);
    case "goals:weekly_plan":
      return runWeeklyPlan(db, ownerId, config);
    case "goals:smart_replan":
      return runSmartReplan(db, ownerId);
    case "grimoire:priority_review":
      return { status: "ok", summary: `Ativa: a fila de hoje é ordenada por prioridade, com até ${Number(config.dailyLimit ?? 150)} revisões por dia.` };
    case "goals:forecast":
      return { status: "ok", summary: "Ativa: a previsão é recalculada sempre que as metas são abertas." };
    default:
      return { status: "skipped", summary: "Esta automação roda junto da ação correspondente (importação, planejamento com IA)." };
  }
}

/** "Executar agora": roda mesmo fora do agendamento, mas uma vez por minuto no máximo (run_key). */
export async function runAutomationNow(db: Db, ownerId: string, module: AutomationModule, key: string) {
  const def = findDef(module, key);
  if (!def) return null;
  const view = await getAutomation(db, ownerId, module, key);
  const runKey = `manual:${new Date().toISOString().slice(0, 16)}`;
  const runId = await beginRun(db, ownerId, def, "manual", runKey);
  if (!runId) return { status: "skipped" as RunStatus, summary: "Já executada agora há pouco. Aguarde um minuto." };
  let out: Outcome;
  try {
    out = await execute(db, ownerId, module, key, view?.config ?? def.defaultConfig);
  } catch (err) {
    console.error(`[automação] ${module}:${key} falhou:`, err);
    out = { status: "error", summary: "Falha inesperada ao executar. Nada foi alterado além do que já estava concluído." };
  }
  await finishRun(db, ownerId, def, runId, out.status, out.summary);
  return out;
}

/** Cron diário: roda as automações agendadas e ligadas de todos os usuários (idempotente por dia/semana). */
export async function runDueAutomationsForAll(db: Db): Promise<{ ran: number; skipped: number; errors: number }> {
  const scheduled = AUTOMATION_DEFS.filter((d) => d.trigger === "daily" || d.trigger === "weekly");
  const owners = new Set<string>();
  const enabledRows = await db.execute({ sql: "SELECT DISTINCT owner_id FROM module_automations WHERE enabled = 1", args: [] });
  for (const r of enabledRows.rows) owners.add(String(r.owner_id));
  // Automações ligadas por padrão valem também para quem nunca abriu a tela (sem linha no banco).
  if (scheduled.some((d) => d.defaultEnabled)) {
    const users = await db.execute({ sql: "SELECT DISTINCT owner_id FROM goals WHERE status = 'active'", args: [] });
    for (const r of users.rows) owners.add(String(r.owner_id));
  }
  let ran = 0;
  let skipped = 0;
  let errors = 0;
  for (const ownerId of owners) {
    const today = await todayKeyFor(db, ownerId);
    for (const def of scheduled) {
      const view = await getAutomation(db, ownerId, def.module, def.key);
      if (!view?.enabled) continue;
      const runKey = def.trigger === "weekly" ? `week:${mondayKey(today)}` : `day:${today}`;
      const runId = await beginRun(db, ownerId, def, "cron", runKey);
      if (!runId) {
        skipped++;
        continue;
      }
      let out: Outcome;
      try {
        out = await execute(db, ownerId, def.module, def.key, view.config);
      } catch (err) {
        console.error(`[automação] ${def.module}:${def.key} (${ownerId}) falhou:`, err);
        out = { status: "error", summary: "Falha inesperada na execução agendada." };
      }
      await finishRun(db, ownerId, def, runId, out.status, out.summary);
      if (out.status === "error") errors++;
      else ran++;
    }
  }
  return { ran, skipped, errors };
}
