-- ============================================================
-- 0065_contratos_meta_projeto
-- Contratos passam a poder se vincular a uma Meta e/ou a um Projeto
-- (muitos contratos reais representam um objetivo maior que também
-- vale a pena acompanhar como Meta/Projeto, com prazo proprio).
-- Aditivo: colunas novas, nenhum dado existente e alterado.
-- ============================================================

ALTER TABLE contracts ADD COLUMN goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL;
ALTER TABLE contracts ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contracts_goal ON contracts(goal_id);
CREATE INDEX IF NOT EXISTS idx_contracts_project ON contracts(project_id);
