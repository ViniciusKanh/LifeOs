-- ============================================================
-- 0020_work_notes
-- Área Profissional: registro cronológico de reuniões 1:1 e
-- anotações recorrentes de trabalho — não é um agendador (isso já
-- existe em Calendário), é só um log rápido do que foi conversado/
-- decidido, pra consultar depois.
-- ============================================================

CREATE TABLE IF NOT EXISTS work_notes (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  content     TEXT,
  occurred_at TEXT NOT NULL,   -- YYYY-MM-DD
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_work_notes_owner ON work_notes(owner_id, occurred_at DESC);
