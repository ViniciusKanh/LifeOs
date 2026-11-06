-- ============================================================
-- 0096_taverna_forja_3
-- Taverna 3.0 (ritual de fim do dia) e Forja da Inteligência 3.0
-- (laboratório de Machine Learning com modelos configuráveis, versões,
-- execuções, previsões e monitoramento). Somente aditiva: as tabelas
-- ml_artifacts/ml_experiments/ml_predictions da Forja 2.0 são preservadas.
-- Atenção: o runner divide por ponto e vírgula — não usar esse caractere em strings.
-- ============================================================

-- Um ritual por usuário e dia local. A recompensa é idempotente pelo ledger
-- (source_type 'tavern', source_id = dia), e o ritual só guarda o registro.
CREATE TABLE IF NOT EXISTS tavern_rituals (
  owner_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_key          TEXT NOT NULL,
  steps_json       TEXT NOT NULL DEFAULT '[]',
  highlights       TEXT,
  challenges       TEXT,
  decisions        TEXT,
  learned          TEXT,
  worked           TEXT,
  improve          TEXT,
  repeat_this      TEXT,
  avoid_tomorrow   TEXT,
  self_care        TEXT,
  priorities_json  TEXT NOT NULL DEFAULT '[]',
  tomorrow_task_id TEXT,
  snapshot_json    TEXT,
  completed_at     TEXT,
  reward_xp        INTEGER NOT NULL DEFAULT 0,
  reward_coins     INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, day_key)
);

CREATE TABLE IF NOT EXISTS tavern_settings (
  owner_id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  required_steps_json TEXT NOT NULL DEFAULT '["balance","reflection","tomorrow"]',
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Forja 3.0: configuração do modelo (problema, alvo, horizonte, variáveis, algoritmos, validação).
CREATE TABLE IF NOT EXISTS ml_models (
  id                TEXT PRIMARY KEY,
  owner_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_key      TEXT,
  name              TEXT NOT NULL,
  problem           TEXT NOT NULL CHECK (problem IN ('classification', 'regression')),
  target            TEXT NOT NULL,
  horizon_days      INTEGER NOT NULL DEFAULT 1 CHECK (horizon_days BETWEEN 1 AND 7),
  features_json     TEXT NOT NULL,
  algorithms_json   TEXT NOT NULL,
  validation_json   TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'aguardando_dados', 'treinando', 'validacao', 'experimental', 'aprovado', 'ativo', 'degradado', 'arquivado')),
  active_version_id TEXT,
  schedule          TEXT NOT NULL DEFAULT 'manual' CHECK (schedule IN ('manual', 'weekly', 'monthly')),
  last_trained_at   TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ml_models_owner ON ml_models(owner_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ml_models_template ON ml_models(owner_id, template_key);

-- Registro de versões: cada treino válido gera uma versão reprodutível.
CREATE TABLE IF NOT EXISTS ml_model_versions (
  id               TEXT PRIMARY KEY,
  owner_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model_id         TEXT NOT NULL REFERENCES ml_models(id) ON DELETE CASCADE,
  version          INTEGER NOT NULL,
  algorithm        TEXT NOT NULL,
  hyperparams_json TEXT NOT NULL,
  features_json    TEXT NOT NULL,
  metrics_json     TEXT NOT NULL,
  dataset_json     TEXT NOT NULL,
  pipeline_version TEXT NOT NULL,
  config_hash      TEXT NOT NULL,
  data_hash        TEXT NOT NULL,
  seed             INTEGER NOT NULL,
  model_json       TEXT NOT NULL,
  importance_json  TEXT NOT NULL,
  reference_json   TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'candidata' CHECK (status IN ('candidata', 'ativa', 'arquivada')),
  trained_at       TEXT NOT NULL DEFAULT (datetime('now')),
  duration_ms      INTEGER NOT NULL DEFAULT 0,
  UNIQUE (model_id, version)
);
CREATE INDEX IF NOT EXISTS idx_ml_versions_model ON ml_model_versions(owner_id, model_id, version);

-- Execuções (treino, arena, backtest, monitoramento). A chave de idempotência
-- impede repetir a mesma execução por gatilho automático.
CREATE TABLE IF NOT EXISTS ml_runs (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model_id        TEXT REFERENCES ml_models(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('train', 'backtest', 'inference', 'monitor', 'quality')),
  status          TEXT NOT NULL CHECK (status IN ('running', 'done', 'failed', 'cancelled', 'insufficient')),
  trigger         TEXT NOT NULL DEFAULT 'manual',
  config_json     TEXT,
  result_json     TEXT,
  log_json        TEXT,
  error           TEXT,
  idempotency_key TEXT,
  started_at      TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at     TEXT,
  duration_ms     INTEGER,
  archived        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ml_runs_owner ON ml_runs(owner_id, started_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ml_runs_idem ON ml_runs(owner_id, idempotency_key);

-- Previsões dos modelos 3.0 (uma por modelo e data-alvo). actual é preenchido
-- quando o resultado real do dia fica disponível (backtest/monitoramento).
CREATE TABLE IF NOT EXISTS ml_model_predictions (
  id               TEXT PRIMARY KEY,
  owner_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model_id         TEXT NOT NULL REFERENCES ml_models(id) ON DELETE CASCADE,
  version_id       TEXT NOT NULL,
  target_date      TEXT NOT NULL,
  value            REAL NOT NULL,
  lower            REAL,
  upper            REAL,
  partial          INTEGER NOT NULL DEFAULT 0,
  explanation_json TEXT NOT NULL,
  actual           REAL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (model_id, target_date)
);
CREATE INDEX IF NOT EXISTS idx_ml_model_predictions_owner ON ml_model_predictions(owner_id, target_date);

CREATE TABLE IF NOT EXISTS ml_monitor_snapshots (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model_id    TEXT NOT NULL REFERENCES ml_models(id) ON DELETE CASCADE,
  version_id  TEXT NOT NULL,
  drift_json  TEXT NOT NULL,
  perf_json   TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('ok', 'atencao', 'degradado', 'sem_dados')),
  checked_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ml_monitor_model ON ml_monitor_snapshots(owner_id, model_id, checked_at);

INSERT OR IGNORE INTO achievements (id, code, title, description, icon, threshold, metric, tier) VALUES
  ('ach_tavern_first',  'tavern_first',  'Primeira Rodada na Taverna',  'Concluiu o primeiro ritual de fim do dia.',            'Beer',     1,  'tavern_rituals_total',   'bronze'),
  ('ach_tavern_7',      'tavern_7',      'Frequentador da Taverna',     'Concluiu o ritual de fim do dia em 7 dias.',           'Beer',     7,  'tavern_rituals_total',   'silver'),
  ('ach_tavern_30',     'tavern_30',     'Lenda da Taverna',            'Concluiu o ritual de fim do dia em 30 dias.',          'Crown',    30, 'tavern_rituals_total',   'gold'),
  ('ach_forge_model_1', 'forge_model_1', 'Primeiro Modelo Válido',      'Treinou um modelo com validação temporal completa.',   'Sparkles', 1,  'forge_versions_total',   'bronze'),
  ('ach_forge_beat_1',  'forge_beat_1',  'Além da Linha de Base',       'Teve um modelo que superou a linha de base no teste.', 'Trophy',   1,  'forge_beat_baseline',    'silver'),
  ('ach_forge_models_5','forge_models_5','Arquiteto de Modelos',        'Configurou 5 modelos diferentes na Forja.',            'Wand2',    5,  'forge_models_total',     'gold');
