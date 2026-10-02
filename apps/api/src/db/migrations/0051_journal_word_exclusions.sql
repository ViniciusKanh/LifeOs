-- ============================================================
-- 0051_journal_word_exclusions
-- Nuvem de palavras do Diário: palavras que o usuário escolheu esconder
-- (além das palavras vazias fixas do português). Uma linha por palavra,
-- já normalizada (minúscula, sem acento). Aditivo.
-- ============================================================

CREATE TABLE IF NOT EXISTS journal_word_exclusions (
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, word)
);
