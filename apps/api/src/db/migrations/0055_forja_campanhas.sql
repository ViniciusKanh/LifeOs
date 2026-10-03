-- ============================================================
-- 0055_forja_campanhas
-- Campanha = camada de orquestração ACIMA de Projetos: referencia
-- metas, projetos, tarefas e hábitos existentes (nunca copia dados).
-- Marcos com recompensa própria; XP/moedas continuam no ledger único
-- (xp_events / coin_ledger). Tudo aditivo.
-- ============================================================

CREATE TABLE IF NOT EXISTS campaigns (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'paused', 'completed', 'archived')),
  goal_id         TEXT REFERENCES goals(id) ON DELETE SET NULL,
  life_area       TEXT,
  term            TEXT NOT NULL DEFAULT 'medio' CHECK (term IN ('curto', 'medio', 'longo')),
  start_date      TEXT,
  end_date        TEXT,
  banner          TEXT,
  icon            TEXT,
  theme_color     TEXT,
  priority        TEXT NOT NULL DEFAULT 'Média' CHECK (priority IN ('Baixa', 'Média', 'Alta')),
  streak_enabled  INTEGER NOT NULL DEFAULT 1,
  completion_xp   INTEGER NOT NULL DEFAULT 0 CHECK (completion_xp >= 0),
  completion_coins INTEGER NOT NULL DEFAULT 0 CHECK (completion_coins >= 0),
  completed_at    TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_campaigns_owner ON campaigns(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_campaigns_goal ON campaigns(owner_id, goal_id);

-- Associações (sem duplicar as entidades originais).
CREATE TABLE IF NOT EXISTS campaign_projects (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (campaign_id, project_id)
);
CREATE INDEX IF NOT EXISTS idx_campaign_projects_owner ON campaign_projects(owner_id, project_id);

CREATE TABLE IF NOT EXISTS campaign_tasks (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (campaign_id, task_id)
);
CREATE INDEX IF NOT EXISTS idx_campaign_tasks_owner ON campaign_tasks(owner_id, task_id);

CREATE TABLE IF NOT EXISTS campaign_habits (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  habit_id    TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (campaign_id, habit_id)
);
CREATE INDEX IF NOT EXISTS idx_campaign_habits_owner ON campaign_habits(owner_id, habit_id);

-- Marcos (o "chefe" é só a apresentação de um marco principal).
CREATE TABLE IF NOT EXISTS campaign_milestones (
  id                      TEXT PRIMARY KEY,
  campaign_id             TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  owner_id                TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title                   TEXT NOT NULL,
  description             TEXT,
  position                INTEGER NOT NULL DEFAULT 0,
  due_date                TEXT,
  status                  TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  is_major                INTEGER NOT NULL DEFAULT 0,
  dependency_milestone_id TEXT REFERENCES campaign_milestones(id) ON DELETE SET NULL,
  xp_reward               INTEGER NOT NULL DEFAULT 0 CHECK (xp_reward >= 0),
  coin_reward             INTEGER NOT NULL DEFAULT 0 CHECK (coin_reward >= 0),
  completed_at            TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_campaign_milestones ON campaign_milestones(owner_id, campaign_id, position);

-- Histórico de mudanças relevantes (criada, iniciada, pausada, retomada,
-- marco concluído, concluída) — alimenta a Timeline sem duplicar dados.
CREATE TABLE IF NOT EXISTS campaign_events (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id  TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  ref_id       TEXT,
  label        TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_campaign_events_owner ON campaign_events(owner_id, created_at);

-- Bônus registrado no próprio ledger: XP final = base × multiplicador.
-- Nulos para eventos antigos/sem bônus (XP histórico nunca é recalculado).
ALTER TABLE xp_events ADD COLUMN base_xp INTEGER;
ALTER TABLE xp_events ADD COLUMN multiplier REAL;
