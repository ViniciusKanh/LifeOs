-- ============================================================
-- 0053_gamificacao
-- Motor de gamificação real: XP (ledger imutável e idempotente),
-- moedas (ledger gastável separado), loja de recompensas e resgates.
-- Nível NUNCA é armazenado: é derivado do XP total por uma função
-- central (gamificationService.levelForXp). Tudo aditivo.
-- ============================================================

-- Cada evento que gera XP tem uma origem única (owner, tipo de origem,
-- id da origem, tipo de evento). O UNIQUE é a trava anti-exploit:
-- desfazer/refazer, reabrir/concluir ou alternar check-in nunca gera
-- XP duas vezes para a mesma origem. XP nunca é removido.
CREATE TABLE IF NOT EXISTS xp_events (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type  TEXT NOT NULL,
  source_id    TEXT NOT NULL,
  event_type   TEXT NOT NULL,
  xp           INTEGER NOT NULL CHECK (xp >= 0),
  project_id   TEXT,
  label        TEXT,
  day_key      TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, source_type, source_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_xp_events_owner_date ON xp_events(owner_id, created_at);
CREATE INDEX IF NOT EXISTS idx_xp_events_owner_day ON xp_events(owner_id, day_key);
CREATE INDEX IF NOT EXISTS idx_xp_events_owner_project ON xp_events(owner_id, project_id);

-- Ledger de moedas: créditos positivos (ganhos, com a mesma chave de
-- origem do XP) e débitos negativos (resgates). Saldo = SUM(amount).
CREATE TABLE IF NOT EXISTS coin_ledger (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount       INTEGER NOT NULL,
  source_type  TEXT NOT NULL,
  source_id    TEXT NOT NULL,
  event_type   TEXT NOT NULL,
  label        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, source_type, source_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_coin_ledger_owner ON coin_ledger(owner_id, created_at);

-- Recompensas definidas pelo próprio usuário (ex.: "Episódio de série").
CREATE TABLE IF NOT EXISTS rewards (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  icon            TEXT,
  category        TEXT NOT NULL DEFAULT 'lazer',
  cost            INTEGER NOT NULL CHECK (cost > 0),
  redemption_limit INTEGER CHECK (redemption_limit IS NULL OR redemption_limit > 0),
  cooldown_hours  INTEGER NOT NULL DEFAULT 0 CHECK (cooldown_hours >= 0),
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rewards_owner ON rewards(owner_id, is_active);

CREATE TABLE IF NOT EXISTS reward_redemptions (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_id    TEXT NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
  reward_name  TEXT NOT NULL,
  cost         INTEGER NOT NULL,
  redeemed_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reward_redemptions_owner ON reward_redemptions(owner_id, redeemed_at);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_reward ON reward_redemptions(reward_id, redeemed_at);
