-- ============================================================
-- 0072_conselho_de_guerra
-- Conselho de Guerra: planejamento da semana (par "para frente" da
-- Revisão Semanal). O plano guarda só as escolhas do usuário (focos e
-- notas); a distribuição das missões vai para tasks.planned_date e a
-- aderência (planejadas × concluídas) é sempre derivada das tarefas.
-- Tudo aditivo.
-- ============================================================

CREATE TABLE IF NOT EXISTS weekly_plans (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start  TEXT NOT NULL,                 -- segunda-feira (YYYY-MM-DD) no fuso do usuário
  focus       TEXT NOT NULL DEFAULT '[]',    -- JSON: [{ "type": "campaign"|"project"|"goal", "id": "..." }] (máx. 3)
  notes       TEXT,
  sealed_at   TEXT,                          -- quando o plano foi selado (UTC)
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_plans_owner_sealed ON weekly_plans(owner_id, sealed_at);

-- Dia planejado da tarefa (YYYY-MM-DD). Diferente de start_date (início
-- no Gantt) e de due_date (prazo): é "quando pretendo fazer".
ALTER TABLE tasks ADD COLUMN planned_date TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_owner_planned ON tasks(owner_id, planned_date);
