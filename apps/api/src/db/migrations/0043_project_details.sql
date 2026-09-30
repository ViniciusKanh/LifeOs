-- ============================================================
-- 0043_project_details
-- Cadastro completo de projeto: status, prioridade, datas, objetivo,
-- escopo, critérios de sucesso, cliente/stakeholder, área, orçamento,
-- repositório, links e etiquetas. Tudo aditivo — nenhuma coluna
-- existente é alterada; projetos antigos ficam com status 'active'.
-- Progresso, tarefas e documentos NÃO são copiados para cá: são
-- sempre derivados das tarefas vinculadas (tasks.project_id).
-- ============================================================

ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE projects ADD COLUMN priority TEXT;
ALTER TABLE projects ADD COLUMN start_date TEXT;
ALTER TABLE projects ADD COLUMN due_date TEXT;
ALTER TABLE projects ADD COLUMN objective TEXT;
ALTER TABLE projects ADD COLUMN scope TEXT;
ALTER TABLE projects ADD COLUMN success_criteria TEXT;
ALTER TABLE projects ADD COLUMN client TEXT;
ALTER TABLE projects ADD COLUMN area TEXT;
ALTER TABLE projects ADD COLUMN budget REAL;
ALTER TABLE projects ADD COLUMN repository_url TEXT;
ALTER TABLE projects ADD COLUMN links TEXT;
ALTER TABLE projects ADD COLUMN tags TEXT;
ALTER TABLE projects ADD COLUMN completed_at TEXT;

CREATE INDEX IF NOT EXISTS idx_projects_owner_status ON projects(owner_id, status);
