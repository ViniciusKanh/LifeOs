-- ============================================================
-- 0002_projects_tasks
-- Projetos (pessoais e profissionais), tarefas, subtarefas,
-- status, tags, dependências e apontamento de tempo.
-- Hierarquia profissional (Workspace → Projeto → Epic → Tarefa)
-- é modelada reaproveitando "projects" com parent_id e "kind".
-- ============================================================

CREATE TABLE IF NOT EXISTS projects (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id     TEXT REFERENCES projects(id) ON DELETE CASCADE, -- permite Workspace > Projeto > Epic
  name          TEXT NOT NULL,
  description   TEXT,
  kind          TEXT NOT NULL DEFAULT 'personal'
                  CHECK (kind IN ('personal', 'workspace', 'professional', 'academic')),
  color         TEXT,
  archived_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_parent ON projects(parent_id);

-- Membros de um projeto/workspace compartilhado (colaboração futura).
CREATE TABLE IF NOT EXISTS project_members (
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member', 'viewer')),
  added_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, user_id)
);

-- Status de tarefa customizáveis por usuário (além dos padrão).
CREATE TABLE IF NOT EXISTS task_statuses (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  is_default  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_task_statuses_owner ON task_statuses(owner_id);

CREATE TABLE IF NOT EXISTS tasks (
  id               TEXT PRIMARY KEY,
  owner_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id       TEXT REFERENCES projects(id) ON DELETE SET NULL,
  parent_task_id   TEXT REFERENCES tasks(id) ON DELETE CASCADE, -- suporta subtarefas na própria tabela
  goal_id          TEXT REFERENCES goals(id) ON DELETE SET NULL,
  title            TEXT NOT NULL,
  description      TEXT,
  status           TEXT NOT NULL DEFAULT 'Backlog',
  priority         TEXT NOT NULL DEFAULT 'Média' CHECK (priority IN ('Baixa', 'Média', 'Alta')),
  -- Priority Score profissional: (impacto * urgência) / esforço
  impact           INTEGER,
  urgency          INTEGER,
  effort           INTEGER,
  priority_score   REAL,
  due_date         TEXT,
  start_date       TEXT,
  estimate_minutes INTEGER,
  time_spent_minutes INTEGER NOT NULL DEFAULT 0,
  recurrence_rule  TEXT,      -- regra de recorrência (ex. FREQ=WEEKLY BYDAY=MO,WE,FR)
  notes            TEXT,
  completed_at     TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_owner ON tasks(owner_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(owner_id, due_date);

-- Checklist simples dentro de uma tarefa (itens marcáveis).
CREATE TABLE IF NOT EXISTS subtasks (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  done        INTEGER NOT NULL DEFAULT 0,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id);

CREATE TABLE IF NOT EXISTS tags (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT,
  UNIQUE (owner_id, name)
);

CREATE TABLE IF NOT EXISTS task_tags (
  task_id  TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id   TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);

CREATE TABLE IF NOT EXISTS task_dependencies (
  task_id        TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_id  TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on_id)
);

-- Apontamento de tempo, usado por Focus Mode e métricas de foco.
CREATE TABLE IF NOT EXISTS time_entries (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id     TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  project_id  TEXT REFERENCES projects(id) ON DELETE SET NULL,
  started_at  TEXT NOT NULL,
  ended_at    TEXT,
  duration_minutes INTEGER,
  kind        TEXT NOT NULL DEFAULT 'focus' CHECK (kind IN ('focus', 'pomodoro', 'manual')),
  perceived_productivity INTEGER, -- 1-5
  distractions INTEGER NOT NULL DEFAULT 0,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_time_entries_owner ON time_entries(owner_id, started_at);
