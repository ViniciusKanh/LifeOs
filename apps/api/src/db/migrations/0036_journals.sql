-- ============================================================
-- 0036_journals
-- Fase 2 do Diário (inspirado no app Diário/Journal da Apple):
-- "diários" são coleções nomeadas (Pessoal, Viagens, Estudos...) que o
-- usuário cria pra organizar suas entradas. Como o LifeOS guarda uma
-- entrada estruturada por dia (não várias entradas livres como a Apple),
-- a relação é N:N entre journal_entries e journals — um dia pode
-- pertencer a mais de um diário (ex.: "Pessoal" + "Viagens").
-- ============================================================

CREATE TABLE IF NOT EXISTS journals (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  icon         TEXT,                    -- emoji curto, ex. "🦋", "✈️"
  color        TEXT,                    -- token de cor do design system, ex. "pink", "blue"
  description  TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  archived_at  TEXT,                    -- soft delete — nunca apaga entradas vinculadas
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_journals_owner ON journals(owner_id, archived_at);

CREATE TABLE IF NOT EXISTS journal_entry_journals (
  entry_id    TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  journal_id  TEXT NOT NULL REFERENCES journals(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, journal_id)
);

CREATE INDEX IF NOT EXISTS idx_entry_journals_journal ON journal_entry_journals(journal_id);
