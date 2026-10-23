-- ============================================================
-- 0071_meta_anual_leitura
-- Meta anual de leitura (livros e/ou páginas por ano). O progresso
-- NÃO é armazenado: é derivado dos livros concluídos e das sessões de
-- leitura do ano (fuso do usuário). Citações/destaques reutilizam
-- book_notes (já possui kind 'quote'/'insight' e page) — nada a mudar lá.
-- ============================================================

CREATE TABLE IF NOT EXISTS reading_year_goals (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year          INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  books_target  INTEGER CHECK (books_target IS NULL OR books_target BETWEEN 1 AND 1000),
  pages_target  INTEGER CHECK (pages_target IS NULL OR pages_target BETWEEN 1 AND 1000000),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, year)
);

-- Mural de citações filtra por dono + tipo.
CREATE INDEX IF NOT EXISTS idx_book_notes_owner_kind ON book_notes(owner_id, kind, created_at);
