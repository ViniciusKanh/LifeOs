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
import { runGuildReport, runLoanAlerts, runVaultGoals } from "./bankHubService.js";
import { runAutoProgress, runGrimoireLink, runSmartDeadlines, runWeeklyStudyPlan } from "./educationHubService.js";
import { runAgendaDigest, runAutoPlan, runConflictAlerts, runDueAlerts, runQuestReminder, runReplan } from "./planningHubService.js";
import { runConsistencyHistory, runDailySummary, runHydration, runMoodCheckin, runSleepRoutine } from "./healthHubService.js";

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
    case "bank:loan_alerts":
      return runLoanAlerts(db, ownerId, config);
    case "bank:vault_goals":
      return runVaultGoals(db, ownerId, config);
    case "bank:guild_report":
      return runGuildReport(db, ownerId, config);
    case "bank:vault_split": {
      const total = Object.values(config).reduce<number>((a, v) => a + (typeof v === "number" ? v : 0), 0);
      return { status: "ok", summary: `Ativa a cada moeda ganha (com a reserva automática ligada). Divisão atual soma ${total}%.` };
    }
    case "education:smart_deadlines":
      return runSmartDeadlines(db, ownerId, config);
    case "education:weekly_study_plan":
      return runWeeklyStudyPlan(db, ownerId, config);
    case "education:grimoire_link":
      return runGrimoireLink(db, ownerId, config);
    case "education:auto_progress":
      return runAutoProgress(db, ownerId);
    case "health:hydration":
      return runHydration(db, ownerId, config);
    case "health:sleep_routine":
      return runSleepRoutine(db, ownerId, config);
    case "health:mood_checkin":
      return runMoodCheckin(db, ownerId, config);
    case "health:daily_summary":
      return runDailySummary(db, ownerId, config);
    case "health:consistency_history":
      return runConsistencyHistory(db, ownerId);
    case "agenda:auto_plan":
      return runAutoPlan(db, ownerId, config);
    case "agenda:conflicts":
      return runConflictAlerts(db, ownerId, config);
    case "agenda:reminders":
      return runAgendaDigest(db, ownerId, config);
    case "agenda:replan":
      return runReplan(db, ownerId, config);
    case "missions:due_alerts":
      return runDueAlerts(db, ownerId, config);
    case "quests:quest_reminder":
      return runQuestReminder(db, ownerId, config);
    case "agenda:module_sync":
    case "agenda:focus_blocks":
    case "missions:subtask_progress":
    case "missions:priority_pick":
    case "missions:sync_goals":
      return { status: "ok", summary: "Ativa: roda junto da ação correspondente na tela." };
    case "health:health_goals":
      return { status: "ok", summary: "Metas aplicadas na Vitalidade do Dia, missões e rankings." };
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
  const enabledRows = await db.execute({ sql: "SELECT DISTINCT owner_id FROM automations WHERE enabled = 1", args: [] });
  for (const r of enabledRows.rows) owners.add(String(r.owner_id));
  // Automações ligadas por padrão valem também para quem nunca abriu a tela (sem linha no banco).
  if (scheduled.some((d) => d.defaultEnabled)) {
    // Usuários ativos em cada módulo (só quem tem dados — ninguém recebe automação de módulo que não usa).
    const sources = [
      "SELECT DISTINCT owner_id FROM goals WHERE status = 'active'",
      "SELECT DISTINCT owner_id FROM bank_loans WHERE status = 'active'",
      "SELECT DISTINCT owner_id FROM bank_deposits WHERE status = 'active' AND goal_id IS NOT NULL",
      "SELECT DISTINCT owner_id FROM educations WHERE progress_pct < 100",
      "SELECT DISTINCT owner_id FROM events WHERE starts_at >= date('now', '-1 day')",
      "SELECT DISTINCT owner_id FROM sleep_entries WHERE woke_up_at >= date('now', '-14 days')",
      "SELECT DISTINCT owner_id FROM water_entries WHERE recorded_at >= date('now', '-14 days')",
    ];
    for (const sql of sources) {
      const users = await db.execute({ sql, args: [] });
      for (const r of users.rows) owners.add(String(r.owner_id));
    }
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
