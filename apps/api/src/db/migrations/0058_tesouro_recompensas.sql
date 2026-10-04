-- 0058_tesouro_recompensas
-- Tesouro & Recompensas: evolução ADITIVA da Loja (0053). Nada é recriado;
-- recompensas, resgates e o ledger de moedas existentes são preservados.

-- Recompensa: raridade (só visual/exclusividade), moeda de resgate,
-- requisitos reais de desbloqueio, limite por período, arte e favoritos.
ALTER TABLE rewards ADD COLUMN rarity TEXT NOT NULL DEFAULT 'comum' CHECK (rarity IN ('comum', 'incomum', 'raro', 'epico', 'lendario'));
ALTER TABLE rewards ADD COLUMN currency TEXT NOT NULL DEFAULT 'coin' CHECK (currency IN ('coin', 'gem'));
ALTER TABLE rewards ADD COLUMN required_level INTEGER CHECK (required_level IS NULL OR required_level >= 1);
ALTER TABLE rewards ADD COLUMN required_xp INTEGER CHECK (required_xp IS NULL OR required_xp >= 0);
ALTER TABLE rewards ADD COLUMN required_achievement_id TEXT;
ALTER TABLE rewards ADD COLUMN limit_period TEXT NOT NULL DEFAULT 'none' CHECK (limit_period IN ('none', 'day', 'week', 'month'));
ALTER TABLE rewards ADD COLUMN tags TEXT;
ALTER TABLE rewards ADD COLUMN art TEXT;
ALTER TABLE rewards ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rewards ADD COLUMN is_ai_generated INTEGER NOT NULL DEFAULT 0;

-- Resgate vira item de inventário: disponível → usado (ou cancelado com estorno).
ALTER TABLE reward_redemptions ADD COLUMN status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'used', 'canceled', 'expired'));
ALTER TABLE reward_redemptions ADD COLUMN used_at TEXT;
ALTER TABLE reward_redemptions ADD COLUMN canceled_at TEXT;
ALTER TABLE reward_redemptions ADD COLUMN currency TEXT NOT NULL DEFAULT 'coin';
-- Chave de idempotência gerada pelo cliente: clique duplo/refresh não gasta duas vezes.
ALTER TABLE reward_redemptions ADD COLUMN request_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_reward_redemptions_request ON reward_redemptions(owner_id, request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_status ON reward_redemptions(owner_id, status);

-- Resgates anteriores ao inventário já foram aproveitados: entram como "usados"
-- (sem isso, todo o histórico antigo apareceria como itens a usar).
UPDATE reward_redemptions SET status = 'used', used_at = redeemed_at WHERE used_at IS NULL AND request_id IS NULL AND status = 'available';

-- Gemas: moeda rara, auditável, creditada só por marcos especiais
-- (nível, campanha concluída, conquista ouro/platina). Mesma ideia do coin_ledger.
CREATE TABLE IF NOT EXISTS gem_ledger (
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
CREATE INDEX IF NOT EXISTS idx_gem_ledger_owner ON gem_ledger(owner_id, created_at);
