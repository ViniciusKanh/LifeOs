-- ============================================================
-- 0019_inbox
-- Notas rápidas / Inbox (captura única, estilo GTD): um lugar pra
-- jogar qualquer ideia/lembrete solto sem precisar decidir projeto,
-- status ou prioridade na hora. Depois se "processa" cada item —
-- vira tarefa ou é descartado. processed_at nulo = ainda pendente.
-- ============================================================

CREATE TABLE IF NOT EXISTS inbox_items (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  processed_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inbox_items_owner ON inbox_items(owner_id, processed_at);
