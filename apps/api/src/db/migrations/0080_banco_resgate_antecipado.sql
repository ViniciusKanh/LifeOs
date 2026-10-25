-- 0080_banco_resgate_antecipado
-- Resgate ANTECIPADO de investimento: quebra o prazo fixo antes do
-- vencimento. Devolve só o principal (sem bônus, sem imposto a cobrar —
-- não houve ganho a tributar), igual a sair antes do prazo de um CDB de
-- verdade. Nunca confisca o principal do jogador; mantém o incentivo real
-- de esperar o prazo (quem aguarda ganha o bônus líquido inteiro, quem
-- resgata antes não ganha nada, mas também não perde nada do que investiu).
--
-- actual_payout registra o que o jogador de fato recebeu no resgate (pode
-- divergir de net_payout quando é antecipado); early_withdrawn marca que
-- este resgate específico foi uma quebra de prazo. Depósitos já resgatados
-- antes desta migration sempre receberam o net_payout cheio (resgate
-- antecipado não existia ainda), então o backfill abaixo é exato.

ALTER TABLE bank_deposits ADD COLUMN early_withdrawn INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bank_deposits ADD COLUMN actual_payout INTEGER;

UPDATE bank_deposits SET actual_payout = net_payout WHERE status = 'claimed' AND actual_payout IS NULL;
