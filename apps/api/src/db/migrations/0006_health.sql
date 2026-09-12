-- ============================================================
-- 0006_health
-- Área de bem-estar (não é um sistema médico). health_entries
-- guarda métricas soltas (peso, passos, tempo sentado, meditação,
-- alongamento) como série temporal genérica; água, sono, exercício
-- e humor têm tabelas próprias por terem forma e consultas distintas.
-- ============================================================

CREATE TABLE IF NOT EXISTS health_entries (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metric      TEXT NOT NULL
                CHECK (metric IN ('weight', 'steps', 'sitting_minutes', 'meditation_minutes', 'stretching_minutes')),
  value       REAL NOT NULL,
  unit        TEXT,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  notes       TEXT
);

CREATE INDEX IF NOT EXISTS idx_health_entries_owner ON health_entries(owner_id, metric, recorded_at);

CREATE TABLE IF NOT EXISTS water_entries (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_ml   INTEGER NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_water_entries_owner ON water_entries(owner_id, recorded_at);

CREATE TABLE IF NOT EXISTS sleep_entries (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  went_to_bed_at TEXT NOT NULL,
  woke_up_at     TEXT NOT NULL,
  duration_minutes INTEGER,
  quality        INTEGER,        -- 1-5 percepção subjetiva
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sleep_entries_owner ON sleep_entries(owner_id, went_to_bed_at);

CREATE TABLE IF NOT EXISTS workouts (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,   -- ex: Corrida, Musculação, Caminhada, Bicicleta, Natação
  duration_minutes INTEGER,
  distance_km   REAL,
  calories      INTEGER,
  intensity     TEXT CHECK (intensity IN ('leve', 'moderada', 'intensa')),
  notes         TEXT,
  performed_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_workouts_owner ON workouts(owner_id, performed_at);

CREATE TABLE IF NOT EXISTS mood_entries (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mood        INTEGER NOT NULL CHECK (mood BETWEEN 1 AND 5),
  energy      INTEGER NOT NULL CHECK (energy BETWEEN 1 AND 5),
  stress      INTEGER CHECK (stress BETWEEN 1 AND 5),
  note        TEXT,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mood_entries_owner ON mood_entries(owner_id, recorded_at);
