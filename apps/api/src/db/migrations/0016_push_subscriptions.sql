-- ============================================================
-- 0016_push_subscriptions
-- Inscrições de push (Web Push/VAPID) de cada usuário, por
-- dispositivo/navegador. Um mesmo usuário pode ter várias (celular,
-- notebook...) — todas recebem o push quando um evento acionável
-- acontece (conquista desbloqueada, insight diário do Copilot).
-- ============================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_owner ON push_subscriptions(owner_id);
