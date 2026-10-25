-- ============================================================
-- 0078_notification_triggers_banco
-- Integração do Banco com os Gatilhos de notificação (bank_deposit_matured,
-- bank_loan_overdue). Mesmo problema do 0041: o CHECK constraint de
-- notification_triggers.event_type precisa listar os novos eventos, e
-- SQLite não permite ALTER de CHECK existente — recria a tabela (sem
-- alteração destrutiva: renomeia, cria nova, copia os dados, remove a
-- antiga). Nenhuma outra tabela tem FK pra notification_triggers.id.
-- ============================================================

ALTER TABLE notification_triggers RENAME TO notification_triggers_old_0078;

CREATE TABLE notification_triggers (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type     TEXT NOT NULL CHECK (event_type IN (
    'task_overdue',
    'task_due_today',
    'achievement_unlocked',
    'weekly_summary',
    'daily_insight',
    'journal_reminder',
    'bank_deposit_matured',
    'bank_loan_overdue'
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
FROM notification_triggers_old_0078;

DROP TABLE notification_triggers_old_0078;

CREATE INDEX IF NOT EXISTS idx_notification_triggers_owner ON notification_triggers(owner_id, active);
