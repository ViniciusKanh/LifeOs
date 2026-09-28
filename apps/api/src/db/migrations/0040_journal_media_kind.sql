-- ============================================================
-- 0040_journal_media_kind
-- Fase 13 do Diário (Apple Journal): notas de voz. journal_entry_media
-- passa a guardar tanto fotos quanto áudios no mesmo registro do dia —
-- "kind" distingue o tipo e "duration_seconds" só se aplica a áudio.
-- Aditiva: linhas existentes (todas fotos) recebem kind='photo' por
-- default, sem precisar de backfill manual.
-- ============================================================

ALTER TABLE journal_entry_media ADD COLUMN kind TEXT NOT NULL DEFAULT 'photo';
ALTER TABLE journal_entry_media ADD COLUMN duration_seconds INTEGER;
