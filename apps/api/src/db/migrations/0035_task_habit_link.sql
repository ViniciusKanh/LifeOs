-- ============================================================
-- 0035_task_habit_link
-- Liga uma tarefa gerada automaticamente a partir de um hábito
-- ("Gerar tarefas de hoje" na tela Hábitos) de volta ao hábito de
-- origem. Não é destrutivo: coluna nova, nullable, sem afetar
-- tarefas existentes. Ver POST /api/habits/generate-tasks e o hook
-- de conclusão em tasks.routes.ts (concluir a tarefa faz o check-in
-- automático do hábito do dia).
-- ============================================================

ALTER TABLE tasks ADD COLUMN habit_id TEXT REFERENCES habits(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_habit ON tasks(habit_id);
