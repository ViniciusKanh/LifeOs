-- Índices para os filtros de data reescritos em formato "sargável"
-- (coluna >= date(?) AND coluna < date(?, '+1 day')): com eles o banco lê
-- só as linhas do período em vez de todo o histórico do usuário.
-- Somente aditivo: nenhuma tabela ou dado existente é alterado.
CREATE INDEX IF NOT EXISTS idx_sleep_entries_owner_woke ON sleep_entries(owner_id, woke_up_at);
CREATE INDEX IF NOT EXISTS idx_tasks_owner_created ON tasks(owner_id, created_at);
CREATE INDEX IF NOT EXISTS idx_time_entries_owner_ended ON time_entries(owner_id, ended_at);
