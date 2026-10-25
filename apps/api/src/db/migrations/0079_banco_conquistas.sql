-- ============================================================
-- 0079_banco_conquistas
-- Integra o Banco ao sistema de Conquistas (catálogo genérico já
-- existente, sem mudança de schema em `achievements`). Duas métricas
-- vêm direto de bank_deposits/bank_loans (nunca duplicadas); a
-- terceira (score de crédito) é sempre DERIVADA no momento da
-- consulta (getCreditScore, nunca armazenada) e por isso não tem um
-- "pico histórico" reconstruível a partir do estado atual — exige um
-- snapshot, no mesmo padrão já usado por life_scores (0009): grava o
-- valor só quando o usuário de fato vê a tela do Banco, como o
-- comentário de life-score.ts já assume para o próprio Life Score.
-- ============================================================

CREATE TABLE IF NOT EXISTS bank_credit_score_history (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_key    TEXT NOT NULL,      -- YYYY-MM-DD (dia local do usuário)
  score      INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, day_key)
);

CREATE INDEX IF NOT EXISTS idx_bank_credit_score_history_owner ON bank_credit_score_history(owner_id, score);

INSERT OR IGNORE INTO achievements (id, code, title, description, icon, threshold, metric, tier) VALUES
  ('ach_bank_deposits_3',   'bank_deposits_3',   'Primeiro Investidor',    'Resgatou 3 investimentos no Banco.',                                   'PiggyBank',  3,   'bank_deposits_claimed', 'bronze'),
  ('ach_bank_deposits_15',  'bank_deposits_15',  'Investidor Frequente',   'Resgatou 15 investimentos no Banco.',                                  'PiggyBank',  15,  'bank_deposits_claimed', 'silver'),
  ('ach_bank_deposits_50',  'bank_deposits_50',  'Magnata do Cofre',       'Resgatou 50 investimentos no Banco.',                                  'PiggyBank',  50,  'bank_deposits_claimed', 'gold'),
  ('ach_bank_loans_3',      'bank_loans_3',      'Bom Pagador',            'Quitou 3 empréstimos em dia no Banco.',                                'HandCoins',  3,   'bank_loans_repaid_on_time', 'bronze'),
  ('ach_bank_loans_15',     'bank_loans_15',     'Crédito Impecável',      'Quitou 15 empréstimos em dia no Banco.',                               'HandCoins',  15,  'bank_loans_repaid_on_time', 'silver'),
  ('ach_bank_loans_50',     'bank_loans_50',     'Confiança da Guilda',    'Quitou 50 empréstimos em dia no Banco.',                               'HandCoins',  50,  'bank_loans_repaid_on_time', 'gold'),
  ('ach_bank_score_650',    'bank_score_650',    'Score em Ascensão',      'Atingiu um score de crédito de 650 ou mais no Banco.',                 'ShieldCheck', 650, 'bank_credit_score_peak', 'bronze'),
  ('ach_bank_score_750',    'bank_score_750',    'Crédito Sólido',         'Atingiu um score de crédito de 750 ou mais no Banco.',                 'ShieldCheck', 750, 'bank_credit_score_peak', 'silver'),
  ('ach_bank_score_850',    'bank_score_850',    'Score Máximo',           'Atingiu o score de crédito máximo (850) no Banco.',                    'ShieldCheck', 850, 'bank_credit_score_peak', 'gold');
