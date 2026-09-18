-- ============================================================
-- 0029_planned_time_blocks
-- Capacity Planner: blocos de horário planejados no dia. Nunca copia
-- dado da entidade de origem — só referencia (entity_type/entity_id)
-- tarefa/hábito/bloco livre já existente, como o restante do LifeOS.
-- ============================================================

CREATE TABLE IF NOT EXISTS planned_time_blocks (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,          -- YYYY-MM-DD
  start_time  TEXT NOT NULL,          -- HH:MM
  end_time    TEXT NOT NULL,          -- HH:MM
  entity_type TEXT NOT NULL CHECK (entity_type IN ('task', 'free_block')),
  entity_id   TEXT,                   -- id da task quando entity_type = 'task'
  title       TEXT,                   -- só usado quando entity_type = 'free_block'
  block_type  TEXT NOT NULL DEFAULT 'normal' CHECK (block_type IN ('deep_work', 'normal', 'light')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_planned_time_blocks_owner_date ON planned_time_blocks(owner_id, date);
