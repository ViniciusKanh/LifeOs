-- 0059_colecao_inventario
-- Coleção / Inventário. Definições de item ficam no catálogo central
-- (config/items.ts). Relíquias e títulos continuam vindo do Códex
-- (codex_unlocks) e cupons do Tesouro (reward_redemptions): aqui só
-- ficam as pilhas próprias, o ledger e os efeitos temporários.

-- Pilhas do usuário (consumíveis, ferramentas, materiais) e marcações
-- (favorito/arquivado) de qualquer item, inclusive os derivados.
CREATE TABLE IF NOT EXISTS user_inventory_items (
  id               TEXT PRIMARY KEY,
  owner_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_key         TEXT NOT NULL,
  quantity         INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  use_count        INTEGER NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  favorite         INTEGER NOT NULL DEFAULT 0,
  archived         INTEGER NOT NULL DEFAULT 0,
  acquired_at      TEXT,
  last_acquired_at TEXT,
  source_type      TEXT,
  source_id        TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, item_key)
);
CREATE INDEX IF NOT EXISTS idx_user_inventory_owner ON user_inventory_items(owner_id);

-- Ledger auditável. A UNIQUE torna cada concessão/uso idempotente
-- (mesma origem nunca concede duas vezes; mesmo requestId nunca consome duas vezes).
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_key     TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('acquire', 'use', 'equip', 'unequip', 'remove', 'adjustment')),
  quantity     INTEGER NOT NULL DEFAULT 0,
  source_type  TEXT NOT NULL,
  source_id    TEXT NOT NULL,
  label        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, item_key, type, source_type, source_id)
);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_owner ON inventory_transactions(owner_id, created_at);

-- Efeitos temporários de gamificação (nunca métricas reais).
CREATE TABLE IF NOT EXISTS active_item_effects (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_key        TEXT NOT NULL,
  effect_type     TEXT NOT NULL,
  value           INTEGER NOT NULL,
  started_at      TEXT NOT NULL,
  expires_at      TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'consumed', 'expired', 'canceled')),
  use_tx_id       TEXT,
  consumed_source TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_active_item_effects_owner ON active_item_effects(owner_id, effect_type, status);
