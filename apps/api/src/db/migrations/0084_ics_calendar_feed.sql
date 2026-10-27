-- ============================================================
-- 0084_ics_calendar_feed
-- Assinatura de calendário externo (.ics) somente leitura: cada
-- usuário tem um token próprio (URL secreta, no padrão das "secret
-- address" do Google Calendar) que autentica o feed sem precisar de
-- login — quem consome é o próprio Google/Apple/Outlook Calendar, não
-- o navegador do usuário. Guardamos o token em claro (não é senha; é
-- uma capability revogável a qualquer momento pelo próprio usuário)
-- para poder reexibi-lo na tela sem obrigar a regenerar toda vez.
-- Índice único parcial (só quando não nulo) — mesmo padrão de
-- users.google_id na migration 0033 — não exige recriar a tabela.
-- ============================================================

ALTER TABLE users ADD COLUMN ics_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_ics_token ON users(ics_token) WHERE ics_token IS NOT NULL;
