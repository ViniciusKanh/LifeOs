-- ============================================================
-- 0024_notification_triggers
-- Regras de gatilho por usuário: quais eventos devem gerar alerta
-- no app, push e/ou e-mail. A entrega fica registrada por dia/canal
-- para evitar disparos repetidos quando uma checagem roda mais de
-- uma vez.
-- ============================================================

CREATE TABLE IF NOT EXISTS notification_triggers (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type     TEXT NOT NULL CHECK (event_type IN (
    'task_overdue',
    'task_due_today',
    'achievement_unlocked',
    'weekly_summary',
    'daily_insight'
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

CREATE INDEX IF NOT EXISTS idx_notification_triggers_owner ON notification_triggers(owner_id, active);

CREATE TABLE IF NOT EXISTS notification_delivery_log (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type     TEXT NOT NULL,
  source_id      TEXT NOT NULL,
  channel        TEXT NOT NULL CHECK (channel IN ('email', 'push', 'in_app')),
  delivered_on   TEXT NOT NULL,
  delivered_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, event_type, source_id, channel, delivered_on)
);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_owner_event ON notification_delivery_log(owner_id, event_type, delivered_on);
