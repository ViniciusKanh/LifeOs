-- ============================================================
-- 0008_events_notifications
-- Calendário interno (eventos manuais + referências a tarefas/
-- estudos/metas) e a fila de notificações do usuário.
-- ============================================================

CREATE TABLE IF NOT EXISTS events (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  starts_at    TEXT NOT NULL,
  ends_at      TEXT,
  all_day      INTEGER NOT NULL DEFAULT 0,
  source_type  TEXT CHECK (source_type IN ('manual', 'task', 'goal', 'subject', 'habit')),
  source_id    TEXT,           -- id da entidade de origem, quando source_type != manual
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_owner ON events(owner_id, starts_at);

CREATE TABLE IF NOT EXISTS notifications (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL
                 CHECK (kind IN ('task_due', 'habit_reminder', 'water_reminder', 'reading_reminder',
                                  'study_reminder', 'deadline', 'weekly_review')),
  title        TEXT NOT NULL,
  body         TEXT,
  read_at      TEXT,
  scheduled_for TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_owner ON notifications(owner_id, read_at);
