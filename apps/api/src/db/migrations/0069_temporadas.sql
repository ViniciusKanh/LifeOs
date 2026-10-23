-- 0069_temporadas
-- Temporadas mensais. XP da temporada é derivado de xp_events (nunca copiado);
-- as recompensas cosméticas entram no ledger do inventário existente
-- (inventory_transactions, item_key 'season:<YYYY-MM>:t<tier>').
-- Aqui fica só o resumo de fechamento (lazy e idempotente), que alimenta a Timeline.
CREATE TABLE IF NOT EXISTS season_summaries (
  id                TEXT PRIMARY KEY,
  owner_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season_key        TEXT NOT NULL,          -- YYYY-MM no fuso do usuário
  name              TEXT NOT NULL,
  xp                INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  tier              INTEGER NOT NULL DEFAULT 0 CHECK (tier >= 0),
  quests_completed  INTEGER NOT NULL DEFAULT 0 CHECK (quests_completed >= 0),
  closed_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, season_key)
);
CREATE INDEX IF NOT EXISTS idx_season_summaries_owner ON season_summaries(owner_id, closed_at);
