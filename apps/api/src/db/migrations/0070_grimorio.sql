-- ============================================================
-- 0070_grimorio
-- Grimório de Memorização (repetição espaçada, algoritmo SM-2).
-- Baralhos podem ser ligados (opcionalmente) a uma disciplina/curso
-- da Educação ou a um livro da Biblioteca. O estado SM-2 de cada
-- cartão (ease, intervalo, repetições, lapsos) vive no próprio cartão;
-- cada revisão fica registrada em flashcard_reviews (histórico real
-- usado por estatísticas, sequência e XP). Tudo aditivo.
-- ============================================================

CREATE TABLE IF NOT EXISTS flashcard_decks (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  subject_id   TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  course_id    TEXT REFERENCES courses(id) ON DELETE SET NULL,
  book_id      TEXT REFERENCES books(id) ON DELETE SET NULL,
  -- Limite de cartões novos apresentados por dia neste baralho.
  new_per_day  INTEGER NOT NULL DEFAULT 15 CHECK (new_per_day BETWEEN 0 AND 200),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_flashcard_decks_owner ON flashcard_decks(owner_id, archived_at);

CREATE TABLE IF NOT EXISTS flashcards (
  id                TEXT PRIMARY KEY,
  owner_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_id           TEXT NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
  front             TEXT NOT NULL,
  back              TEXT NOT NULL,
  source            TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai', 'quote')),
  -- Origem do cartão quando veio de uma citação/nota da Biblioteca.
  source_note_id    TEXT REFERENCES book_notes(id) ON DELETE SET NULL,
  ease              REAL NOT NULL DEFAULT 2.5,
  interval_days     INTEGER NOT NULL DEFAULT 0,
  repetitions       INTEGER NOT NULL DEFAULT 0,
  lapses            INTEGER NOT NULL DEFAULT 0,
  -- Dia local do usuário (YYYY-MM-DD) em que o cartão vence.
  due_date          TEXT NOT NULL,
  -- NULL = cartão novo (nunca revisado).
  last_reviewed_at  TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_flashcards_owner_due ON flashcards(owner_id, due_date);
CREATE INDEX IF NOT EXISTS idx_flashcards_deck ON flashcards(deck_id);

CREATE TABLE IF NOT EXISTS flashcard_reviews (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id      TEXT NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  deck_id      TEXT NOT NULL,
  -- Qualidade SM-2 (0-5). A UI usa 1 = Errei, 3 = Difícil, 4 = Bom, 5 = Fácil.
  grade        INTEGER NOT NULL CHECK (grade BETWEEN 0 AND 5),
  -- 1 quando era a primeira revisão do cartão (conta no limite de novos/dia).
  was_new      INTEGER NOT NULL DEFAULT 0,
  interval_days INTEGER NOT NULL DEFAULT 0,
  reviewed_at  TEXT NOT NULL DEFAULT (datetime('now')),
  day_key      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_owner_day ON flashcard_reviews(owner_id, day_key);
CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_card ON flashcard_reviews(card_id);
