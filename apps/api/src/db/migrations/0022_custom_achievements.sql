-- ============================================================
-- 0022_custom_achievements
-- Troféus customizados: o usuário cadastra o próprio desafio (ex.:
-- "concluir 5 tarefas no dia") escolhendo uma métrica de uma lista
-- fixa e um limite — nunca texto livre de fórmula. Diferente do
-- catálogo fixo em `achievements` (semeado via migration), aqui cada
-- linha já pertence a um usuário e guarda o próprio `unlocked_at`.
-- ============================================================

CREATE TABLE IF NOT EXISTS custom_achievements (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  icon        TEXT NOT NULL DEFAULT '🏆',
  metric      TEXT NOT NULL,
  threshold   INTEGER NOT NULL,
  unlocked_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_custom_achievements_owner ON custom_achievements(owner_id, created_at);
