-- ============================================================
-- 0039_journal_pin
-- Fase 12 do Diário (Apple Journal): bloqueio de privacidade. PIN
-- opcional, exclusivo do Diário, com hash bcrypt (nunca texto puro)
-- guardado em user_settings — mesma tabela 1:1 por usuário já usada
-- para outras preferências.
-- ============================================================

ALTER TABLE user_settings ADD COLUMN journal_pin_hash TEXT;
