-- ============================================================
-- 0044_task_attachments
-- Anexos de tarefa (imagens e PDFs). Mesmo padrão das mídias do
-- Diário: data URI comprimida no cliente, sem storage externo.
-- Os "Documentos" de um projeto são derivados daqui via JOIN com
-- tasks.project_id — nada é duplicado na tabela de projetos.
-- ============================================================

CREATE TABLE IF NOT EXISTS task_attachments (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'image' CHECK (kind IN ('image', 'document')),
  data_uri    TEXT NOT NULL,
  file_name   TEXT,
  mime_type   TEXT,
  size_bytes  INTEGER,
  caption     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON task_attachments(task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_task_attachments_owner ON task_attachments(owner_id, created_at);
