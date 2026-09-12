-- ============================================================
-- 0002_goals_habits
-- Metas hierárquicas (Meta anual → Objetivo → Projeto → Tarefa)
-- e hábitos com registro diário. Criada antes de tasks (0003)
-- porque tasks.goal_id referencia goals(id).
-- ============================================================

CREATE TABLE IF NOT EXISTS goals (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_goal_id TEXT REFERENCES goals(id) ON DELETE CASCADE, -- permite hierarquia de metas
  title          TEXT NOT NULL,
  description    TEXT,
  category       TEXT,
  kind           TEXT NOT NULL DEFAULT 'task_based'
                   CHECK (kind IN ('numeric', 'percentage', 'binary', 'task_based')),
  target_value   REAL,
  current_value  REAL NOT NULL DEFAULT 0,
  unit           TEXT,                 -- ex: 'páginas', 'km', 'horas'
  due_date       TEXT,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done', 'abandoned')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_goals_owner ON goals(owner_id);
CREATE INDEX IF NOT EXISTS idx_goals_parent ON goals(parent_goal_id);

-- Histórico de progresso de uma meta (série temporal do valor atual).
CREATE TABLE IF NOT EXISTS goal_progress (
  id          TEXT PRIMARY KEY,
  goal_id     TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value       REAL NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  note        TEXT
);

CREATE INDEX IF NOT EXISTS idx_goal_progress_goal ON goal_progress(goal_id, recorded_at);

CREATE TABLE IF NOT EXISTS habits (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  icon         TEXT,
  frequency    TEXT NOT NULL DEFAULT 'daily'
                 CHECK (frequency IN ('daily', 'specific_days', 'times_per_week', 'weekly', 'monthly')),
  frequency_config TEXT, -- JSON: ex. dias da semana ou N vezes
  target_count INTEGER NOT NULL DEFAULT 1,
  archived_at  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_habits_owner ON habits(owner_id);

CREATE TABLE IF NOT EXISTS habit_entries (
  id          TEXT PRIMARY KEY,
  habit_id    TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_date  TEXT NOT NULL,          -- YYYY-MM-DD
  count       INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (habit_id, entry_date)
);

CREATE INDEX IF NOT EXISTS idx_habit_entries_owner ON habit_entries(owner_id, entry_date);
