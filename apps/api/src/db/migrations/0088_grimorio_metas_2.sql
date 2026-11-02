-- ============================================================
-- 0088_grimorio_metas_2
-- Grimório 2.0 + Metas 2.0 (somente aditiva — nenhum dado é apagado):
--  * baralho ↔ meta (sincronização de estudo com progresso de meta);
--  * fontes/referências do baralho;
--  * duração de cada revisão (tempo estudado real);
--  * automações por módulo (config, status, histórico, idempotência);
--  * fila de sugestões de cartões (aprovação obrigatória);
--  * importações (documento → resumo → cartões);
--  * diário de estudo por meta (evita contagem duplicada);
--  * sugestões de planejamento de metas (semanal, replanejamento, IA);
--  * conquistas novas no catálogo oficial.
-- ============================================================

ALTER TABLE flashcard_decks ADD COLUMN goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL;
ALTER TABLE flashcard_decks ADD COLUMN goal_sync_mode TEXT NOT NULL DEFAULT 'study_days' CHECK (goal_sync_mode IN ('study_days', 'mastery', 'none'));
ALTER TABLE flashcard_decks ADD COLUMN sources_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE flashcard_reviews ADD COLUMN duration_ms INTEGER;

CREATE INDEX IF NOT EXISTS idx_flashcard_decks_goal ON flashcard_decks(owner_id, goal_id);

-- Automações: uma linha por (dono, módulo, chave). O catálogo e as regras
-- ficam no código (automationService.ts); aqui só o estado do usuário.
CREATE TABLE IF NOT EXISTS module_automations (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module        TEXT NOT NULL CHECK (module IN ('grimoire', 'goals')),
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

-- Histórico de execuções. run_key garante idempotência (ex.: uma execução diária por dia).
CREATE TABLE IF NOT EXISTS module_automation_runs (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  automation_id  TEXT NOT NULL REFERENCES module_automations(id) ON DELETE CASCADE,
  trigger_type   TEXT NOT NULL CHECK (trigger_type IN ('manual', 'cron', 'event')),
  run_key        TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('ok', 'skipped', 'error')),
  summary        TEXT,
  started_at     TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at    TEXT,
  UNIQUE (automation_id, run_key)
);
CREATE INDEX IF NOT EXISTS idx_module_automation_runs_owner ON module_automation_runs(owner_id, started_at);

-- Importações de conteúdo (texto colado ou PDF) para o Grimório.
CREATE TABLE IF NOT EXISTS grimoire_imports (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_id       TEXT REFERENCES flashcard_decks(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('text', 'pdf')),
  status        TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'done', 'error')),
  summary_json  TEXT,
  error         TEXT,
  chars         INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_grimoire_imports_owner ON grimoire_imports(owner_id, created_at);

-- Sugestões de cartões vindas de automações/importações. Nada entra num
-- baralho sem aprovação. dedup_key evita sugerir o mesmo cartão duas vezes.
CREATE TABLE IF NOT EXISTS grimoire_suggestions (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_id       TEXT REFERENCES flashcard_decks(id) ON DELETE SET NULL,
  source_kind   TEXT NOT NULL CHECK (source_kind IN ('journal', 'import', 'text')),
  source_ref    TEXT NOT NULL,
  source_label  TEXT,
  front         TEXT NOT NULL,
  back          TEXT NOT NULL,
  dedup_key     TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at    TEXT,
  UNIQUE (owner_id, dedup_key)
);
CREATE INDEX IF NOT EXISTS idx_grimoire_suggestions_owner ON grimoire_suggestions(owner_id, status);

-- Um registro por (meta, baralho, dia) de estudo: a meta avança no máximo
-- uma vez por dia por baralho, mesmo com várias sessões (idempotente).
CREATE TABLE IF NOT EXISTS goal_study_log (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id     TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  deck_id     TEXT NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
  day_key     TEXT NOT NULL,
  reviews     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (goal_id, deck_id, day_key)
);
CREATE INDEX IF NOT EXISTS idx_goal_study_log_owner ON goal_study_log(owner_id, goal_id);

-- Sugestões de planejamento (plano semanal, replanejamento, plano da IA).
-- payload_json guarda a proposta editável; só "applied" altera dados.
CREATE TABLE IF NOT EXISTS goal_plan_suggestions (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id       TEXT REFERENCES goals(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('weekly', 'replan', 'breakdown')),
  period_key    TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'rejected')),
  payload_json  TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_goal_plan_suggestions_owner ON goal_plan_suggestions(owner_id, status);

-- Conquistas novas (métricas calculadas em achievementsService.ts).
INSERT OR IGNORE INTO achievements (id, code, title, description, icon, threshold, metric, tier) VALUES
  ('ach_grim_days_7',      'grim_days_7',      'Estudante Constante',   'Estudou no Grimório em 7 dias diferentes.',          'BookOpen',  7,   'grimoire_study_days_total', 'bronze'),
  ('ach_grim_days_30',     'grim_days_30',     'Ritual Inabalável',     'Estudou no Grimório em 30 dias diferentes.',         'BookOpen',  30,  'grimoire_study_days_total', 'silver'),
  ('ach_grim_reviews_500', 'grim_reviews_500', 'Mestre da Revisão',     'Fez 500 revisões de cartões no Grimório.',           'Repeat',    500, 'flashcard_reviews_total', 'gold'),
  ('ach_grim_mature_100',  'grim_mature_100',  'Guardião do Saber',     'Tem 100 cartões maduros (intervalo de 21+ dias).',   'Library',   100, 'flashcards_mature_total', 'gold'),
  ('ach_goal_first',       'goal_first_done',  'Primeira Meta Concluída', 'Concluiu a primeira meta.',                         'Flag',      1,   'goals_completed_total', 'bronze'),
  ('ach_goal_ontime_5',    'goal_ontime_5',    'Mestre dos Prazos',     'Concluiu 5 metas dentro do prazo.',                  'Clock',     5,   'goals_completed_on_time', 'silver'),
  ('ach_goal_plans_4',     'goal_plans_4',     'Estrategista Semanal',  'Aplicou 4 planos semanais ou replanejamentos.',      'Map',       4,   'goal_plans_applied', 'silver'),
  ('ach_goal_done_25',     'goal_done_25',     'Planejador Lendário',   'Concluiu 25 metas.',                                 'Crown',     25,  'goals_completed_total', 'platinum');
