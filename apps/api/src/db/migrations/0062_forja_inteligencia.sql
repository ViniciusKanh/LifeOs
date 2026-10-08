-- 0062_forja_inteligencia
-- Forja da Inteligência: artefatos (modelos treinados), arenas (comparações),
-- resumo do grimório (dataset) e profecias registradas. Tudo aditivo.
-- Os dados de origem continuam nos módulos (Saúde, Tarefas, Hábitos...).

CREATE TABLE IF NOT EXISTS ml_artifacts (
  id               TEXT PRIMARY KEY,
  owner_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  objective        TEXT NOT NULL,
  algorithm        TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('production', 'experimental')),
  xp               INTEGER NOT NULL DEFAULT 0,
  trainings        INTEGER NOT NULL DEFAULT 0,
  samples          INTEGER NOT NULL DEFAULT 0,
  metrics_json     TEXT NOT NULL,
  model_json       TEXT NOT NULL,
  importance_json  TEXT NOT NULL,
  insights_json    TEXT NOT NULL,
  first_trained_at TEXT NOT NULL DEFAULT (datetime('now')),
  trained_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, objective)
);

CREATE TABLE IF NOT EXISTS ml_experiments (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  artifact_id  TEXT REFERENCES ml_artifacts(id) ON DELETE SET NULL,
  objective    TEXT NOT NULL,
  winner       TEXT,
  samples      INTEGER NOT NULL,
  results_json TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ml_experiments_owner ON ml_experiments(owner_id, created_at);

-- Um resumo por usuário, substituído a cada atualização do grimório.
CREATE TABLE IF NOT EXISTS ml_grimoire_snapshots (
  owner_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  summary_json TEXT NOT NULL,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Profecias: uma por artefato e dia; o resultado real é conferido na reforja.
CREATE TABLE IF NOT EXISTS ml_predictions (
  id               TEXT PRIMARY KEY,
  owner_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  artifact_id      TEXT NOT NULL REFERENCES ml_artifacts(id) ON DELETE CASCADE,
  target_date      TEXT NOT NULL,
  probability      REAL NOT NULL,
  explanation_json TEXT NOT NULL,
  actual           INTEGER,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (artifact_id, target_date)
);
CREATE INDEX IF NOT EXISTS idx_ml_predictions_owner ON ml_predictions(owner_id, target_date);
