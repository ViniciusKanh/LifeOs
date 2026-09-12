-- ============================================================
-- 0007_focus_reviews
-- Focus Mode (Pomodoro / cronômetro livre) e as revisões diária
-- e semanal que fecham o ciclo Planejar → Executar → Registrar →
-- Medir → Melhorar.
-- ============================================================

CREATE TABLE IF NOT EXISTS focus_sessions (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id         TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  project_id      TEXT REFERENCES projects(id) ON DELETE SET NULL,
  mode            TEXT NOT NULL DEFAULT 'pomodoro' CHECK (mode IN ('pomodoro', 'free_timer')),
  planned_minutes INTEGER,
  actual_minutes  INTEGER,
  perceived_productivity INTEGER CHECK (perceived_productivity BETWEEN 1 AND 5),
  distractions    INTEGER NOT NULL DEFAULT 0,
  notes           TEXT,
  started_at      TEXT NOT NULL,
  ended_at        TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_focus_sessions_owner ON focus_sessions(owner_id, started_at);

CREATE TABLE IF NOT EXISTS daily_reviews (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  review_date  TEXT NOT NULL,     -- YYYY-MM-DD
  completion_pct INTEGER,
  highlights   TEXT,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, review_date)
);

CREATE TABLE IF NOT EXISTS weekly_reviews (
  id                TEXT PRIMARY KEY,
  owner_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start_date   TEXT NOT NULL,  -- YYYY-MM-DD (segunda-feira da semana)
  productivity_pct  INTEGER,
  health_pct        INTEGER,
  education_pct     INTEGER,
  reading_pct       INTEGER,
  habits_pct        INTEGER,
  tasks_completed   INTEGER,
  study_minutes     INTEGER,
  pages_read        INTEGER,
  focus_minutes     INTEGER,
  what_worked       TEXT,
  what_didnt_work   TEXT,
  what_to_improve   TEXT,
  next_priorities   TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, week_start_date)
);

CREATE INDEX IF NOT EXISTS idx_weekly_reviews_owner ON weekly_reviews(owner_id, week_start_date);
