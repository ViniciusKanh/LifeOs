-- ============================================================
-- 0009_gamification_analytics
-- Milestones/badges, snapshots do Life Score e de analytics,
-- e o log de interações com a IA (Gemini) — nunca com dados
-- inventados, sempre referenciando o que foi de fato calculado.
-- ============================================================

CREATE TABLE IF NOT EXISTS achievements (
  id           TEXT PRIMARY KEY,
  code         TEXT NOT NULL UNIQUE,   -- ex: 'pages_1000', 'streak_30'
  title        TEXT NOT NULL,
  description  TEXT,
  icon         TEXT,
  threshold    REAL,
  metric       TEXT                     -- ex: 'pages_read_total', 'consistency_days'
);

CREATE TABLE IF NOT EXISTS user_achievements (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  unlocked_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, achievement_id)
);

-- Life Score é sempre recalculado a partir dos dados reais; esta
-- tabela guarda o snapshot diário para permitir histórico/gráfico
-- sem precisar reprocessar tudo a cada consulta.
CREATE TABLE IF NOT EXISTS life_scores (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score_date      TEXT NOT NULL,       -- YYYY-MM-DD
  overall_score   INTEGER NOT NULL,
  productivity    INTEGER,
  health          INTEGER,
  education       INTEGER,
  reading         INTEGER,
  habits          INTEGER,
  professional    INTEGER,
  goals           INTEGER,
  weights_used    TEXT,                -- JSON com os pesos vigentes no cálculo
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, score_date)
);

CREATE INDEX IF NOT EXISTS idx_life_scores_owner ON life_scores(owner_id, score_date);

-- Snapshots de analytics por período (para os filtros de 7/30/90
-- dias sem recalcular tudo em tempo real a cada requisição).
CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period        TEXT NOT NULL CHECK (period IN ('day', 'week', 'month', 'quarter', 'year')),
  period_start  TEXT NOT NULL,
  metrics       TEXT NOT NULL,        -- JSON com o conjunto de métricas do período
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, period, period_start)
);

-- Log de cada chamada à IA — guarda o prompt resumido, a
-- classificação da resposta (dado real / inferência / sugestão)
-- e não o conteúdo sensível bruto quando evitável.
CREATE TABLE IF NOT EXISTS ai_interactions (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature       TEXT NOT NULL
                  CHECK (feature IN ('planning', 'analysis', 'weekly_review', 'education', 'books')),
  prompt_summary TEXT,
  response_summary TEXT,
  used_real_data INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_interactions_owner ON ai_interactions(owner_id, created_at);
