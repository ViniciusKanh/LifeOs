-- ============================================================
-- 0052_admin_direcao_notas
-- Três módulos novos, todos aditivos (nenhuma tabela existente é
-- recriada nem perde dado):
--
-- 1) Administração da vida: vencimentos (CNH, passaporte, seguro, IPVA),
--    manutenções (carro, casa), documentos importantes e contas a pagar.
--    Lembretes de longo prazo com recorrência em meses e histórico.
-- 2) Direção: visão e valores, roda da vida (nota 0–10 por área, com
--    histórico), metas por ciclo (ano/trimestre/mês) e área da vida,
--    projetos ligados a metas e revisões mensal/trimestral/anual.
-- 3) Notas e conhecimento: notas com [[links]], backlinks e vínculos
--    com tarefas, projetos, metas, livros, diário e formações.
-- ============================================================

-- 1) Administração da vida ------------------------------------
CREATE TABLE IF NOT EXISTS life_admin_items (
  id                  TEXT PRIMARY KEY,
  owner_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind                TEXT NOT NULL CHECK (kind IN ('vencimento', 'manutencao', 'documento', 'conta')),
  title               TEXT NOT NULL,
  category            TEXT NOT NULL DEFAULT 'outro',
  due_date            TEXT,                 -- YYYY-MM-DD do próximo vencimento/manutenção
  recurrence_months   INTEGER CHECK (recurrence_months IS NULL OR recurrence_months BETWEEN 1 AND 120),
  remind_days_before  INTEGER NOT NULL DEFAULT 15 CHECK (remind_days_before BETWEEN 0 AND 365),
  amount              REAL,                 -- valor da conta/serviço (opcional, só informativo)
  reference           TEXT,                 -- nº de apólice, placa, protocolo… (opcional)
  location            TEXT,                 -- onde o original está guardado
  notes               TEXT,
  file_data_uri       TEXT,                 -- foto/PDF do documento (mesmo teto de anexos do app)
  file_name           TEXT,
  file_mime           TEXT,
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  last_done_at        TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_life_admin_owner_due ON life_admin_items(owner_id, status, due_date);

-- Cada "feito" (pagou, renovou, fez a revisão) vira uma linha — histórico real e Timeline.
CREATE TABLE IF NOT EXISTS life_admin_history (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id     TEXT NOT NULL REFERENCES life_admin_items(id) ON DELETE CASCADE,
  done_at     TEXT NOT NULL,              -- YYYY-MM-DD em que foi feito
  due_date    TEXT,                       -- vencimento que esse "feito" cobriu
  amount      REAL,
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_life_admin_history_item ON life_admin_history(item_id, done_at);
CREATE INDEX IF NOT EXISTS idx_life_admin_history_owner ON life_admin_history(owner_id, done_at);

-- Evita mandar o mesmo lembrete duas vezes para o mesmo vencimento.
CREATE TABLE IF NOT EXISTS life_admin_reminder_log (
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id    TEXT NOT NULL REFERENCES life_admin_items(id) ON DELETE CASCADE,
  due_date   TEXT NOT NULL,
  stage      TEXT NOT NULL,               -- 'antes' | 'hoje' | 'atrasado'
  sent_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, item_id, due_date, stage)
);

-- 2) Direção ----------------------------------------------------
CREATE TABLE IF NOT EXISTS life_vision (
  owner_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  vision       TEXT,                      -- "Daqui a 5 anos eu…"
  purpose      TEXT,                      -- missão/propósito em uma frase
  values_json  TEXT NOT NULL DEFAULT '[]', -- [{ "name": "Saúde", "description": "…" }]
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS life_wheel_scores (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  area         TEXT NOT NULL,
  score        INTEGER NOT NULL CHECK (score BETWEEN 0 AND 10),
  note         TEXT,
  assessed_on  TEXT NOT NULL,             -- YYYY-MM-DD
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, area, assessed_on)
);
CREATE INDEX IF NOT EXISTS idx_life_wheel_owner ON life_wheel_scores(owner_id, assessed_on);

ALTER TABLE goals ADD COLUMN life_area TEXT;
ALTER TABLE goals ADD COLUMN cycle TEXT;   -- 'YYYY' (anual), 'YYYY-Qn' (trimestral) ou 'YYYY-MM' (mensal)
CREATE INDEX IF NOT EXISTS idx_goals_owner_cycle ON goals(owner_id, cycle);

ALTER TABLE projects ADD COLUMN goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_projects_goal ON projects(goal_id);

CREATE TABLE IF NOT EXISTS periodic_reviews (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('monthly', 'quarterly', 'annual')),
  period_key      TEXT NOT NULL,          -- '2026-10' | '2026-Q4' | '2026'
  wins            TEXT,
  lessons         TEXT,
  focus_next      TEXT,
  energy_score    INTEGER CHECK (energy_score IS NULL OR energy_score BETWEEN 1 AND 10),
  metrics_json    TEXT,                   -- retrato real do período no momento em que foi salvo
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, kind, period_key)
);

-- 3) Notas e conhecimento ---------------------------------------
CREATE TABLE IF NOT EXISTS notes (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  content     TEXT,                       -- HTML do editor rico
  plain_text  TEXT,                       -- texto puro para busca e prévia
  kind        TEXT NOT NULL DEFAULT 'nota' CHECK (kind IN ('nota', 'ideia', 'referencia')),
  tags        TEXT NOT NULL DEFAULT '[]',
  source_url  TEXT,
  pinned      INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notes_owner_updated ON notes(owner_id, updated_at);

CREATE TABLE IF NOT EXISTS note_links (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note_id      TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  target_type  TEXT NOT NULL CHECK (target_type IN ('note', 'task', 'project', 'goal', 'book', 'journal', 'education')),
  target_id    TEXT NOT NULL,
  origin       TEXT NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual', 'wiki')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (note_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS idx_note_links_target ON note_links(owner_id, target_type, target_id);
