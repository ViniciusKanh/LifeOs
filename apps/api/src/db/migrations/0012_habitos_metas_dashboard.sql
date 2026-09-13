-- ============================================================
-- 0012_habitos_metas_dashboard
-- Suporte real aos novos dashboards de Hábitos e Metas: categoria
-- do hábito (para os filtros e o card "Hábitos por categoria"),
-- período da meta (anual/semestral/mensal/semanal, usado nas abas
-- e no card "Progresso por período") e o próximo passo de uma meta
-- (usado no card "Próximos marcos" — sempre um dado que o próprio
-- usuário cadastra, nunca inventado).
-- ============================================================

ALTER TABLE habits ADD COLUMN category TEXT;

ALTER TABLE goals ADD COLUMN period TEXT CHECK (period IN ('semanal', 'mensal', 'semestral', 'anual'));
ALTER TABLE goals ADD COLUMN next_action TEXT;
ALTER TABLE goals ADD COLUMN next_action_due TEXT;
ALTER TABLE goals ADD COLUMN completed_at TEXT;
