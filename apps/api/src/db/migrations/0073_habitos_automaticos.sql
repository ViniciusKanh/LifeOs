-- ============================================================
-- 0073_habitos_automaticos
-- Hábitos automáticos e encadeados.
--  - auto_source: o hábito é marcado sozinho a partir de um registro
--    real de outro módulo (treino, leitura, água, diário, tarefas,
--    flashcards). NULL = hábito manual (comportamento de sempre).
--  - auto_threshold: mínimo do dia para contar (min de treino, páginas,
--    ml de água, nº de tarefas/cartões). NULL = basta um registro.
--  - after_habit_id: encadeamento "depois de X, faço Y".
--  - habit_entries.source: 'auto' quando o check-in veio da sincronização
--    (só esses podem ser desfeitos por ela; check-in manual nunca é tocado).
-- Tudo aditivo e nullable.
-- ============================================================

ALTER TABLE habits ADD COLUMN auto_source TEXT
  CHECK (auto_source IS NULL OR auto_source IN ('workout', 'reading', 'water', 'journal', 'tasks', 'flashcards'));
ALTER TABLE habits ADD COLUMN auto_threshold REAL CHECK (auto_threshold IS NULL OR auto_threshold > 0);
ALTER TABLE habits ADD COLUMN after_habit_id TEXT REFERENCES habits(id) ON DELETE SET NULL;

ALTER TABLE habit_entries ADD COLUMN source TEXT;

CREATE INDEX IF NOT EXISTS idx_habits_owner_auto ON habits(owner_id, auto_source);
