-- ============================================================
-- 0083_banco_cofrinho_personalizado
-- Apelido, emoji e vínculo opcional com uma Meta (goals) por depósito --
-- transforma um "cofre" genérico num cofrinho com propósito, sem mexer
-- em nenhum cálculo existente (campos só de apresentação/integração,
-- todos opcionais e sem backfill).
-- ============================================================

ALTER TABLE bank_deposits ADD COLUMN label TEXT;
ALTER TABLE bank_deposits ADD COLUMN icon TEXT;
ALTER TABLE bank_deposits ADD COLUMN goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bank_deposits_goal ON bank_deposits(goal_id);
