-- Árvore de Habilidades (aditiva). As DEFINIÇÕES das habilidades ficam versionadas em
-- código (config/skillTree.ts, validadas contra ciclos no carregamento); aqui fica só o
-- estado por usuário, a economia de Pontos de Habilidade (PH) e o histórico auditável.

-- Nível atual de cada habilidade (ramo e nível máximo copiados do catálogo para consultas de conquistas).
CREATE TABLE IF NOT EXISTS user_skills (
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_key     TEXT NOT NULL,
  branch        TEXT NOT NULL,
  max_level     INTEGER NOT NULL CHECK (max_level BETWEEN 1 AND 5),
  current_level INTEGER NOT NULL CHECK (current_level >= 1),
  unlocked_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, skill_key),
  CHECK (current_level <= max_level)
);

-- Livro-caixa dos PH: concessões (+), gastos (−) e reembolsos (+). event_key único = idempotência.
CREATE TABLE IF NOT EXISTS skill_point_ledger (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_key  TEXT NOT NULL,
  amount     INTEGER NOT NULL CHECK (amount <> 0),
  source     TEXT NOT NULL CHECK (source IN ('level', 'milestone', 'achievement', 'event', 'spend', 'refund')),
  label      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, event_key)
);
CREATE INDEX IF NOT EXISTS idx_skill_ledger_owner ON skill_point_ledger(owner_id, created_at);

-- Guarda de saldo: toda transação de gasto termina com um INSERT condicional nesta tabela
-- que só acontece se o saldo ficou negativo — e a CHECK abaixo aborta a transação inteira.
-- (o runner de migrations divide por ";", por isso não usamos TRIGGER aqui.)
CREATE TABLE IF NOT EXISTS skill_balance_guard (
  owner_id TEXT NOT NULL,
  ok       INTEGER NOT NULL,
  CONSTRAINT skill_points_insufficient CHECK (ok = 1)
);

-- Histórico auditável: evoluções, aplicações de build e redefinições. epoch = número de redefinições.
CREATE TABLE IF NOT EXISTS skill_transactions (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('upgrade', 'reset')),
  epoch          INTEGER NOT NULL DEFAULT 0,
  skill_key      TEXT,
  previous_level INTEGER,
  new_level      INTEGER,
  points_spent   INTEGER NOT NULL DEFAULT 0,
  origin         TEXT NOT NULL DEFAULT 'manual',
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Cada nível de cada habilidade só pode ser comprado uma vez por ciclo (anti gasto duplicado).
CREATE UNIQUE INDEX IF NOT EXISTS uq_skill_tx_level ON skill_transactions(owner_id, epoch, skill_key, new_level) WHERE kind = 'upgrade';
CREATE INDEX IF NOT EXISTS idx_skill_tx_owner ON skill_transactions(owner_id, created_at);

-- Presets personalizados (os três oficiais vêm do catálogo).
CREATE TABLE IF NOT EXISTS skill_presets (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  config_json TEXT NOT NULL DEFAULT '{"targets":[]}',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_skill_presets_owner ON skill_presets(owner_id);

-- Efeitos ativos materializados (sincronizados a cada mudança) para os módulos consultarem.
CREATE TABLE IF NOT EXISTS skill_effects_state (
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  effect_key      TEXT NOT NULL,
  effect_type     TEXT NOT NULL,
  source_skill    TEXT NOT NULL,
  level           INTEGER NOT NULL,
  active          INTEGER NOT NULL DEFAULT 1,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, effect_key)
);

-- Estado da árvore: ciclo (epoch), build desejada, regras de redefinição e avisos já enviados.
CREATE TABLE IF NOT EXISTS skill_tree_state (
  owner_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  epoch          INTEGER NOT NULL DEFAULT 0,
  desired_json   TEXT NOT NULL DEFAULT '[]',
  settings_json  TEXT NOT NULL DEFAULT '{}',
  notified_json  TEXT NOT NULL DEFAULT '[]',
  last_reset_at  TEXT,
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Conquistas oficiais da Árvore (motor de conquistas por métrica).
INSERT OR IGNORE INTO achievements (id, code, title, description, icon, threshold, metric, tier) VALUES
  ('ach_skill_first',     'skill_first',     'Primeira Habilidade',          'Desbloqueou a primeira habilidade da Árvore.',                     'Rocket', 1,  'skills_unlocked',     'bronze'),
  ('ach_skill_ten',       'skill_ten',       'Dez Talentos Desbloqueados',   'Desbloqueou dez habilidades diferentes.',                          'Flame', 10, 'skills_unlocked',     'silver'),
  ('ach_skill_branch',    'skill_branch',    'Mestre de um Ramo',            'Maximizou todas as habilidades de um ramo.',                       'Trophy',   1,  'skill_branches_mastered', 'gold'),
  ('ach_skill_multi',     'skill_multi',     'Especialista Multidisciplinar', 'Tem três ou mais habilidades em quatro ramos diferentes.',        'Target',   4,  'skill_branches_deep', 'gold'),
  ('ach_skill_six',       'skill_six',       'Explorador dos Seis Caminhos', 'Desbloqueou ao menos uma habilidade em cada um dos seis ramos.',    'ShieldCheck', 6,  'skill_branches_touched', 'silver'),
  ('ach_skill_builder',   'skill_builder',   'Construtor de Estratégias',    'Criou um preset de evolução próprio.',                             'ListChecks', 1, 'skill_presets_created', 'bronze'),
  ('ach_skill_maxed',     'skill_maxed',     'Árvore Maximizada',            'Maximizou todas as habilidades da Árvore.',                        'Trophy',   52, 'skills_maxed',        'platinum');
