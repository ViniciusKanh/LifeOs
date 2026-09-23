-- ============================================================
-- 0032_notification_dismissals
-- "Vi essa notificação" — o sino de notificações mostrava alertas
-- calculados na hora (tarefa atrasada, hábito pendente, etc.) que
-- nunca somem, mesmo depois de abertos, porque são recalculados a
-- cada consulta a partir do estado real. Esta tabela guarda quais
-- notificações o usuário já viu (abriu o sino), pra GET /notifications/live
-- parar de devolvê-las até que a condição gere uma notificação nova
-- (id diferente — ex.: dia seguinte, hábito diferente).
-- ============================================================

CREATE TABLE IF NOT EXISTS notification_dismissals (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_id TEXT NOT NULL,
  dismissed_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, notification_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_dismissals_owner ON notification_dismissals(owner_id);
