-- ============================================================
-- 0041_notification_triggers_journal_reminder
-- Bug em produção: notificationTriggersService.ts (NOTIFICATION_TRIGGER_DEFS,
-- Fase 11 do Diário) inclui o evento 'journal_reminder', mas o CHECK
-- constraint de notification_triggers.event_type (0024) nunca foi
-- atualizado pra permitir esse valor. Toda chamada que tenta
-- semear/gravar um gatilho 'journal_reminder' (ensureDefaultTriggers,
-- chamado a partir de GET /api/notifications/live) falha com
-- SQLITE_CONSTRAINT: CHECK constraint failed.
--
-- SQLite não permite ALTER de CHECK constraint existente — é preciso
-- recriar a tabela. Sem alteração destrutiva: renomeia a tabela atual,
-- cria a nova já com 'journal_reminder' permitido, copia todos os
-- dados e remove a tabela antiga. Nenhuma outra tabela tem FK pra
-- notification_triggers.id, então é seguro.
-- ============================================================

ALTER TABLE notification_triggers RENAME TO notification_triggers_old_0041;

CREATE TABLE notification_triggers (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type     TEXT NOT NULL CHECK (event_type IN (
    'task_overdue',
    'task_due_today',
    'achievement_unlocked',
    'weekly_summary',
    'daily_insight',
    'journal_reminder'
  )),
  label          TEXT NOT NULL,
  description    TEXT,
  channel_email  INTEGER NOT NULL DEFAULT 0,
  channel_push   INTEGER NOT NULL DEFAULT 1,
  channel_in_app INTEGER NOT NULL DEFAULT 1,
  alert_level    TEXT NOT NULL DEFAULT 'medium' CHECK (alert_level IN ('soft', 'medium', 'critical')),
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, event_type)
);

INSERT INTO notification_triggers (
  id, owner_id, event_type, label, description,
  channel_email, channel_push, channel_in_app, alert_level, active,
  created_at, updated_at
)
SELECT
  id, owner_id, event_type, label, description,
  channel_email, channel_push, channel_in_app, alert_level, active,
  created_at, updated_at
FROM notification_triggers_old_0041;

DROP TABLE notification_triggers_old_0041;

CREATE INDEX IF NOT EXISTS idx_notification_triggers_owner ON notification_triggers(owner_id, active);
