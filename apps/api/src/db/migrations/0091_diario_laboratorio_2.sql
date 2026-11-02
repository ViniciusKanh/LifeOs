-- 0091 — Diário da Jornada 2.0 + Laboratório da Jornada 2.0. Tudo aditivo.

-- Retrospectiva semanal do Diário: rascunho gerado (regras ou IA) e editado
-- pelo usuário antes de salvar. Uma por semana.
CREATE TABLE IF NOT EXISTS journal_retrospectives (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start  TEXT NOT NULL,
  content     TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'auto' CHECK (source IN ('auto', 'ai', 'edited')),
  saved_at    TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, week_start)
);

-- Histórico de alterações do protocolo de um experimento (hipótese, métricas,
-- critério de sucesso, datas...). Mudar critério depois de começar fica registrado.
CREATE TABLE IF NOT EXISTS experiment_protocol_changes (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  experiment_id  TEXT NOT NULL REFERENCES personal_experiments(id) ON DELETE CASCADE,
  field          TEXT NOT NULL,
  old_value      TEXT,
  new_value      TEXT,
  after_start    INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_experiment_protocol_changes ON experiment_protocol_changes(owner_id, experiment_id, created_at);

-- Vínculo opcional de experimento com meta existente.
ALTER TABLE personal_experiments ADD COLUMN goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL;

-- Conquistas (métricas em achievementsService.ts). Contam práticas de registro,
-- nunca tamanho de texto ou resultado positivo de experimento.
INSERT OR IGNORE INTO achievements (id, code, title, description, icon, threshold, metric, tier) VALUES
  ('ach_chron_first',       'chron_first',       'Primeira Crônica',              'Escreveu a primeira entrada do Diário.',                 'NotebookPen', 1,  'journal_days_total',          'bronze'),
  ('ach_chron_7',           'chron_7',           'Sete Dias de Escrita',          'Escreveu no Diário em 7 dias diferentes.',               'CalendarDays', 7, 'journal_days_total',          'bronze'),
  ('ach_chron_fav_10',      'chron_fav_10',      'Guardião das Memórias',         'Marcou 10 crônicas como memórias favoritas.',            'Star',        10, 'journal_favorites_total',     'silver'),
  ('ach_chron_learn_20',    'chron_learn_20',    'Colecionador de Aprendizados',  'Registrou um aprendizado no fechamento de 20 dias.',     'Lightbulb',   20, 'journal_takeaways_total',     'silver'),
  ('ach_chron_retro_4',     'chron_retro_4',     'Reflexões da Jornada',          'Salvou 4 retrospectivas semanais.',                      'ScrollText',  4,  'journal_retros_saved',        'silver'),
  ('ach_chron_60',          'chron_60',          'Cronista Consistente',          'Escreveu no Diário em 60 dias diferentes.',              'BookOpen',    60, 'journal_days_total',          'gold'),
  ('ach_lab_hypothesis',    'lab_hypothesis',    'Primeira Hipótese',             'Registrou a primeira hipótese de experimento.',          'FlaskConical', 1, 'experiments_with_hypothesis', 'bronze'),
  ('ach_lab_started',       'lab_started',       'Primeiro Experimento',          'Iniciou o primeiro experimento.',                        'FlaskConical', 1, 'experiments_started_total',   'bronze'),
  ('ach_lab_logs_14',       'lab_logs_14',       'Observador Consistente',        'Registrou observações de experimento em 14 dias.',       'Eye',         14, 'experiment_log_days_total',   'silver'),
  ('ach_lab_concluded_3',   'lab_concluded_3',   'Pesquisador Metódico',          'Concluiu 3 experimentos com conclusão documentada.',     'ClipboardCheck', 3, 'experiments_documented',    'silver'),
  ('ach_lab_concluded_10',  'lab_concluded_10',  'Mestre dos Protocolos',         'Concluiu 10 experimentos com conclusão documentada.',    'Award',       10, 'experiments_documented',      'gold'),
  ('ach_lab_logs_60',       'lab_logs_60',       'Cientista da Jornada',          'Registrou observações de experimento em 60 dias.',       'Microscope',  60, 'experiment_log_days_total',   'gold');
