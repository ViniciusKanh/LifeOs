-- Hábitos, Biblioteca e Administração 3.0 — somente colunas/tabelas novas (aditivo).

-- Hábitos: pausa (sem punir a sequência), unidade explícita, prioridade,
-- horário de lembrete e vínculo opcional com um experimento do Laboratório.
ALTER TABLE habits ADD COLUMN paused_at TEXT;
ALTER TABLE habits ADD COLUMN unit TEXT;
ALTER TABLE habits ADD COLUMN priority TEXT CHECK (priority IS NULL OR priority IN ('Baixa', 'Média', 'Alta'));
ALTER TABLE habits ADD COLUMN reminder_time TEXT;
ALTER TABLE habits ADD COLUMN experiment_id TEXT REFERENCES personal_experiments(id) ON DELETE SET NULL;

-- Biblioteca: sessões com posição inicial/final, observação e aprendizado.
ALTER TABLE reading_sessions ADD COLUMN start_page INTEGER;
ALTER TABLE reading_sessions ADD COLUMN end_page INTEGER;
ALTER TABLE reading_sessions ADD COLUMN note TEXT;
ALTER TABLE reading_sessions ADD COLUMN learning TEXT;
ALTER TABLE books ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;

-- Trilhas de leitura: só livros que o usuário já cadastrou (nada é inventado).
CREATE TABLE IF NOT EXISTS reading_trails (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  theme       TEXT,
  objective   TEXT,
  goal_id     TEXT REFERENCES goals(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reading_trails_owner ON reading_trails(owner_id);
CREATE TABLE IF NOT EXISTS reading_trail_books (
  trail_id  TEXT NOT NULL REFERENCES reading_trails(id) ON DELETE CASCADE,
  book_id   TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  owner_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (trail_id, book_id)
);

-- Administração: prioridade e moeda real do valor (nunca misturada às moedas virtuais).
ALTER TABLE life_admin_items ADD COLUMN priority TEXT CHECK (priority IS NULL OR priority IN ('Baixa', 'Média', 'Alta'));
ALTER TABLE life_admin_items ADD COLUMN currency TEXT NOT NULL DEFAULT 'BRL';

INSERT OR IGNORE INTO achievements (id, code, title, description, icon, threshold, metric, tier) VALUES
  ('ach_hab_first_flame',  'hab_first_flame',  'Primeira Chama',           'Cumpriu um hábito pela primeira vez.',                         'Flame',     1,    'habit_checks_total',          'bronze'),
  ('ach_hab_ritual_7',     'hab_ritual_7',     'Ritual Consistente',       'Cumpriu todos os hábitos previstos em 7 dias.',                'Flame',     7,    'habit_perfect_days_total',    'silver'),
  ('ach_hab_guardian_30',  'hab_guardian_30',  'Guardião da Rotina',       'Cumpriu todos os hábitos previstos em 30 dias.',               'ShieldCheck', 30, 'habit_perfect_days_total',    'gold'),
  ('ach_hab_master_500',   'hab_master_500',   'Mestre da Disciplina',     'Registrou 500 hábitos cumpridos.',                             'Trophy',    500,  'habit_checks_total',          'platinum'),
  ('ach_lib_first_tome',   'lib_first_tome',   'Primeiro Tomo',            'Concluiu o primeiro livro.',                                   'BookOpen',  1,    'books_completed_total',       'bronze'),
  ('ach_lib_consistent',   'lib_consistent',   'Leitor Consistente',       'Leu em 7 dias seguidos.',                                      'Flame',     7,    'reading_best_streak',         'silver'),
  ('ach_lib_explorer',     'lib_explorer',     'Explorador do Conhecimento','Cadastrou 5 livros na Biblioteca.',                            'Library',   5,    'books_registered_total',      'bronze'),
  ('ach_lib_guardian',     'lib_guardian',     'Guardião da Biblioteca',   'Concluiu uma trilha de leitura inteira.',                      'Library',   1,    'reading_trails_completed',    'gold'),
  ('ach_lib_master',       'lib_master',       'Mestre das Leituras',      'Avançou 5.000 páginas inéditas.',                              'BookOpen',  5000, 'pages_unique_total',          'platinum'),
  ('ach_adm_deadlines',    'adm_deadlines',    'Guardião dos Prazos',      'Resolveu 10 compromissos dentro do prazo.',                    'ShieldCheck', 10, 'life_admin_on_time_total',    'silver'),
  ('ach_adm_archivist',    'adm_archivist',    'Arquivista Real',          'Guardou documento ou comprovante em 10 registros.',           'ClipboardList', 10, 'life_admin_with_file_total', 'silver'),
  ('ach_adm_order',        'adm_order',        'Mestre da Ordem',          'Resolveu 50 compromissos dentro do prazo.',                    'Crown',     50,   'life_admin_on_time_total',    'gold'),
  ('ach_adm_kingdom',      'adm_kingdom',      'Reino Organizado',         'Resolveu 25 compromissos administrativos.',                    'Target',    25,   'life_admin_resolved_total',   'silver'),
  ('ach_adm_consistent',   'adm_consistent',   'Administrador Consistente','Resolveu compromissos em 6 meses diferentes.',                 'Timer',     6,    'life_admin_active_months',    'gold');
