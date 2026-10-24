-- 0077_banco_credito
-- Banco, parte 2: credito (emprestimo) com juros e multa por atraso, para
-- completar a simulacao de um banco de verdade (investimento ja existia
-- desde a 0075/0076). So uma moeda do jogo -- nunca dinheiro real.
--
-- O score de credito (bankService.getCreditScore) e SEMPRE calculado a
-- partir do historico real de bank_loans/bank_deposits, nunca armazenado
-- aqui -- segue a mesma regra de Analytics do projeto (derivar de fontes
-- originais, nunca manter copia redundante de uma metrica).
--
-- juros/prazo/multa ficam CONGELADOS no momento em que o emprestimo e
-- pedido (mesmo principio de rate_bps/payout em bank_deposits): mudar a
-- tabela de credito depois nunca afeta um emprestimo ja em curso.

CREATE TABLE IF NOT EXISTS bank_loans (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount         INTEGER NOT NULL CHECK (amount > 0),
  rate_bps       INTEGER NOT NULL CHECK (rate_bps >= 0),
  term_days      INTEGER NOT NULL CHECK (term_days > 0),
  total_due      INTEGER NOT NULL CHECK (total_due >= amount),
  late_fee_bps   INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'repaid')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  due_at         TEXT NOT NULL,
  repaid_at      TEXT,
  repaid_amount  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_bank_loans_owner ON bank_loans(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_bank_loans_owner_due ON bank_loans(owner_id, due_at);
