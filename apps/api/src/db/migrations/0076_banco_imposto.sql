-- 0076_banco_imposto
-- Imposto sobre o rendimento dos investimentos do Banco, igual a um banco de
-- verdade (tabela regressiva: quanto mais curto o prazo, maior a aliquota).
-- O imposto incide so sobre o ganho (payout - amount), nunca sobre o
-- principal. tax_bps e net_payout ficam CONGELADOS no momento do deposito
-- (mesmo principio de rate_bps/payout na migration 0075): mudar a aliquota
-- no config/bank.ts nunca afeta quem ja investiu.
--
-- Depositos que ja existiam antes desta migration nao tinham imposto
-- (regra vigente na epoca), entao ficam com tax_bps = 0 e net_payout =
-- payout -- nunca alteramos retroativamente um investimento ja feito.

ALTER TABLE bank_deposits ADD COLUMN tax_bps INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bank_deposits ADD COLUMN net_payout INTEGER;

UPDATE bank_deposits SET net_payout = payout WHERE net_payout IS NULL;
