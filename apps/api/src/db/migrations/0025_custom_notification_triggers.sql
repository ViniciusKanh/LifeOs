CREATE TABLE IF NOT EXISTS custom_notification_triggers (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  condition_type TEXT NOT NULL CHECK (condition_type IN ('task_due_in', 'task_overdue_by')),
  days INTEGER NOT NULL CHECK (days BETWEEN 0 AND 365),
  priority TEXT CHECK (priority IN ('Baixa', 'Média', 'Alta')),
  channel_email INTEGER NOT NULL DEFAULT 0,
  channel_push INTEGER NOT NULL DEFAULT 0,
  channel_in_app INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_custom_notification_triggers_owner
  ON custom_notification_triggers(owner_id, active);
