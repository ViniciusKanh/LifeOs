import { Router } from "express";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { exportRateLimit } from "../middleware/rateLimit.js";
import { todayKeyFor } from "../services/gamificationService.js";

export const exportRouter = Router();
exportRouter.use(requireAuth);

/**
 * Exportação LGPD ("Exportar meus dados").
 *
 * Toda tabela com dado do usuário até a migration 0067, na ordem das
 * migrations. Cada entrada diz como filtrar pelo dono:
 * - padrão: `owner_id = ?`;
 * - `ownerColumn`: tabelas antigas que usam `user_id`;
 * - `where`: tabelas de junção sem dono próprio, filtradas pelo pai.
 *
 * Fora de propósito (segredo ou dado só técnico): users.password_hash e
 * segredos MFA, password_reset_tokens, email_verification_tokens,
 * mfa_recovery_codes, desktop_auth_codes, push_subscriptions (endpoint e
 * chaves do navegador), user_settings.journal_pin_hash, search_embeddings
 * (vetores derivados) e ml_artifacts (modelos serializados derivados).
 * Tabelas novas são acrescentadas aqui quando entram no projeto.
 */
type ExportTable = { table: string; ownerColumn?: string; where?: string; argCount?: number };

export const EXPORTABLE_TABLES: readonly ExportTable[] = [
  { table: "user_settings", ownerColumn: "user_id" },
  { table: "goals" },
  { table: "goal_progress" },
  { table: "habits" },
  { table: "habit_entries" },
  { table: "projects" },
  { table: "project_members", where: "project_id IN (SELECT id FROM projects WHERE owner_id = ?)" },
  { table: "task_statuses" },
  { table: "tasks" },
  { table: "subtasks" },
  { table: "tags" },
  { table: "task_tags", where: "task_id IN (SELECT id FROM tasks WHERE owner_id = ?)" },
  { table: "task_dependencies", where: "task_id IN (SELECT id FROM tasks WHERE owner_id = ?)" },
  { table: "time_entries" },
  { table: "books" },
  { table: "book_notes" },
  { table: "reading_sessions" },
  { table: "educations" },
  { table: "courses" },
  { table: "subjects" },
  { table: "academic_projects" },
  { table: "health_entries" },
  { table: "water_entries" },
  { table: "sleep_entries" },
  { table: "workouts" },
  { table: "mood_entries" },
  { table: "focus_sessions" },
  { table: "daily_reviews" },
  { table: "weekly_reviews" },
  { table: "events" },
  { table: "notifications" },
  { table: "user_achievements" },
  { table: "life_scores" },
  { table: "analytics_snapshots" },
  { table: "ai_interactions" },
  { table: "academic_deadlines" },
  { table: "study_sessions" },
  { table: "semester_checklist" },
  { table: "daily_insights" },
  { table: "inbox_items" },
  { table: "work_notes" },
  { table: "weekly_email_log" },
  { table: "custom_achievements" },
  { table: "notification_triggers" },
  { table: "notification_delivery_log" },
  { table: "custom_notification_triggers" },
  { table: "life_map_links", ownerColumn: "user_id" },
  { table: "personal_experiments" },
  { table: "personal_experiment_logs" },
  { table: "planned_time_blocks" },
  { table: "data_health_snapshots" },
  { table: "notification_dismissals" },
  { table: "journal_entries" },
  { table: "journals" },
  { table: "journal_entry_journals", where: "journal_id IN (SELECT id FROM journals WHERE owner_id = ?)" },
  { table: "journal_entry_media" },
  { table: "journal_entry_links" },
  { table: "task_attachments" },
  { table: "experiment_ai_reports" },
  { table: "journal_entries_guided_backup" },
  { table: "journal_word_exclusions" },
  { table: "life_admin_items" },
  { table: "life_admin_history" },
  { table: "life_admin_reminder_log" },
  { table: "life_vision" },
  { table: "life_wheel_scores" },
  { table: "periodic_reviews" },
  { table: "notes" },
  { table: "note_links" },
  { table: "xp_events" },
  { table: "coin_ledger" },
  { table: "rewards" },
  { table: "reward_redemptions" },
  { table: "contracts" },
  { table: "gamification_settings" },
  { table: "campaigns" },
  { table: "campaign_projects" },
  { table: "campaign_tasks" },
  { table: "campaign_habits" },
  { table: "campaign_milestones" },
  { table: "campaign_events" },
  { table: "codex_discoveries" },
  { table: "codex_unlocks" },
  { table: "gem_ledger" },
  { table: "user_inventory_items" },
  { table: "inventory_transactions" },
  { table: "active_item_effects" },
  { table: "character_build_targets" },
  { table: "protocols" },
  { table: "protocol_steps" },
  { table: "protocol_favorites" },
  { table: "protocol_runs" },
  { table: "protocol_run_steps" },
  { table: "daily_priorities" },
  { table: "recovery_days" },
  { table: "ml_experiments" },
  { table: "ml_grimoire_snapshots" },
  { table: "ml_predictions" },
  { table: "workout_sets" },
  // 0068–0074
  { table: "quest_assignments" },
  { table: "season_summaries" },
  { table: "flashcard_decks" },
  { table: "flashcards" },
  { table: "flashcard_reviews" },
  { table: "reading_year_goals" },
  { table: "weekly_plans" },
  // Guilda: o que o usuário compartilhou e os convites que ele aceitou/recebeu.
  { table: "guild_shares", where: "owner_id = ? OR invitee_user_id = ?", argCount: 2 },
  // Recados enviados pelo usuário e recebidos nos itens dele.
  { table: "guild_cheers", where: "from_user_id = ? OR share_id IN (SELECT id FROM guild_shares WHERE owner_id = ?)", argCount: 2 },
];

/**
 * Defesa extra: qualquer coluna com cara de credencial é removida da linha,
 * mesmo que uma migration futura a coloque numa tabela exportável.
 */
const SECRET_COLUMN = /(password|passwd|secret|token|api_?key|_hash$|^p256dh$|^auth_key$|encrypted)/i;

export function stripSecrets(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) if (!SECRET_COLUMN.test(key)) out[key] = value;
  return out;
}

function filterFor(t: ExportTable): string {
  if (t.where) return t.where;
  // ownerColumn é constante desta lista (nunca entrada do usuário).
  return `${t.ownerColumn ?? "owner_id"} = ?`;
}

/**
 * GET /api/export/me — exporta os dados reais do usuário logado num único
 * JSON (um array de linhas por tabela, na forma do banco). Só lê linhas do
 * próprio usuário; tabelas que ainda não existem no banco são ignoradas.
 */
exportRouter.get("/me", exportRateLimit(), async (req, res) => {
  const db = getDb();
  const ownerId = req.user!.id;

  // Lista de tabelas existentes: o export não quebra se uma migration ainda não rodou.
  const existing = await db.execute("SELECT name FROM sqlite_master WHERE type = 'table'");
  const present = new Set((existing.rows as unknown as Array<{ name: string }>).map((r) => r.name));
  const tables = EXPORTABLE_TABLES.filter((t) => present.has(t.table));

  const [profileResult, ...tableResults] = await Promise.all([
    db.execute({
      sql: "SELECT id, name, email, role, avatar_url, timezone, created_at FROM users WHERE id = ?",
      args: [ownerId],
    }),
    ...tables.map((t) => db.execute({ sql: `SELECT * FROM ${t.table} WHERE ${filterFor(t)}`, args: Array<string>(t.argCount ?? 1).fill(ownerId) })),
  ]);

  const data: Record<string, unknown[]> = {};
  tables.forEach((t, i) => {
    data[t.table] = (tableResults[i].rows as unknown as Array<Record<string, unknown>>).map(stripSecrets);
  });

  const payload = {
    exportedAt: new Date().toISOString(),
    profile: profileResult.rows[0] ? stripSecrets(profileResult.rows[0] as unknown as Record<string, unknown>) : null,
    tables: tables.map((t) => t.table),
    data,
  };

  const dayKey = await todayKeyFor(db, ownerId);
  res.setHeader("Content-Disposition", `attachment; filename="lifeos-export-${dayKey}.json"`);
  res.setHeader("Cache-Control", "no-store");
  return res.json(payload);
});
