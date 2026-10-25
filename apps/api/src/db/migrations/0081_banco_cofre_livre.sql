-- 0081_banco_cofre_livre
-- Suporte ao Cofre Livre: 4º plano de investimento, sem prazo fixo (config/bank.ts,
-- campo earlyWithdrawalPenalty: false) -- resgate a qualquer momento paga o bônus
-- PRORATADO pelo tempo decorrido (nunca zero, nunca penalidade), ao contrário dos
-- planos de prazo fixo (resgate antecipado perde o bônus inteiro, migration 0080).
--
-- actual_tax guarda o imposto DE FATO cobrado no resgate (pode divergir de
-- payout-net_payout quando o resgate foi antecipado e proporcional) -- mesmo
-- princípio de actual_payout na 0080. Resgates de antes desta migration sempre
-- cobraram o imposto cheio (resgate proporcional não existia), backfill exato.

ALTER TABLE bank_deposits ADD COLUMN actual_tax INTEGER;

UPDATE bank_deposits SET actual_tax = payout - net_payout WHERE status = 'claimed' AND actual_tax IS NULL;
