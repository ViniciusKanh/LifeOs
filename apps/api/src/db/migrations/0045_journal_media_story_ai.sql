-- ============================================================
-- 0045_journal_media_story_ai
-- Diário: cada mídia (foto, vídeo, PDF, áudio) ganha a sua própria
-- "história" (texto livre do usuário), nome/tipo do arquivo e uma
-- categoria sugerida pela IA. A entrada do dia guarda a organização
-- por temas gerada pelo Gemini — só depois que o usuário confirma
-- ("Salvar organização"), nunca automaticamente.
-- ============================================================

ALTER TABLE journal_entry_media ADD COLUMN story TEXT;
ALTER TABLE journal_entry_media ADD COLUMN file_name TEXT;
ALTER TABLE journal_entry_media ADD COLUMN mime_type TEXT;
ALTER TABLE journal_entry_media ADD COLUMN ai_category TEXT;

ALTER TABLE journal_entries ADD COLUMN ai_title TEXT;
ALTER TABLE journal_entries ADD COLUMN ai_summary TEXT;
ALTER TABLE journal_entries ADD COLUMN ai_categories TEXT;
ALTER TABLE journal_entries ADD COLUMN ai_organized_at TEXT;
