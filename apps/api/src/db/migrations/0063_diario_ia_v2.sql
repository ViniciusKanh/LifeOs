-- 0063_diario_ia_v2
-- Organização do Diário por IA, versão 2: momentos marcantes e reflexão da
-- gratidão confirmados pelo usuário. Aditivo; o texto original nunca muda.
ALTER TABLE journal_entries ADD COLUMN ai_highlights TEXT;
ALTER TABLE journal_entries ADD COLUMN ai_gratitude TEXT;
