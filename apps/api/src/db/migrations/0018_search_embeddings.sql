-- ============================================================
-- 0018_search_embeddings
-- Cache de embeddings (Gemini text-embedding-004) para a busca
-- semântica global. Guardamos o vetor serializado como JSON e
-- comparamos por similaridade de cosseno em JavaScript
-- (embeddingsService.ts) em vez de depender de função de vetor
-- nativa do SQLite/libSQL local usado nos testes e em dev — assim a
-- busca semântica funciona igual em qualquer ambiente, sem exigir
-- recursos de vetor exclusivos do Turso hospedado.
-- content_hash evita recalcular o embedding quando o texto da
-- entidade não mudou desde a última vez.
-- ============================================================

CREATE TABLE IF NOT EXISTS search_embeddings (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type   TEXT NOT NULL,   -- 'task' | 'goal' | 'habit' | 'book' | 'academic_project' | 'project'
  entity_id     TEXT NOT NULL,
  content_hash  TEXT NOT NULL,   -- hash do texto usado para gerar o embedding (título + contexto relevante)
  embedding     TEXT NOT NULL,   -- JSON com o vetor (array de números)
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_search_embeddings_owner ON search_embeddings(owner_id, entity_type);
