-- ============================================================
-- 0103_diario_banco_limpeza (só aditiva)
--
-- 1) Diário: cópia de segurança silenciosa do texto do dia. Sempre que um
--    salvamento encolheria muito o texto (mais da metade), a versão anterior
--    é guardada aqui antes. Não há tela de "versões" — é só uma rede de
--    proteção para recuperar conteúdo em caso de falha.
-- 2) Banco: limite de crédito definido pelo próprio usuário (NULL = usa o
--    limite derivado do score, como antes).
-- ============================================================

CREATE TABLE IF NOT EXISTS journal_thoughts_backup (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_date  TEXT NOT NULL,
  thoughts    TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_journal_thoughts_backup_owner ON journal_thoughts_backup(owner_id, entry_date, created_at);

ALTER TABLE user_settings ADD COLUMN bank_credit_limit INTEGER CHECK (bank_credit_limit IS NULL OR bank_credit_limit >= 0);
