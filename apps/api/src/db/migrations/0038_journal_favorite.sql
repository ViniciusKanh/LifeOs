-- ============================================================
-- 0038_journal_favorite
-- Fase 6 do Diário (Apple Journal): favoritos. Marca dias que o
-- usuário quer encontrar rápido depois, sem duplicar a entrada em
-- lugar nenhum — é só uma flag na própria linha do dia.
-- ============================================================

ALTER TABLE journal_entries ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_journal_entries_favorite ON journal_entries(owner_id, is_favorite);
