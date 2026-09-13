-- ============================================================
-- 0014_achievements_catalog
-- Semeia o catálogo de conquistas em `achievements` (criada em
-- 0009_gamification_analytics, mas nunca populada). Cada linha usa
-- INSERT OR IGNORE por `code` — rodar de novo não duplica nada, e
-- novas conquistas futuras entram em migrations novas, nunca
-- editando estas.
-- ============================================================

INSERT OR IGNORE INTO achievements (id, code, title, description, icon, threshold, metric) VALUES
  ('ach_tasks_10',    'tasks_10',    'Produtivo',                 'Concluiu 10 tarefas.',                         'ListChecks',  10,   'tasks_completed_total'),
  ('ach_tasks_100',   'tasks_100',   'Máquina de produtividade',  'Concluiu 100 tarefas.',                        'Rocket',      100,  'tasks_completed_total'),
  ('ach_streak_7',    'streak_7',    'Consistente',               '7 dias seguidos cumprindo um hábito.',         'Flame',       7,    'habit_best_streak'),
  ('ach_streak_30',   'streak_30',   'Disciplina de ferro',       '30 dias seguidos cumprindo um hábito.',        'Flame',       30,   'habit_best_streak'),
  ('ach_books_5',     'books_5',     'Leitor assíduo',            'Concluiu 5 livros.',                           'BookOpen',    5,    'books_completed_total'),
  ('ach_books_20',    'books_20',    'Bibliófilo',                'Concluiu 20 livros.',                          'Library',     20,   'books_completed_total'),
  ('ach_focus_600',   'focus_600',   '10 horas de foco',          'Acumulou 10 horas em sessões de foco.',        'Timer',       600,  'focus_minutes_total'),
  ('ach_focus_3000',  'focus_3000',  '50 horas de foco',          'Acumulou 50 horas em sessões de foco.',        'Timer',       3000, 'focus_minutes_total'),
  ('ach_review_4',    'review_4',    'Um mês de reflexão',        'Preencheu 4 Weekly Reviews.',                  'ClipboardList', 4, 'weekly_reviews_total'),
  ('ach_goals_5',     'goals_5',     'Realizador de metas',       'Concluiu 5 metas.',                            'Target',      5,    'goals_completed_total');
