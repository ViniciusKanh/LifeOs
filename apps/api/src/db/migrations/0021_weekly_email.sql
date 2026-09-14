-- ============================================================
-- 0021_weekly_email
-- Resumo semanal por e-mail: preferência por usuário (opt-in,
-- desligado por padrão) + log de envios pra nunca mandar o mesmo
-- resumo duas vezes pro mesmo usuário/semana (idempotência do cron).
-- ============================================================

ALTER TABLE user_settings ADD COLUMN weekly_email_enabled INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS weekly_email_log (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start_date TEXT NOT NULL,
  sent_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, week_start_date)
);
