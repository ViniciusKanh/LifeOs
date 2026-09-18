-- ============================================================
-- 0030_data_health_snapshots
-- Data Health: snapshot periódico do score geral e das dimensões
-- (completude, consistência, integridade, atualização, sincronização,
-- histórico) — usado só para o gráfico de evolução. Nunca guarda
-- cópia dos dados de origem, só os números já calculados.
-- ============================================================

CREATE TABLE IF NOT EXISTS data_health_snapshots (
  id                  TEXT PRIMARY KEY,
  owner_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score               INTEGER NOT NULL,
  completeness_score  INTEGER NOT NULL,
  consistency_score   INTEGER NOT NULL,
  integrity_score     INTEGER NOT NULL,
  freshness_score     INTEGER NOT NULL,
  sync_score          INTEGER NOT NULL,
  history_score       INTEGER NOT NULL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_data_health_snapshots_owner ON data_health_snapshots(owner_id, created_at);
