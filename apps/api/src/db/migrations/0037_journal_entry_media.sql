-- ============================================================
-- 0037_journal_entry_media
-- Fase 4 do Diário (Apple Journal): fotos por dia. Uma entrada
-- (journal_entries) pode ter várias fotos — igual ao "diário" real,
-- que mistura texto e memórias visuais no mesmo registro do dia.
-- Guardadas como data URI (mesmo padrão já usado pra avatar em
-- users.avatar_url), comprimidas no cliente antes do upload — sem
-- depender de um serviço de storage externo.
-- ============================================================

CREATE TABLE IF NOT EXISTS journal_entry_media (
  id          TEXT PRIMARY KEY,
  entry_id    TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data_uri    TEXT NOT NULL,
  caption     TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_journal_entry_media_entry ON journal_entry_media(entry_id, sort_order);
