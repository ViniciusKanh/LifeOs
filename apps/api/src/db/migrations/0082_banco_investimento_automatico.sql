-- 0082_banco_investimento_automatico
-- Regra opcional por usuário: investir automaticamente um % de toda moeda
-- ganha em missões/contratos/hábitos/etc. (qualquer crédito que passe pelo
-- "cofre" central de XP, gamificationService.award -- nunca o que já vem do
-- próprio Banco, que credita moedas direto sem passar por award()). Uma
-- linha por usuário (upsert); desligada por padrão.

CREATE TABLE IF NOT EXISTS bank_auto_invest_rules (
  owner_id   TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled    INTEGER NOT NULL DEFAULT 0,
  pct_bps    INTEGER NOT NULL DEFAULT 1000 CHECK (pct_bps > 0 AND pct_bps <= 5000),
  plan_id    TEXT NOT NULL DEFAULT 'cofre-aventureiro',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
