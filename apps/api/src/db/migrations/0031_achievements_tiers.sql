-- ============================================================
-- 0031_achievements_tiers
-- Conquistas ganham "tier" (bronze/prata/ouro/platina), como troféus
-- de PlayStation/Xbox — mesmo catálogo genérico de sempre, só com
-- graduação de dificuldade e descrições mais ricas. Também amplia o
-- catálogo para módulos que ainda não tinham nenhuma conquista real
-- (água, exercício, estudo, experimentos).
-- ============================================================

ALTER TABLE achievements ADD COLUMN tier TEXT NOT NULL DEFAULT 'bronze' CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum'));

-- Graduação dos 10 troféus já existentes.
UPDATE achievements SET tier = 'bronze' WHERE code IN ('tasks_10', 'streak_7', 'books_5', 'focus_600', 'review_4', 'goals_5');
UPDATE achievements SET tier = 'silver' WHERE code IN ('tasks_100', 'streak_30', 'books_20', 'focus_3000');

-- Descrições mais ricas para o catálogo já existente (mesmo código, texto melhor).
UPDATE achievements SET description = 'Concluiu 10 tarefas — o primeiro passo de uma rotina consistente.' WHERE code = 'tasks_10';
UPDATE achievements SET description = 'Concluiu 100 tarefas. Sua produtividade já é hábito, não exceção.' WHERE code = 'tasks_100';
UPDATE achievements SET description = 'Cumpriu um hábito por 7 dias seguidos sem quebrar a sequência.' WHERE code = 'streak_7';
UPDATE achievements SET description = 'Cumpriu um hábito por 30 dias seguidos. Isso já é identidade.' WHERE code = 'streak_30';
UPDATE achievements SET description = 'Concluiu 5 livros. A estante de leituras terminadas começou.' WHERE code = 'books_5';
UPDATE achievements SET description = 'Concluiu 20 livros — leitura virou parte da sua rotina.' WHERE code = 'books_20';
UPDATE achievements SET description = 'Acumulou 10 horas em sessões de Foco.' WHERE code = 'focus_600';
UPDATE achievements SET description = 'Acumulou 50 horas em sessões de Foco. Concentração de verdade.' WHERE code = 'focus_3000';
UPDATE achievements SET description = 'Preencheu 4 Weekly Reviews — um mês inteiro parando pra refletir.' WHERE code = 'review_4';
UPDATE achievements SET description = 'Concluiu 5 metas até o fim.' WHERE code = 'goals_5';

-- Novos degraus para os módulos que já tinham conquista (ouro/platina).
INSERT OR IGNORE INTO achievements (id, code, title, description, icon, threshold, metric, tier) VALUES
  ('ach_tasks_500',    'tasks_500',    'Referência em produtividade', 'Concluiu 500 tarefas. Poucos sustentam esse ritmo.', 'Rocket', 500, 'tasks_completed_total', 'gold'),
  ('ach_tasks_1000',   'tasks_1000',   'Lenda da execução',           'Concluiu 1000 tarefas — um marco raro de constância.', 'Rocket', 1000, 'tasks_completed_total', 'platinum'),
  ('ach_streak_100',   'streak_100',   'Sequência de ferro',          '100 dias seguidos cumprindo um hábito.', 'Flame', 100, 'habit_best_streak', 'gold'),
  ('ach_streak_365',   'streak_365',   'Um ano sem quebrar',          '365 dias seguidos cumprindo um hábito. Consistência absoluta.', 'Flame', 365, 'habit_best_streak', 'platinum'),
  ('ach_books_50',     'books_50',     'Devorador de livros',         'Concluiu 50 livros.', 'Library', 50, 'books_completed_total', 'gold'),
  ('ach_focus_6000',   'focus_6000',   '100 horas de foco',           'Acumulou 100 horas em sessões de Foco.', 'Timer', 6000, 'focus_minutes_total', 'gold'),
  ('ach_review_12',    'review_12',    'Trimestre de reflexão',       'Preencheu 12 Weekly Reviews — três meses de autoconhecimento.', 'ClipboardList', 12, 'weekly_reviews_total', 'silver'),
  ('ach_review_52',    'review_52',    'Um ano de revisões',          'Preencheu 52 Weekly Reviews — uma revisão por semana, o ano inteiro.', 'ClipboardList', 52, 'weekly_reviews_total', 'gold'),
  ('ach_goals_20',     'goals_20',     'Colecionador de metas',       'Concluiu 20 metas até o fim.', 'Target', 20, 'goals_completed_total', 'silver'),
  ('ach_goals_50',     'goals_50',     'Mestre das metas',            'Concluiu 50 metas. Planejar e entregar virou rotina.', 'Target', 50, 'goals_completed_total', 'gold');

-- Módulos que ainda não tinham nenhuma conquista real: água, exercício, estudo e experimentos.
INSERT OR IGNORE INTO achievements (id, code, title, description, icon, threshold, metric, tier) VALUES
  ('ach_workouts_10',    'workouts_10',    'Em movimento',             'Registrou 10 treinos.', 'Dumbbell', 10, 'workouts_total', 'bronze'),
  ('ach_workouts_50',    'workouts_50',    'Atleta da rotina',         'Registrou 50 treinos.', 'Dumbbell', 50, 'workouts_total', 'silver'),
  ('ach_workouts_200',   'workouts_200',   'Disciplina física',        'Registrou 200 treinos — exercício virou hábito de vida.', 'Dumbbell', 200, 'workouts_total', 'gold'),
  ('ach_water_days_7',   'water_days_7',   'Hidratado', 'Registrou água em 7 dias diferentes.', 'Droplets', 7, 'water_days_total', 'bronze'),
  ('ach_water_days_30',  'water_days_30',  'Hábito de beber água',     'Registrou água em 30 dias diferentes.', 'Droplets', 30, 'water_days_total', 'silver'),
  ('ach_water_days_100', 'water_days_100', 'Hidratação constante',     'Registrou água em 100 dias diferentes.', 'Droplets', 100, 'water_days_total', 'gold'),
  ('ach_study_600',      'study_600',      '10 horas de estudo',       'Acumulou 10 horas de sessões de estudo registradas.', 'GraduationCap', 600, 'study_minutes_total', 'bronze'),
  ('ach_study_3000',     'study_3000',     '50 horas de estudo',       'Acumulou 50 horas de sessões de estudo — dedicação real à formação.', 'GraduationCap', 3000, 'study_minutes_total', 'silver'),
  ('ach_experiments_1',  'experiments_1',  'Primeiro experimento',     'Concluiu seu primeiro experimento pessoal.', 'FlaskConical', 1, 'experiments_completed_total', 'bronze'),
  ('ach_experiments_5',  'experiments_5',  'Cientista da própria rotina', 'Concluiu 5 experimentos pessoais.', 'FlaskConical', 5, 'experiments_completed_total', 'silver'),
  ('ach_experiments_15', 'experiments_15', 'Mestre da autoexperimentação', 'Concluiu 15 experimentos pessoais — testar e ajustar virou método.', 'FlaskConical', 15, 'experiments_completed_total', 'gold');
