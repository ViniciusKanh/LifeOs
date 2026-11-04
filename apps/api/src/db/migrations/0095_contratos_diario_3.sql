-- ============================================================
-- 0095_contratos_diario_3
-- Contratos 3.0 (Guilda dos Pactos) e Entrada do Diário 3.0.
-- Somente aditiva: nenhuma tabela é recriada e nenhum dado é apagado.
--
-- Contratos: o status oficial (ativo/concluido/arquivado) continua sendo
-- controlado pelo motor de gamificação. Os estados novos (rascunho,
-- pausado, pronto para selar, cumprido/selado, cancelado) são derivados
-- destas colunas extras. Etapas configuráveis agrupam as tarefas reais
-- (tasks.contract_stage_id) e o histórico fica em contract_events.
-- Selos são registros únicos por contrato e tipo (sem recompensa repetida).
--
-- Diário: três campos novos do fechamento do dia (reflexão, aprendizado e
-- pendência) e a meta de escrita do usuário. Humor/energia/estresse seguem
-- em mood_entries (Saúde), a fonte oficial.
-- Atenção: o runner divide por ponto e vírgula — não usar esse caractere em strings.
-- ============================================================

ALTER TABLE contracts ADD COLUMN category TEXT;
ALTER TABLE contracts ADD COLUMN priority TEXT NOT NULL DEFAULT 'Média';
ALTER TABLE contracts ADD COLUMN success_criteria TEXT;
ALTER TABLE contracts ADD COLUMN campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL;
ALTER TABLE contracts ADD COLUMN reminder_days INTEGER;
ALTER TABLE contracts ADD COLUMN is_draft INTEGER NOT NULL DEFAULT 0;
ALTER TABLE contracts ADD COLUMN draft_json TEXT;
ALTER TABLE contracts ADD COLUMN paused_at TEXT;
ALTER TABLE contracts ADD COLUMN cancelled_at TEXT;
ALTER TABLE contracts ADD COLUMN sealed_at TEXT;
ALTER TABLE contracts ADD COLUMN featured INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_contracts_campaign ON contracts(campaign_id);

CREATE TABLE IF NOT EXISTS contract_stages (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contract_id  TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL DEFAULT 0,
  name         TEXT NOT NULL,
  objective    TEXT,
  criterion    TEXT,
  status       TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'ativa', 'concluida')),
  completed_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_contract_stages_contract ON contract_stages(owner_id, contract_id, position);

ALTER TABLE tasks ADD COLUMN contract_stage_id TEXT REFERENCES contract_stages(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_contract_stage ON tasks(contract_stage_id);

CREATE TABLE IF NOT EXISTS contract_events (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  detail      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_contract_events_contract ON contract_events(owner_id, contract_id, created_at);

-- Selo conquistado sobrevive à exclusão do contrato (guarda o título como histórico).
CREATE TABLE IF NOT EXISTS contract_seals (
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contract_id    TEXT NOT NULL,
  seal_code      TEXT NOT NULL CHECK (seal_code IN ('disciplina', 'constancia', 'conhecimento', 'execucao', 'maestria')),
  contract_title TEXT NOT NULL,
  earned_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, contract_id, seal_code)
);

ALTER TABLE journal_entries ADD COLUMN closing_reflection TEXT;
ALTER TABLE journal_entries ADD COLUMN closing_learning TEXT;
ALTER TABLE journal_entries ADD COLUMN closing_pending TEXT;
ALTER TABLE user_settings ADD COLUMN journal_writing_goal INTEGER;

-- Conquistas (métricas em achievementsService.ts). Contam práticas concluídas,
-- nunca edição de texto nem tamanho da crônica.
INSERT OR IGNORE INTO achievements (id, code, title, description, icon, threshold, metric, tier) VALUES
  ('ach_pact_seal_1',     'pact_seal_1',     'Primeiro Pacto Selado',      'Selou o primeiro contrato.',                                   'Stamp',        1,  'contracts_sealed_total',     'bronze'),
  ('ach_pact_seal_5',     'pact_seal_5',     'Cumpridor de Pactos',        'Selou 5 contratos.',                                           'ScrollText',   5,  'contracts_sealed_total',     'silver'),
  ('ach_pact_seals_all',  'pact_seals_all',  'Colecionador de Selos',      'Conquistou os 5 tipos de selo da Guilda.',                     'Award',        5,  'contract_seal_kinds',        'gold'),
  ('ach_pact_stages_10',  'pact_stages_10',  'Etapa por Etapa',            'Concluiu 10 etapas de contratos.',                             'ListChecks',   10, 'contract_stages_done_total', 'bronze'),
  ('ach_chron_close_7',   'chron_close_7',   'Fechamentos Completos',      'Registrou reflexão e aprendizado no fechamento de 7 dias.',    'Moon',         7,  'journal_full_closings',      'silver'),
  ('ach_chron_voice_5',   'chron_voice_5',   'Voz da Jornada',             'Gravou notas de voz no Diário em 5 dias diferentes.',          'Mic',          5,  'journal_voice_days',         'bronze'),
  ('ach_chron_media_10',  'chron_media_10',  'Álbum da Jornada',           'Guardou fotos ou documentos no Diário em 10 dias diferentes.', 'Camera',       10, 'journal_media_days',         'bronze');
