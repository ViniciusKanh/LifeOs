-- ============================================================
-- 0023_performance_indexes
-- Índices para endpoints chamados com frequência pelo frontend:
-- conquistas customizadas, checagem de conquistas, notas de trabalho
-- e métricas de Life Score/Analytics por usuário.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_tasks_owner_status_completed ON tasks(owner_id, status, completed_at);
CREATE INDEX IF NOT EXISTS idx_tasks_owner_updated ON tasks(owner_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_focus_sessions_owner_started ON focus_sessions(owner_id, started_at);
CREATE INDEX IF NOT EXISTS idx_focus_sessions_owner_actual ON focus_sessions(owner_id, actual_minutes);

CREATE INDEX IF NOT EXISTS idx_books_owner_status_updated ON books(owner_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_goals_owner_status_period ON goals(owner_id, status, period);
CREATE INDEX IF NOT EXISTS idx_weekly_reviews_owner_week ON weekly_reviews(owner_id, week_start_date);

CREATE INDEX IF NOT EXISTS idx_custom_achievements_owner_unlocked ON custom_achievements(owner_id, unlocked_at);
CREATE INDEX IF NOT EXISTS idx_work_notes_owner_created ON work_notes(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reading_sessions_owner_started_pages ON reading_sessions(owner_id, started_at, pages_read);
