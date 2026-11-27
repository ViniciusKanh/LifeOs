-- Cidade Inteligente — São Paulo (0.5.41): 12 APIs oficiais da Prefeitura via APILIB.
-- Credenciais do usuário ficam criptografadas (mesmo mecanismo das outras integrações).
-- city_cache é cache global de respostas públicas (dados iguais para todos), com validade.
-- Todo o resto é pessoal e filtrado por owner_id.

CREATE TABLE IF NOT EXISTS city_credentials (
  owner_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mode          TEXT NOT NULL CHECK (mode IN ('token', 'client')),
  token_enc     TEXT,
  key_enc       TEXT,
  secret_enc    TEXT,
  masked        TEXT,
  disabled_json TEXT NOT NULL DEFAULT '[]',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS city_api_status (
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  api         TEXT NOT NULL,
  state       TEXT NOT NULL,
  message     TEXT,
  http_status INTEGER,
  checked_at  TEXT NOT NULL DEFAULT (datetime('now')),
  last_ok_at  TEXT,
  PRIMARY KEY (owner_id, api)
);

CREATE TABLE IF NOT EXISTS city_cache (
  cache_key   TEXT PRIMARY KEY,
  api         TEXT NOT NULL,
  payload     TEXT NOT NULL,
  fetched_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_city_cache_api ON city_cache (api, fetched_at);

CREATE TABLE IF NOT EXISTS city_favorites (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  api         TEXT NOT NULL,
  item_key    TEXT NOT NULL,
  title       TEXT NOT NULL,
  subtitle    TEXT,
  url         TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, api, item_key)
);
CREATE INDEX IF NOT EXISTS idx_city_favorites_owner ON city_favorites (owner_id, created_at);

CREATE TABLE IF NOT EXISTS city_alerts (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source        TEXT NOT NULL CHECK (source IN ('publicacoes', 'licitacoes')),
  name          TEXT NOT NULL,
  keywords_json TEXT NOT NULL DEFAULT '[]',
  active        INTEGER NOT NULL DEFAULT 1,
  last_run_day  TEXT,
  last_hits     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_city_alerts_owner ON city_alerts (owner_id);

-- Idempotência dos alertas: uma publicação só notifica uma vez por alerta.
CREATE TABLE IF NOT EXISTS city_alert_seen (
  owner_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_id  TEXT NOT NULL,
  item_key  TEXT NOT NULL,
  seen_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, alert_id, item_key)
);

-- Atividade do usuário no módulo: uma linha por dia + fonte + ação + referência.
-- Serve de histórico e de base das conquistas (recarregar a página não gera nada novo).
CREATE TABLE IF NOT EXISTS city_history (
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_key     TEXT NOT NULL,
  api         TEXT NOT NULL,
  action      TEXT NOT NULL,
  ref         TEXT NOT NULL DEFAULT '',
  label       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, day_key, api, action, ref)
);
CREATE INDEX IF NOT EXISTS idx_city_history_owner ON city_history (owner_id, created_at);

-- Protocolos pessoais (SP156 e e-SIC): acompanhamento manual, as APIs não consultam protocolo.
CREATE TABLE IF NOT EXISTS city_protocols (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('sp156', 'esic')),
  number      TEXT NOT NULL,
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'em_andamento', 'respondido', 'encerrado')),
  notes       TEXT,
  opened_on   TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_city_protocols_owner ON city_protocols (owner_id);

CREATE TABLE IF NOT EXISTS city_prefs (
  owner_id        TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  interests_json  TEXT NOT NULL DEFAULT '[]',
  widgets_json    TEXT NOT NULL DEFAULT '[]',
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO achievements (id, code, title, description, icon, threshold, metric, tier) VALUES
  ('ach_city_chronicler',  'city_chronicler',  'Cronista da Cidade',        'Leu publicações do Diário Oficial em dez dias diferentes.', 'Newspaper',  10, 'city_read_days',      'silver'),
  ('ach_city_explorer',    'city_explorer',    'Explorador Paulistano',     'Explorou cinco territórios diferentes da cidade.',          'MapPinned',   5, 'city_territories',    'bronze'),
  ('ach_city_transparency','city_transparency','Guardião da Transparência', 'Explorou o e-SIC em cinco dias diferentes.',                'Eye',         5, 'city_esic_days',      'bronze'),
  ('ach_city_indicators',  'city_indicators',  'Mestre dos Indicadores',    'Fez cinco comparações territoriais.',                      'BarChart3',   5, 'city_comparisons',    'silver'),
  ('ach_city_strategist',  'city_strategist',  'Estrategista Urbano',       'Guardou dez oportunidades do Diário Oficial ou de licitações.', 'Target', 10, 'city_opportunities', 'silver'),
  ('ach_city_diplomat',    'city_diplomat',    'Diplomata Municipal',       'Consultou com sucesso seis fontes diferentes da Prefeitura.', 'Landmark', 6, 'city_sources',        'gold'),
  ('ach_city_investigator','city_investigator','Investigador Público',      'Explorou o orçamento municipal (SOF) em cinco dias.',       'Search',      5, 'city_sof_days',       'bronze');
