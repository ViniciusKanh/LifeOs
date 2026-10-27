-- ============================================================
-- 0085_in_app_notifications
-- Conteúdo real do sino de notificações (o "sino saiu do app" em
-- 08/10 — ver changelog-2026-10-08-remocao-telas-enxugar-dashboard —
-- mas a infraestrutura de dedupe (notification_delivery_log, já com
-- o canal 'in_app' previsto desde a migration 0024) e de "marcar como
-- lido" (notification_dismissals, migration 0032) continuaram no
-- lugar). Esta tabela guarda o título/corpo/link exibível de cada
-- disparo (o delivery_log só tem event_type+source_id, sem conteúdo);
-- "lido" é reaproveitado de notification_dismissals, usando o id
-- desta tabela como notification_id.
-- ============================================================

CREATE TABLE IF NOT EXISTS in_app_notifications (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT,
  url         TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_owner ON in_app_notifications(owner_id, created_at DESC);
