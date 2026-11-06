-- 0097 — Missões 3.0 (Conselheiro de Missões) e Revisões 3.0 (Revisões da Jornada).
-- Tudo aditivo: nenhuma tabela é recriada e nenhum dado existente é alterado.
-- Revisões antigas (weekly_reviews / periodic_reviews) continuam válidas e são
-- espelhadas a cada salvamento novo, para Linha do Tempo, conquistas e
-- Analytics seguirem lendo as mesmas fontes.

-- Subtarefas mais completas (etapas do Conselheiro): descrição, estimativa,
-- prazo e dependência de outra etapa da mesma missão.
ALTER TABLE subtasks ADD COLUMN description TEXT;
ALTER TABLE subtasks ADD COLUMN estimate_minutes INTEGER;
ALTER TABLE subtasks ADD COLUMN due_date TEXT;
ALTER TABLE subtasks ADD COLUMN depends_on_id TEXT;

-- Ordem manual dentro da coluna do Kanban e arquivamento de missões concluídas
-- (só concluídas podem ser arquivadas: missão aberta arquivada sumiria das
-- outras telas sem ter sido feita).
ALTER TABLE tasks ADD COLUMN board_order REAL;
ALTER TABLE tasks ADD COLUMN archived_at TEXT;
CREATE INDEX IF NOT EXISTS idx_tasks_owner_board ON tasks(owner_id, status, board_order);

-- Sessões do Conselheiro de Missões: conversa, proposta corrente e o que foi
-- aprovado. Separa sugestão (proposal_json) de registro persistido (task_ids_json).
CREATE TABLE IF NOT EXISTS mission_advisor_sessions (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode           TEXT NOT NULL CHECK (mode IN ('create', 'improve', 'sequence', 'breakdown')),
  source         TEXT NOT NULL DEFAULT 'missions' CHECK (source IN ('missions', 'review')),
  source_ref     TEXT,
  messages_json  TEXT NOT NULL DEFAULT '[]',
  proposal_json  TEXT,
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'applied', 'discarded')),
  task_ids_json  TEXT NOT NULL DEFAULT '[]',
  ai_used        INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mission_advisor_owner ON mission_advisor_sessions(owner_id, updated_at);

-- Revisões da Jornada (semanal, mensal, trimestral, anual) num só modelo.
-- period_key: segunda-feira YYYY-MM-DD | YYYY-MM | YYYY-Qn | YYYY.
CREATE TABLE IF NOT EXISTS journey_reviews (
  id               TEXT PRIMARY KEY,
  owner_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL CHECK (kind IN ('weekly', 'monthly', 'quarterly', 'annual')),
  period_key       TEXT NOT NULL,
  steps_json       TEXT NOT NULL DEFAULT '[]',
  answers_json     TEXT NOT NULL DEFAULT '{}',
  reflection       TEXT,
  actions_json     TEXT NOT NULL DEFAULT '[]',
  plan_json        TEXT NOT NULL DEFAULT '{}',
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sealed')),
  sealed_at        TEXT,
  snapshot_json    TEXT,
  plan_applied_at  TEXT,
  revision         INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, kind, period_key)
);
CREATE INDEX IF NOT EXISTS idx_journey_reviews_owner ON journey_reviews(owner_id, kind, period_key);

-- Correções feitas depois do selo: o que mudou e quando (a revisão selada não é reescrita em silêncio).
CREATE TABLE IF NOT EXISTS journey_review_revisions (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  review_id     TEXT NOT NULL REFERENCES journey_reviews(id) ON DELETE CASCADE,
  revision      INTEGER NOT NULL,
  changed_json  TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_journey_review_revisions ON journey_review_revisions(owner_id, review_id);

-- Campos que precisam estar preenchidos para selar cada tipo de revisão.
CREATE TABLE IF NOT EXISTS journey_review_settings (
  owner_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  required_json  TEXT NOT NULL DEFAULT '{}',
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Conquistas novas (métricas em achievementsService.ts). "4 semanas de reflexão"
-- já existe (review_4, weekly_reviews_total) e não é duplicada.
INSERT OR IGNORE INTO achievements (id, code, title, description, icon, threshold, metric, tier) VALUES
  ('ach_journey_review_1',  'journey_review_1',  'Primeira Revisão',         'Selou a primeira Revisão da Jornada.',                 'ClipboardList', 1, 'journey_reviews_sealed',   'bronze'),
  ('ach_journey_month_1',   'journey_month_1',   'Guardião do Mês',          'Selou uma revisão mensal.',                           'ClipboardList', 1, 'journey_monthly_sealed', 'silver'),
  ('ach_journey_quarter_1', 'journey_quarter_1', 'Estrategista Trimestral',  'Selou uma revisão trimestral.',                       'Target', 1, 'journey_quarterly_sealed',   'gold'),
  ('ach_journey_year_1',    'journey_year_1',    'Cronista do Ano',          'Selou uma revisão anual.',                            'Trophy', 1, 'journey_annual_sealed',       'platinum'),
  ('ach_journey_cycles',    'journey_cycles',    'Mestre dos Ciclos',        'Selou revisões dos quatro tipos: semana, mês, trimestre e ano.', 'Trophy', 4, 'journey_kinds_sealed', 'platinum'),
  ('ach_advisor_missions_10', 'advisor_missions_10', 'Aprendiz do Conselheiro', 'Criou 10 missões aprovadas a partir do Conselheiro de Missões.', 'ListChecks', 10, 'advisor_missions_created', 'bronze');
