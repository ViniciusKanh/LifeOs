-- 0060_build_protocolos
-- Build do Personagem e Protocolos. Tudo aditivo; nenhum dado existente muda.

-- Build desejada (uma por usuário). Ausente = preset padrão (não gravado).
CREATE TABLE IF NOT EXISTS character_build_targets (
  owner_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  preset_id    TEXT,
  name         TEXT NOT NULL,
  targets_json TEXT NOT NULL,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Protocolos pessoais (templates globais ficam no catálogo do código, só leitura).
CREATE TABLE IF NOT EXISTS protocols (
  id                  TEXT PRIMARY KEY,
  owner_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_template     TEXT,
  name                TEXT NOT NULL,
  description         TEXT,
  category            TEXT NOT NULL,
  trigger_description TEXT,
  trigger_json        TEXT NOT NULL,
  art                 TEXT NOT NULL,
  settings_json       TEXT,
  is_active           INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_protocols_owner ON protocols(owner_id, is_active);

CREATE TABLE IF NOT EXISTS protocol_steps (
  id                 TEXT PRIMARY KEY,
  protocol_id        TEXT NOT NULL REFERENCES protocols(id) ON DELETE CASCADE,
  owner_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position           INTEGER NOT NULL,
  title              TEXT NOT NULL,
  description        TEXT,
  action_type        TEXT NOT NULL,
  action_config_json TEXT,
  is_optional        INTEGER NOT NULL DEFAULT 0,
  estimated_minutes  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_protocol_steps_protocol ON protocol_steps(protocol_id, position);

-- Favorito por usuário (vale para template "t:<key>" e pessoal "p:<id>").
CREATE TABLE IF NOT EXISTS protocol_favorites (
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  protocol_ref TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, protocol_ref)
);

-- Execuções: base de "usos", Timeline e métricas. request_id = idempotência.
CREATE TABLE IF NOT EXISTS protocol_runs (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  protocol_ref  TEXT NOT NULL,
  protocol_name TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('started', 'partial', 'completed', 'canceled')),
  context_json  TEXT,
  request_id    TEXT NOT NULL,
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at  TEXT,
  UNIQUE (owner_id, request_id)
);
CREATE INDEX IF NOT EXISTS idx_protocol_runs_owner ON protocol_runs(owner_id, started_at);
CREATE INDEX IF NOT EXISTS idx_protocol_runs_ref ON protocol_runs(owner_id, protocol_ref);

CREATE TABLE IF NOT EXISTS protocol_run_steps (
  id           TEXT PRIMARY KEY,
  run_id       TEXT NOT NULL REFERENCES protocol_runs(id) ON DELETE CASCADE,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  step_ref     TEXT NOT NULL,
  position     INTEGER NOT NULL,
  title        TEXT NOT NULL,
  action_type  TEXT NOT NULL,
  mode         TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('pending', 'skipped', 'completed', 'failed')),
  result_json  TEXT,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_protocol_run_steps_run ON protocol_run_steps(run_id, position);

-- Missão principal escolhida para o dia (usada pela tela Hoje).
CREATE TABLE IF NOT EXISTS daily_priorities (
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_key    TEXT NOT NULL,
  task_id    TEXT NOT NULL,
  source     TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, day_key)
);

-- Dias marcados como recuperação (pelo protocolo ou manualmente).
CREATE TABLE IF NOT EXISTS recovery_days (
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_key    TEXT NOT NULL,
  source     TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, day_key)
);
