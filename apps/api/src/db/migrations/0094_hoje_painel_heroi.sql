-- Hoje 3.0 + Painel do Herói — somente tabelas novas (aditivo).

-- Ritual da Jornada configurável. Etapas automáticas (hábito, missão, foco,
-- saúde, diário) são concluídas por eventos reais; as manuais, por marcação.
CREATE TABLE IF NOT EXISTS daily_ritual_steps (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('manual', 'planning', 'task', 'habit', 'focus', 'health', 'study', 'journal')),
  ref_id     TEXT,
  position   INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_daily_ritual_steps_owner ON daily_ritual_steps(owner_id, active, position);

-- Histórico do ritual: uma linha por etapa cumprida no dia (manual ou detectada).
CREATE TABLE IF NOT EXISTS daily_ritual_checks (
  owner_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  step_id   TEXT NOT NULL REFERENCES daily_ritual_steps(id) ON DELETE CASCADE,
  day_key   TEXT NOT NULL,
  source    TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'auto')),
  done_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, step_id, day_key)
);

-- Cronômetro de foco da tela Hoje: estado por timestamps (sobrevive a recarga/aba
-- minimizada). A sessão em si é um time_entries normal — fonte oficial do foco e do XP.
CREATE TABLE IF NOT EXISTS focus_timer_state (
  owner_id        TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  entry_id        TEXT NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
  mode            TEXT NOT NULL CHECK (mode IN ('pomodoro', 'free', 'block')),
  planned_minutes INTEGER,
  started_at      TEXT NOT NULL,
  paused_at       TEXT,
  paused_ms       INTEGER NOT NULL DEFAULT 0,
  link_type       TEXT CHECK (link_type IS NULL OR link_type IN ('task', 'subject', 'deck', 'project')),
  link_id         TEXT,
  link_label      TEXT
);
