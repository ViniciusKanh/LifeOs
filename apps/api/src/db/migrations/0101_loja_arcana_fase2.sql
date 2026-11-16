-- ============================================================
-- 0101_loja_arcana_fase2
-- Loja Arcana (Fase 2): Correio da Guilda (entrega com atraso real,
-- calculado e cumprido só pelo servidor) e pagamento com Crédito do
-- Banco (reaproveita bank_loans/requestLoan — nenhuma carteira ou
-- lógica de crédito paralela: comprar "no crédito" é pedir um
-- empréstimo real no valor da compra e gastá-lo na hora).
--
-- A partir desta fase, o checkout NÃO entrega mais direto no
-- inventário: cria uma linha em shop_deliveries por item, com
-- `ready_at` já calculado no momento da compra (comum = imediato,
-- incomum = 1min, raro = 3min, épico = 5min, lendário = 10min,
-- mítico = 15min). A entrega real só acontece quando `ready_at` já
-- passou, verificado a cada leitura (mesmo padrão de `syncInventory`
-- já usado na Coleção) — nunca por temporizador no navegador.
-- ============================================================

ALTER TABLE shop_orders ADD COLUMN bank_loan_id TEXT REFERENCES bank_loans(id);

CREATE TABLE IF NOT EXISTS shop_deliveries (
  id           TEXT PRIMARY KEY,
  order_id     TEXT NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_key  TEXT NOT NULL,
  product_name TEXT NOT NULL,
  rarity       TEXT NOT NULL,
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  status       TEXT NOT NULL DEFAULT 'em_transito' CHECK (status IN ('em_transito', 'entregue')),
  ready_at     TEXT NOT NULL,
  delivered_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_shop_deliveries_owner ON shop_deliveries(owner_id, status, ready_at);
CREATE INDEX IF NOT EXISTS idx_shop_deliveries_order ON shop_deliveries(order_id);
