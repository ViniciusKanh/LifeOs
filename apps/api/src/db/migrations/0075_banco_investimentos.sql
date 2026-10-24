-- 0075_banco_investimentos
-- Banco: investir as moedas (coin_ledger) ganhas nas missoes em "contratos
-- de investimento" com prazo e bonus fixos. Moeda do jogo, nunca dinheiro
-- real (ver REGRA DE NEGOCIO do LifeOS: "handles personal finances em outro
-- app"). Plano/taxa/prazo ficam em config/bank.ts (mesmo padrao de
-- config/gamification.ts e config/treasure.ts); aqui so o deposito do
-- usuario, com taxa/prazo/retorno CONGELADOS no momento do deposito para que
-- uma mudanca futura no config nunca altere um investimento ja em curso.

CREATE TABLE IF NOT EXISTS bank_deposits (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id      TEXT NOT NULL,
  plan_label   TEXT NOT NULL,
  amount       INTEGER NOT NULL CHECK (amount > 0),
  rate_bps     INTEGER NOT NULL CHECK (rate_bps >= 0),
  term_days    INTEGER NOT NULL CHECK (term_days > 0),
  payout       INTEGER NOT NULL CHECK (payout >= amount),
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'claimed')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  matures_at   TEXT NOT NULL,
  claimed_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_bank_deposits_owner ON bank_deposits(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_bank_deposits_owner_matures ON bank_deposits(owner_id, matures_at);
