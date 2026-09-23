-- ============================================================
-- 0034_journal_entries
-- Diário do LifeOS: uma entrada por usuário por dia, no estilo
-- "diário/jornal" pedido pelo usuário. Guarda só o que é criativo/
-- subjetivo (intenção, reflexões, gratidão, cuidado comigo etc.) —
-- humor, energia e sono continuam vindos de mood_entries/sleep_entries
-- (Saúde), tarefas de tasks, insight de daily_insights e livro atual
-- de books, pra não duplicar dado que já existe em outro módulo.
-- ============================================================

CREATE TABLE IF NOT EXISTS journal_entries (
  id                TEXT PRIMARY KEY,
  owner_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_date        TEXT NOT NULL,          -- YYYY-MM-DD
  intention         TEXT,                   -- "Intenção do dia"
  thoughts          TEXT,                   -- "Pensamentos e reflexões"
  gratitude         TEXT,                   -- JSON: string[] (até 3 itens)
  self_care         TEXT,                   -- JSON: string[] (itens marcados, ex. "meditar")
  self_care_other   TEXT,                   -- "Outro" do cuidado comigo
  challenges        TEXT,                   -- "Desafios"
  lighter_plan      TEXT,                   -- "Como posso tornar este dia mais leve"
  feel_good         TEXT,                   -- "O que me fez bem hoje"
  night_mood        INTEGER CHECK (night_mood BETWEEN 1 AND 5),
  night_helped      TEXT,                   -- "O que me ajudou a reduzir a ansiedade hoje"
  night_takeaway    TEXT,                   -- "O que levo para amanhã"
  focus_task_ids    TEXT,                   -- JSON: string[] — tarefas escolhidas manualmente como foco do dia
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, entry_date)
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_owner ON journal_entries(owner_id, entry_date);
