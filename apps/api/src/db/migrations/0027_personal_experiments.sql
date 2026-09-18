-- ============================================================
-- 0027_personal_experiments
-- Experimentos Pessoais: o usuário testa uma pequena mudança de
-- rotina por um período definido e o LifeOS compara os dados que
-- JÁ existem (sono, água, foco, exercício, leitura, estudo, hábitos)
-- antes x durante, em vez de duplicar esses registros em uma tabela
-- própria. Ver experimentMetricsService.ts para o catálogo de
-- métricas e de onde cada uma vem.
-- ============================================================

CREATE TABLE IF NOT EXISTS personal_experiments (
  id                        TEXT PRIMARY KEY,
  owner_id                  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title                     TEXT NOT NULL,
  description               TEXT,
  category                  TEXT NOT NULL DEFAULT 'personalizado'
                              CHECK (category IN ('saude', 'sono', 'exercicio', 'hidratacao', 'produtividade', 'focus', 'educacao', 'leitura', 'habitos', 'bem_estar', 'personalizado')),
  hypothesis                TEXT,
  motivation                TEXT,
  status                    TEXT NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'active', 'paused', 'completed', 'cancelled')),
  start_date                TEXT NOT NULL,   -- YYYY-MM-DD
  end_date                  TEXT NOT NULL,   -- YYYY-MM-DD
  primary_metric            TEXT NOT NULL,   -- chave do catálogo em experimentMetricsService.ts
  secondary_metrics_json    TEXT,            -- JSON array de chaves de métrica
  linked_habit_id           TEXT REFERENCES habits(id) ON DELETE SET NULL, -- quando o comportamento reaproveita um hábito existente (seção 45)
  verification_type         TEXT NOT NULL DEFAULT 'manual' CHECK (verification_type IN ('automatic', 'manual')),
  verification_rule         TEXT,            -- chave da regra em experimentVerificationService.ts (quando automático)
  verification_config_json  TEXT,            -- JSON com os parâmetros da regra (ex.: {"beforeTime":"23:00"})
  success_criteria_type     TEXT NOT NULL DEFAULT 'none' CHECK (success_criteria_type IN ('consistency', 'metric_change', 'none')),
  success_criteria_value    REAL,
  personal_conclusion       TEXT,
  worth_continuing          TEXT CHECK (worth_continuing IN ('yes', 'maybe', 'no')),
  perceived_result          TEXT CHECK (perceived_result IN ('improved', 'no_change', 'worsened')),
  created_at                TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_personal_experiments_owner ON personal_experiments(owner_id, status);

-- Um registro por dia por experimento: guarda o check-in manual (quando
-- a verificação não é automática) e/ou a observação pessoal daquele
-- dia. Nunca duplica dado de Saúde/Foco/Hábitos/Biblioteca — isso
-- continua vindo das tabelas originais via experimentMetricsService.
CREATE TABLE IF NOT EXISTS personal_experiment_logs (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  experiment_id   TEXT NOT NULL REFERENCES personal_experiments(id) ON DELETE CASCADE,
  log_date        TEXT NOT NULL,  -- YYYY-MM-DD
  checkin_status  TEXT CHECK (checkin_status IN ('done', 'missed')),
  perception      TEXT CHECK (perception IN ('muito_ruim', 'ruim', 'neutro', 'bom', 'muito_bom')),
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (experiment_id, log_date)
);

CREATE INDEX IF NOT EXISTS idx_personal_experiment_logs_experiment ON personal_experiment_logs(experiment_id, log_date);
CREATE INDEX IF NOT EXISTS idx_personal_experiment_logs_owner ON personal_experiment_logs(owner_id);
