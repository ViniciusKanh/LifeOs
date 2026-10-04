-- ============================================================
-- 0056_codex_jornada
-- Códex da Jornada. Atributos NÃO têm tabela: são derivados do ledger
-- de XP (xp_events) por regra central (config/codex.ts). Aqui ficam só:
-- descobertas (padrões reais com evidência) e desbloqueios cosméticos
-- (relíquias, títulos e conhecimentos), cada um gravado uma única vez.
-- ============================================================

CREATE TABLE IF NOT EXISTS codex_discoveries (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key            TEXT NOT NULL,           -- regra que detectou o padrão (estável)
  title          TEXT NOT NULL,
  description    TEXT NOT NULL,
  category       TEXT NOT NULL,
  source_type    TEXT NOT NULL,           -- signals, focus, experiment, habit...
  source_id      TEXT,
  evidence_json  TEXT NOT NULL,           -- período, amostra, números que sustentam o padrão
  confidence     TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dismissed')),
  discovered_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  seen_at        TEXT,
  UNIQUE (owner_id, key)
);
CREATE INDEX IF NOT EXISTS idx_codex_discoveries_owner ON codex_discoveries(owner_id, discovered_at);

CREATE TABLE IF NOT EXISTS codex_unlocks (
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('relic', 'title', 'knowledge')),
  item_id      TEXT NOT NULL,             -- id do catálogo central
  source_type  TEXT,                      -- 'rule' (condição atingida) ou 'coins' (compra)
  unlocked_at  TEXT NOT NULL DEFAULT (datetime('now')),
  seen_at      TEXT,
  PRIMARY KEY (owner_id, kind, item_id)
);
CREATE INDEX IF NOT EXISTS idx_codex_unlocks_owner ON codex_unlocks(owner_id, unlocked_at);
