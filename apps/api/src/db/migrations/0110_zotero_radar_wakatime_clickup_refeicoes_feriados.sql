-- 0110_zotero_radar_wakatime_clickup_refeicoes_feriados
-- Integrações pessoais por tela (todas com dados reais, nada simulado):
--  - Biblioteca do Mestrado: Zotero (chave pessoal) e Radar de Artigos (arXiv + OpenAlex);
--  - Forja do Código: WakaTime (tempo real programando);
--  - Profissional: ClickUp (tarefas atribuídas ao usuário);
--  - Saúde: refeições com Open Food Facts (código de barras);
--  - Agenda / Conselho / Raid: feriados nacionais da BrasilAPI.
-- Chaves pessoais ficam criptografadas (cryptoService) e nunca voltam ao frontend.

-- ───────────── Zotero ─────────────
CREATE TABLE IF NOT EXISTS zotero_connections (
  owner_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  zotero_user_id   TEXT NOT NULL,
  username         TEXT,
  api_key_enc      TEXT NOT NULL,
  library_version  INTEGER NOT NULL DEFAULT 0,
  pending_version  INTEGER,
  next_start       INTEGER NOT NULL DEFAULT 0,
  collection_key   TEXT,
  last_sync_at     TEXT,
  last_sync_status TEXT CHECK (last_sync_status IS NULL OR last_sync_status IN ('ok', 'parcial', 'erro')),
  last_sync_error  TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Vínculo item do Zotero → artigo da biblioteca (evita duplicar e permite remover).
CREATE TABLE IF NOT EXISTS zotero_items (
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_key       TEXT NOT NULL,
  user_paper_id  TEXT REFERENCES user_papers(id) ON DELETE SET NULL,
  item_type      TEXT,
  version        INTEGER NOT NULL DEFAULT 0,
  has_pdf        INTEGER NOT NULL DEFAULT 0,
  collections_json TEXT NOT NULL DEFAULT '[]',
  deleted        INTEGER NOT NULL DEFAULT 0,
  synced_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, item_key)
);
CREATE INDEX IF NOT EXISTS idx_zotero_items_paper ON zotero_items(owner_id, user_paper_id);

CREATE TABLE IF NOT EXISTS zotero_collections (
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  collection_key TEXT NOT NULL,
  name           TEXT NOT NULL,
  parent_key     TEXT,
  PRIMARY KEY (owner_id, collection_key)
);

-- ───────────── Radar de Artigos ─────────────
CREATE TABLE IF NOT EXISTS radar_topics (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query       TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, query)
);

-- Uma linha por artigo encontrado (a chave estável impede reaparecer em outra semana).
CREATE TABLE IF NOT EXISTS radar_items (
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_key      TEXT NOT NULL,
  topic_id      TEXT REFERENCES radar_topics(id) ON DELETE SET NULL,
  topic_query   TEXT,
  week_key      TEXT NOT NULL,
  source        TEXT NOT NULL CHECK (source IN ('arxiv', 'openalex')),
  title         TEXT NOT NULL,
  authors_json  TEXT NOT NULL DEFAULT '[]',
  published     TEXT,
  venue         TEXT,
  doi           TEXT,
  arxiv_id      TEXT,
  openalex_id   TEXT,
  abstract      TEXT,
  url           TEXT,
  pdf_url       TEXT,
  cited_by      INTEGER,
  status        TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'salvo', 'dispensado')),
  user_paper_id TEXT REFERENCES user_papers(id) ON DELETE SET NULL,
  decided_at    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, item_key)
);
CREATE INDEX IF NOT EXISTS idx_radar_items_week ON radar_items(owner_id, week_key, status);

-- Varreduras feitas (uma por semana; guarda falhas parciais de cada fonte).
CREATE TABLE IF NOT EXISTS radar_scans (
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_key    TEXT NOT NULL,
  scanned_at  TEXT NOT NULL DEFAULT (datetime('now')),
  found       INTEGER NOT NULL DEFAULT 0,
  errors_json TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (owner_id, week_key)
);

-- ───────────── WakaTime ─────────────
CREATE TABLE IF NOT EXISTS wakatime_connections (
  owner_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username         TEXT,
  api_key_enc      TEXT NOT NULL,
  last_sync_at     TEXT,
  last_sync_status TEXT CHECK (last_sync_status IS NULL OR last_sync_status IN ('ok', 'erro')),
  last_sync_error  TEXT,
  coverage_from    TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wakatime_days (
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_key         TEXT NOT NULL,
  total_seconds   INTEGER NOT NULL DEFAULT 0,
  languages_json  TEXT NOT NULL DEFAULT '[]',
  projects_json   TEXT NOT NULL DEFAULT '[]',
  editors_json    TEXT NOT NULL DEFAULT '[]',
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, day_key)
);

-- ───────────── ClickUp ─────────────
CREATE TABLE IF NOT EXISTS clickup_connections (
  owner_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token_enc        TEXT NOT NULL,
  clickup_user_id  TEXT NOT NULL,
  username         TEXT,
  team_id          TEXT,
  team_name        TEXT,
  project_id       TEXT REFERENCES projects(id) ON DELETE SET NULL,
  last_cursor_ms   INTEGER,
  last_sync_at     TEXT,
  last_sync_status TEXT CHECK (last_sync_status IS NULL OR last_sync_status IN ('ok', 'parcial', 'erro')),
  last_sync_error  TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clickup_task_links (
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clickup_id      TEXT NOT NULL,
  task_id         TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  list_name       TEXT,
  url             TEXT,
  clickup_status  TEXT,
  status_type     TEXT,
  date_updated_ms INTEGER,
  synced_at       TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, clickup_id)
);
CREATE INDEX IF NOT EXISTS idx_clickup_links_task ON clickup_task_links(owner_id, task_id);

-- ───────────── Refeições (Open Food Facts) ─────────────
CREATE TABLE IF NOT EXISTS meals (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_key     TEXT NOT NULL,
  eaten_at    TEXT NOT NULL,
  meal_type   TEXT NOT NULL CHECK (meal_type IN ('cafe', 'almoco', 'lanche', 'jantar', 'ceia')),
  barcode     TEXT,
  name        TEXT NOT NULL,
  brand       TEXT,
  grams       REAL CHECK (grams IS NULL OR grams > 0),
  kcal        REAL CHECK (kcal IS NULL OR kcal >= 0),
  protein_g   REAL CHECK (protein_g IS NULL OR protein_g >= 0),
  carbs_g     REAL CHECK (carbs_g IS NULL OR carbs_g >= 0),
  fat_g       REAL CHECK (fat_g IS NULL OR fat_g >= 0),
  source      TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('openfoodfacts', 'manual')),
  image_url   TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_meals_owner_day ON meals(owner_id, day_key);

CREATE TABLE IF NOT EXISTS nutrition_settings (
  owner_id        TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  kcal_goal       INTEGER CHECK (kcal_goal IS NULL OR kcal_goal BETWEEN 500 AND 10000),
  protein_goal_g  INTEGER CHECK (protein_goal_g IS NULL OR protein_goal_g BETWEEN 10 AND 500),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cache público de produtos (dados abertos, não pertencem a nenhum usuário).
CREATE TABLE IF NOT EXISTS food_products (
  barcode     TEXT PRIMARY KEY,
  data_json   TEXT NOT NULL,
  found       INTEGER NOT NULL DEFAULT 1,
  fetched_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ───────────── Feriados (BrasilAPI) ─────────────
CREATE TABLE IF NOT EXISTS holidays_br (
  day_key  TEXT NOT NULL,
  name     TEXT NOT NULL,
  type     TEXT NOT NULL DEFAULT 'national',
  year     INTEGER NOT NULL,
  PRIMARY KEY (day_key, name)
);
CREATE TABLE IF NOT EXISTS holiday_years (
  year        INTEGER PRIMARY KEY,
  fetched_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Feriados locais do usuário (municipais/estaduais) e preferências.
CREATE TABLE IF NOT EXISTS user_holidays (
  id        TEXT PRIMARY KEY,
  owner_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_key   TEXT NOT NULL,
  name      TEXT NOT NULL,
  UNIQUE (owner_id, day_key)
);
CREATE TABLE IF NOT EXISTS holiday_prefs (
  owner_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  council      INTEGER NOT NULL DEFAULT 1,
  raid_truce   INTEGER NOT NULL DEFAULT 1,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ───────────── Conquistas (métricas reais em achievementsService) ─────────────
INSERT OR IGNORE INTO achievements (id, code, title, description, icon, threshold, metric, tier) VALUES
  ('ach_zotero_portal',  'zotero_portal',  'Portal do Zotero',          'Conectou o Zotero e trouxe o primeiro item para a biblioteca.', 'Library',      1,   'zotero_items_linked', 'bronze'),
  ('ach_zotero_archive', 'zotero_archive', 'Arquivista do Mestrado',    'Cem itens do Zotero vinculados à biblioteca.',                   'Library',      100, 'zotero_items_linked', 'gold'),
  ('ach_radar_first',    'radar_first',    'Sentinela da Fronteira',    'Fez a triagem completa do Radar de Artigos de uma semana.',      'Radar',        1,   'radar_weeks_triaged', 'bronze'),
  ('ach_radar_month',    'radar_month',    'Vigia do Estado da Arte',   'Fez a triagem do Radar em oito semanas.',                         'Radar',        8,   'radar_weeks_triaged', 'silver'),
  ('ach_radar_saved',    'radar_saved',    'Caçador de Artigos',        'Salvou dez artigos encontrados pelo Radar.',                      'BookOpen',     10,  'radar_saved',         'silver'),
  ('ach_waka_10h',       'waka_10h',       'Mãos na Bigorna',           'Dez horas reais programando registradas pelo WakaTime.',          'Hammer',       10,  'waka_hours_total',    'bronze'),
  ('ach_waka_100h',      'waka_100h',      'Mestre do Tempo de Forja',  'Cem horas reais programando registradas pelo WakaTime.',          'Hammer',       100, 'waka_hours_total',    'gold'),
  ('ach_clickup_10',     'clickup_10',     'Contratado da Guilda',      'Concluiu dez tarefas vindas do ClickUp.',                         'Briefcase',    10,  'clickup_tasks_done',  'bronze'),
  ('ach_clickup_100',    'clickup_100',    'Veterano dos Contratos',    'Concluiu cem tarefas vindas do ClickUp.',                         'Briefcase',    100, 'clickup_tasks_done',  'gold'),
  ('ach_meal_first',     'meal_first',     'Primeira Ração',            'Registrou a primeira refeição na Cozinha do Herói.',               'UtensilsCrossed', 1,  'meals_logged',     'bronze'),
  ('ach_meal_100',       'meal_100',       'Cozinheiro do Reino',       'Registrou cem refeições.',                                        'UtensilsCrossed', 100, 'meals_logged',     'silver'),
  ('ach_protein_7',      'protein_7',      'Força de Proteína',         'Bateu a meta de proteína em sete dias.',                          'Beef',         7,   'protein_goal_days',   'silver');
