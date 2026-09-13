-- ============================================================
-- 0015_daily_insights
-- Cache do insight do dia do LifeOS Copilot — permite o Dashboard
-- mostrar um insight já pronto ao abrir o app (Copilot proativo) em
-- vez de depender do usuário clicar em "gerar insight" toda vez.
-- Um por usuário por dia; regenerar manualmente sobrescreve o mesmo dia.
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_insights (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  insight_date TEXT NOT NULL,   -- YYYY-MM-DD
  text         TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, insight_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_insights_owner ON daily_insights(owner_id, insight_date);
