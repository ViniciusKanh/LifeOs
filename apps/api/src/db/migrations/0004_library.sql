-- ============================================================
-- 0004_library
-- Livros (cadastro manual ou via ISBN/Google Books/Open Library),
-- notas de conhecimento extraídas e sessões de leitura.
-- ============================================================

CREATE TABLE IF NOT EXISTS books (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  isbn            TEXT,
  title           TEXT NOT NULL,
  author          TEXT,
  publisher       TEXT,
  cover_url       TEXT,
  published_year  INTEGER,
  total_pages     INTEGER,
  current_page    INTEGER NOT NULL DEFAULT 0,
  categories      TEXT,        -- JSON array de categorias
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'Quero Ler'
                    CHECK (status IN ('Quero Ler', 'Lendo', 'Pausado', 'Concluído', 'Abandonado')),
  rating          INTEGER,     -- 1-5
  personal_note   TEXT,
  started_at      TEXT,
  finished_at     TEXT,
  source          TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'isbn', 'google_books', 'open_library')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_books_owner ON books(owner_id, status);

CREATE TABLE IF NOT EXISTS book_notes (
  id          TEXT PRIMARY KEY,
  book_id     TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'note'
                CHECK (kind IN ('note', 'quote', 'insight', 'summary', 'idea')),
  content     TEXT NOT NULL,
  page        INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_book_notes_book ON book_notes(book_id);

CREATE TABLE IF NOT EXISTS reading_sessions (
  id          TEXT PRIMARY KEY,
  book_id     TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at  TEXT NOT NULL,
  ended_at    TEXT,
  duration_minutes INTEGER,
  pages_read  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reading_sessions_owner ON reading_sessions(owner_id, started_at);
