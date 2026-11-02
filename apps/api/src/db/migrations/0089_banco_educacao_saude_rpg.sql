-- 0089 — Banco, Educação e Saúde (reformulação RPG).
-- Tudo aditivo: nenhuma tabela existente é recriada ou apagada.

-- Automações genéricas por módulo. As tabelas da 0088 (module_automations)
-- têm CHECK (module IN ('grimoire','goals')) e o SQLite não altera CHECK sem
-- recriar a tabela — então criamos tabelas novas sem a restrição (o módulo é
-- validado no código, em automationService.ts) e copiamos os dados existentes.
-- As tabelas antigas ficam intactas (só deixam de ser escritas).
CREATE TABLE IF NOT EXISTS automations (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module        TEXT NOT NULL,
  key           TEXT NOT NULL,
  enabled       INTEGER NOT NULL DEFAULT 0,
  config_json   TEXT NOT NULL DEFAULT '{}',
  last_run_at   TEXT,
  last_status   TEXT CHECK (last_status IS NULL OR last_status IN ('ok', 'skipped', 'error')),
  last_message  TEXT,
  next_run_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, module, key)
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  automation_id  TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  trigger_type   TEXT NOT NULL CHECK (trigger_type IN ('manual', 'cron', 'event')),
  run_key        TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('ok', 'skipped', 'error')),
  summary        TEXT,
  started_at     TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at    TEXT,
  UNIQUE (automation_id, run_key)
);
CREATE INDEX IF NOT EXISTS idx_automation_runs_owner ON automation_runs(owner_id, started_at);

INSERT OR IGNORE INTO automations (id, owner_id, module, key, enabled, config_json, last_run_at, last_status, last_message, next_run_at, created_at, updated_at)
  SELECT id, owner_id, module, key, enabled, config_json, last_run_at, last_status, last_message, next_run_at, created_at, updated_at FROM module_automations;

INSERT OR IGNORE INTO automation_runs (id, owner_id, automation_id, trigger_type, run_key, status, summary, started_at, finished_at)
  SELECT id, owner_id, automation_id, trigger_type, run_key, status, summary, started_at, finished_at FROM module_automation_runs;

-- Campanha acadêmica: etapas configuráveis de cada formação (nós do mapa).
CREATE TABLE IF NOT EXISTS education_stages (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  education_id  TEXT NOT NULL REFERENCES educations(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  position      INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'done')),
  due_date      TEXT,
  notes         TEXT,
  completed_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_education_stages_owner ON education_stages(owner_id, education_id, position);

-- Sugestões de planejamento de outros módulos (plano de estudo semanal, etc.).
-- payload_json guarda a proposta editável; só "applied" cria dados.
CREATE TABLE IF NOT EXISTS module_plan_suggestions (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module        TEXT NOT NULL,
  kind          TEXT NOT NULL,
  period_key    TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'rejected')),
  payload_json  TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at    TEXT,
  UNIQUE (owner_id, module, kind, period_key)
);
CREATE INDEX IF NOT EXISTS idx_module_plan_suggestions_owner ON module_plan_suggestions(owner_id, module, status);

-- Conquistas novas (métricas em achievementsService.ts). Nenhuma recompensa
-- quantidade extrema: sono conta noites entre 6h e 10h, água conta dias.
INSERT OR IGNORE INTO achievements (id, code, title, description, icon, threshold, metric, tier) VALUES
  ('ach_bank_first_deposit', 'bank_first_deposit', 'Primeiro Cofre',            'Fez o primeiro investimento no Banco da Guilda.',        'PiggyBank',     1,    'bank_deposits_total',        'bronze'),
  ('ach_bank_claimed_10',    'bank_claimed_10',    'Mercador Paciente',         'Resgatou 10 investimentos no Banco.',                    'Coins',         10,   'bank_deposits_claimed',      'silver'),
  ('ach_bank_score_800',     'bank_score_800',     'Guardião do Tesouro',       'Alcançou score de crédito 800 no Banco.',                'ShieldCheck',   800,  'bank_credit_score_peak',     'gold'),
  ('ach_edu_start',          'edu_start',          'Início da Jornada',         'Cadastrou a primeira formação.',                         'GraduationCap', 1,    'educations_total',           'bronze'),
  ('ach_edu_dedicated',      'edu_dedicated',      'Estudante Dedicado',        'Registrou 20 horas de estudo.',                          'BookOpen',      1200, 'study_minutes_total',        'silver'),
  ('ach_edu_organized',      'edu_organized',      'Organização',               'Concluiu 10 prazos acadêmicos.',                         'CalendarCheck', 10,   'academic_deadlines_done',    'bronze'),
  ('ach_edu_researcher',     'edu_researcher',     'Pesquisador',               'Concluiu 3 etapas da campanha acadêmica.',               'Microscope',    3,    'education_stages_done',      'silver'),
  ('ach_edu_epic',           'edu_epic',           'Conclusão Épica',           'Concluiu uma formação (100% de progresso).',             'Crown',         1,    'educations_completed',       'gold'),
  ('ach_health_sleep_14',    'health_sleep_14',    'Guardião do Descanso',      'Registrou 14 noites com sono entre 6h e 10h.',           'Moon',          14,   'sleep_nights_balanced',      'silver'),
  ('ach_health_mood_30',     'health_mood_30',     'Mente Atenta',              'Fez 30 check-ins de humor e energia.',                   'Smile',         30,   'mood_checkins_total',        'bronze'),
  ('ach_health_water_30',    'health_water_30',    'Fonte Constante',           'Registrou água em 30 dias diferentes.',                  'Droplets',      30,   'water_days_total',           'silver');
