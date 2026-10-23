-- 0068_quadro_quests
-- Quadro de Quests: 3 diárias + 3 semanais por usuário, sorteadas de forma
-- determinística por (usuário, período) e persistidas aqui. O progresso NÃO
-- é guardado: é calculado ao vivo das fontes originais (tarefas, treinos,
-- leitura, hábitos, diário, água, foco, XP) dentro do período.
CREATE TABLE IF NOT EXISTS quest_assignments (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period        TEXT NOT NULL CHECK (period IN ('daily', 'weekly')),
  -- Dia local (diária) ou segunda-feira da semana (semanal), no fuso do usuário.
  period_key    TEXT NOT NULL,
  template_key  TEXT NOT NULL,
  target        INTEGER NOT NULL CHECK (target >= 1),
  xp_reward     INTEGER NOT NULL CHECK (xp_reward >= 0),
  claimed_at    TEXT,
  -- Troca (reroll): a quest substituída fica registrada (limite de 1 troca por dia).
  replaced_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, period, period_key, template_key)
);
CREATE INDEX IF NOT EXISTS idx_quest_assignments_owner_period ON quest_assignments(owner_id, period, period_key);
