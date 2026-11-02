-- 0090 — Agenda, Conselho de Guerra, Missões e Quadro de Avisos (reformulação RPG).
-- Tudo aditivo: nenhuma tabela é recriada e nenhum dado existente é alterado.

-- Categoria visual do evento (estudo, saúde, foco...) e lembrete configurável.
-- Eventos antigos ficam com categoria NULL (tratados como "evento" na interface).
ALTER TABLE events ADD COLUMN category TEXT;
ALTER TABLE events ADD COLUMN reminder_minutes INTEGER;
ALTER TABLE events ADD COLUMN goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL;

-- Versões de cada plano selado no Conselho de Guerra (revisão posterior do plano).
CREATE TABLE IF NOT EXISTS weekly_plan_versions (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start    TEXT NOT NULL,
  version       INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, week_start, version)
);
CREATE INDEX IF NOT EXISTS idx_weekly_plan_versions_owner ON weekly_plan_versions(owner_id, week_start);

CREATE INDEX IF NOT EXISTS idx_subtasks_owner_task ON subtasks(owner_id, task_id);

-- Conquistas novas (métricas em achievementsService.ts).
INSERT OR IGNORE INTO achievements (id, code, title, description, icon, threshold, metric, tier) VALUES
  ('ach_plan_sealed_4',   'plan_sealed_4',   'Estrategista da Guilda', 'Selou 4 planos semanais no Conselho de Guerra.', 'Shield',   4,  'weekly_plans_sealed',  'silver'),
  ('ach_plan_sealed_12',  'plan_sealed_12',  'General da Jornada',     'Selou 12 planos semanais no Conselho de Guerra.', 'Crown',   12, 'weekly_plans_sealed',  'gold'),
  ('ach_quests_30',       'quests_30',       'Caçador de Quests',      'Resgatou 30 quests no Quadro de Avisos.',         'ScrollText', 30, 'quests_claimed_total', 'silver'),
  ('ach_subtasks_50',     'subtasks_50',     'Executor Meticuloso',    'Concluiu 50 subtarefas de missões.',              'ListChecks', 50, 'subtasks_done_total',  'bronze');
