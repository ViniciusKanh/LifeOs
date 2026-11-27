-- 0111_remove_diario
-- O Diário saiu do LifeOS a pedido do usuário (economizar espaço no banco e
-- tirar uma função que mais atrapalhava). Decisão explícita do usuário: APAGAR
-- todos os dados do Diário (sem cópia). XP, moedas e conquistas já ganhos
-- ficam (xp_events / user_achievements não são tocados).
--
-- 1) O foco do dia (missão principal) morava em journal_entries.focus_task_ids:
--    ganha tabela própria e os valores são copiados antes de apagar o Diário.
CREATE TABLE IF NOT EXISTS day_focus (
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_key         TEXT NOT NULL,
  focus_task_ids  TEXT NOT NULL DEFAULT '[]',
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, day_key)
);
INSERT OR IGNORE INTO day_focus (owner_id, day_key, focus_task_ids)
  SELECT owner_id, entry_date, focus_task_ids FROM journal_entries
   WHERE focus_task_ids IS NOT NULL AND focus_task_ids NOT IN ('', '[]');

-- 2) Referências ao Diário em outros módulos.
DELETE FROM note_links WHERE target_type = 'journal';
UPDATE habits SET auto_source = NULL, auto_threshold = NULL WHERE auto_source = 'journal';
DELETE FROM daily_ritual_steps WHERE kind = 'journal';
DELETE FROM quest_assignments WHERE template_key IN ('d_journal', 'w_journal') AND claimed_at IS NULL;
DELETE FROM search_embeddings WHERE entity_type = 'journal_entry';
DELETE FROM automations WHERE module = 'diary' OR (module = 'grimoire' AND key = 'diary_cards') OR (module = 'lab' AND key = 'diary_integration') OR (module = 'tavern' AND key = 'diary_link') OR (module = 'today' AND key = 'day_close');
DELETE FROM notification_triggers WHERE event_type = 'journal_reminder';
UPDATE user_settings SET journal_pin_hash = NULL, journal_writing_goal = NULL;
-- Etapas de protocolo que abriam o Diário viram etapas manuais (o histórico de execuções fica).
UPDATE protocol_steps SET action_type = 'CUSTOM', action_config_json = NULL WHERE action_type = 'OPEN_SCREEN' AND action_config_json LIKE '%/diario%';

-- 3) Conquistas do Diário que ninguém desbloqueou saem do catálogo.
DELETE FROM achievements WHERE metric IN ('journal_days_total', 'journal_favorites_total', 'journal_takeaways_total', 'journal_retros_saved', 'journal_full_closings', 'journal_voice_days', 'journal_media_days')
  AND id NOT IN (SELECT achievement_id FROM user_achievements);

-- 4) Tabelas do Diário (filhas primeiro).
DROP TABLE IF EXISTS chronicle_moments;
DROP TABLE IF EXISTS journal_entry_journals;
DROP TABLE IF EXISTS journal_entry_links;
DROP TABLE IF EXISTS journal_entry_media;
DROP TABLE IF EXISTS journal_word_exclusions;
DROP TABLE IF EXISTS journal_retrospectives;
DROP TABLE IF EXISTS journal_entries_guided_backup;
DROP TABLE IF EXISTS journal_thoughts_backup;
DROP TABLE IF EXISTS journals;
DROP TABLE IF EXISTS journal_entries;
