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
import { runLabCheckin, runLabCycleEnd, runLabMissingData, runMemories, runWeeklyRetro, runWriteReminder } from "./chronicleLabService.js";
import { runBuildSnapshot, runJourneyBigMoments, runJourneyWeeklyRetro, runNearAchievements, runRewardGoalReady, runUnlockPipeline, runWeeklyRewardSuggestion } from "./heroHubService.js";
import { runHabitReminders, runHabitWeeklyReview, runStreakAnalysis } from "./habitsHubService.js";
import { runReadingReminder, runReadingSummary } from "./libraryHubService.js";
import { runAdminSummary, runDocumentCheck, runMissingFiles, runRiskAlerts, runSubscriptionDigest } from "./lifeAdminHubService.js";
import { runMorningPlan, runSmartAlerts } from "./todayHubService.js";
import { runPactReminders, runPactReplan, runPactSealReady } from "./contractGuildService.js";
import { runTavernReminder, runTomorrowPrep } from "./tavern3Service.js";
import { runBacktests, runForgeAlerts, runInference, runMonitoring, runQualityCheck, runScheduledTraining } from "./forgeService.js";
import { runReplanOverdue, runReviewCheck } from "./missionsBoardService.js";
import { runPreAnalysis, runReviewReminder } from "./journeyReviewService.js";
import { runAvailability, runDesiredBuild, runNextUnlock, runSkillPoints, runSuggestedMissions } from "./skillTreeService.js";
import { runPerformanceAlerts, runWeeklyEvolution } from "./heroDashboardService.js";
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
    case "diary:write_reminder":
      return runWriteReminder(db, ownerId, config);
    case "diary:weekly_retro":
      return runWeeklyRetro(db, ownerId, config);
    case "diary:memories":
      return runMemories(db, ownerId, config);
    case "lab:checkin_reminder":
      return runLabCheckin(db, ownerId, config);
    case "lab:missing_data":
      return runLabMissingData(db, ownerId, config);
    case "lab:cycle_end":
      return runLabCycleEnd(db, ownerId, config);
    case "hero:unlock_pipeline":
      return runUnlockPipeline(db, ownerId, config);
    case "hero:near_achievements":
      return runNearAchievements(db, ownerId, config);
    case "hero:reward_goal_ready":
      return runRewardGoalReady(db, ownerId, config);
    case "hero:weekly_reward_tip":
      return runWeeklyRewardSuggestion(db, ownerId, config);
    case "hero:build_snapshot":
      return runBuildSnapshot(db, ownerId, config);
    case "journey:big_moments":
      return runJourneyBigMoments(db, ownerId, config);
    case "journey:weekly_retro":
      return runJourneyWeeklyRetro(db, ownerId, config);
    case "hero:economy_log":
    case "journey:auto_log":
    case "journey:grouping":
    case "journey:codex_sync":
      return { status: "ok", summary: "Ativa: roda junto da ação correspondente na tela." };
    case "habits:reminders":
      return runHabitReminders(db, ownerId, config);
    case "habits:streak_analysis":
      return runStreakAnalysis(db, ownerId, config);
    case "habits:weekly_review":
      return runHabitWeeklyReview(db, ownerId, config);
    case "library:reminders":
      return runReadingReminder(db, ownerId, config);
    case "library:summary":
      return runReadingSummary(db, ownerId, config);
    case "admin:documents":
      return runDocumentCheck(db, ownerId, config);
    case "admin:subscriptions":
      return runSubscriptionDigest(db, ownerId, config);
    case "admin:files":
      return runMissingFiles(db, ownerId, config);
    case "admin:summary":
      return runAdminSummary(db, ownerId, config);
    case "admin:risk":
      return runRiskAlerts(db, ownerId, config);
    case "habits:module_sync":
    case "habits:consistency_missions":
    case "habits:planning":
    case "habits:experiments":
    case "library:progress":
    case "library:goal_sync":
    case "library:grimoire":
    case "library:isbn":
    case "library:recommendations":
    case "admin:due_reminders":
    case "admin:recurrence":
    case "admin:agenda_sync":
      return { status: "ok", summary: "Ativa: roda junto da ação correspondente na tela." };
    case "tavern:reminder":
      return runTavernReminder(db, ownerId, config);
    case "tavern:prepare_tomorrow":
      return runTomorrowPrep(db, ownerId, config);
    case "forge:quality_check":
      return runQualityCheck(db, ownerId, config);
    case "forge:scheduled_training":
      return runScheduledTraining(db, ownerId);
    case "forge:backtest":
      return runBacktests(db, ownerId);
    case "forge:scheduled_inference":
      return runInference(db, ownerId);
    case "forge:monitoring":
      return runMonitoring(db, ownerId, config);
    case "forge:alerts":
      return runForgeAlerts(db, ownerId, config);
    case "tavern:balance":
    case "tavern:ai_summary":
    case "tavern:diary_link":
    case "tavern:grimoire":
    case "tavern:forge_predictions":
    case "tavern:chronicle":
    case "tavern:rewards":
    case "forge:dataset_refresh":
    case "forge:drift":
    case "forge:artifact_update":
    case "forge:recommendations":
    case "forge:tavern_integration":
      return { status: "ok", summary: "Ativa: roda junto da ação correspondente na tela." };
    case "contracts:reminders":
      return runPactReminders(db, ownerId, config);
    case "contracts:replan":
      return runPactReplan(db, ownerId, config);
    case "contracts:seal_ready":
      return runPactSealReady(db, ownerId, config);
    case "contracts:progress":
    case "contracts:next_stage":
    case "contracts:achievements":
    case "contracts:agenda":
    case "contracts:goals":
    case "diary:autosave":
    case "diary:entry_summary":
    case "diary:extract_tasks":
      return { status: "ok", summary: "Ativa: roda junto da ação correspondente na tela." };
    case "today:morning_plan":
      return runMorningPlan(db, ownerId, config);
    case "today:smart_alerts":
      return runSmartAlerts(db, ownerId, config);
    case "hero:weekly_evolution":
      return runWeeklyEvolution(db, ownerId, config);
    case "hero:performance_alerts":
      return runPerformanceAlerts(db, ownerId, config);
    case "today:next_action":
    case "today:focus_blocks":
    case "today:progress_sync":
    case "today:day_close":
    case "hero:attributes_refresh":
    case "hero:progression":
      return { status: "ok", summary: "Ativa: roda junto da ação correspondente na tela." };
    case "diary:day_context":
    case "diary:learnings_grimoire":
    case "diary:goal_links":
    case "diary:lab_notes":
    case "lab:integrated_collection":
    case "lab:auto_progress":
    case "lab:pre_analysis":
    case "lab:goal_sync":
    case "lab:diary_integration":
      return { status: "ok", summary: "Ativa: roda junto da ação correspondente na tela." };
    case "agenda:auto_plan":
      return runAutoPlan(db, ownerId, config);
    case "agenda:conflicts":
      return runConflictAlerts(db, ownerId, config);
    case "agenda:reminders":
      return runAgendaDigest(db, ownerId, config);
    case "agenda:replan":
      return runReplan(db, ownerId, config);
    case "missions:replan_overdue":
      return runReplanOverdue(db, ownerId, config);
    case "missions:review_check":
      return runReviewCheck(db, ownerId, config);
    case "reviews:reminder":
      return runReviewReminder(db, ownerId, config);
    case "reviews:pre_analysis":
      return runPreAnalysis(db, ownerId);
    case "missions:smart_links":
    case "missions:deadline_planning":
    case "missions:breakdown_offer":
    case "missions:chronicle_marks":
    case "missions:reviews_feed":
    case "missions:focus_timer":
    case "reviews:ai_draft":
    case "reviews:comparison":
    case "reviews:bottlenecks":
    case "reviews:suggestions":
    case "reviews:mission_seeds":
    case "reviews:next_plan":
    case "reviews:achievements":
    case "reviews:chronicle":
    case "reviews:war_council":
    case "reviews:agenda_blocks":
      return { status: "ok", summary: "Ativa: roda junto da ação correspondente na tela." };
    case "skills:level_points":
      return runSkillPoints(db, ownerId);
    case "skills:available":
      return runAvailability(db, ownerId, config);
    case "skills:next_unlock":
      return runNextUnlock(db, ownerId, config);
    case "skills:desired_build":
      return runDesiredBuild(db, ownerId, config);
    case "skills:suggested_missions":
      return runSuggestedMissions(db, ownerId, config);
    case "skills:requirements":
    case "skills:effects_sync":
    case "skills:recommendations":
    case "skills:chronicle":
    case "skills:achievements":
      return { status: "ok", summary: "Ativa: roda junto da ação correspondente na Árvore." };
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
      "SELECT DISTINCT owner_id FROM personal_experiments WHERE status = 'active'",
      "SELECT DISTINCT owner_id FROM sleep_entries WHERE woke_up_at >= date('now', '-14 days')",
      "SELECT DISTINCT owner_id FROM water_entries WHERE recorded_at >= date('now', '-14 days')",
      // Perfil do Herói/Crônica: quem ganhou XP nas últimas 2 semanas.
      "SELECT DISTINCT owner_id FROM xp_events WHERE day_key >= date('now', '-14 days')",
      "SELECT DISTINCT owner_id FROM habits WHERE archived_at IS NULL",
      "SELECT DISTINCT owner_id FROM books WHERE status = 'Lendo'",
      "SELECT DISTINCT owner_id FROM life_admin_items WHERE status = 'active'",
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
