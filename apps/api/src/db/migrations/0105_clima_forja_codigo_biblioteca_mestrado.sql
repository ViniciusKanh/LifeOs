-- ============================================================
-- 0105 (só aditiva): Clima real no Meu Mundo, Forja do Código e
-- Biblioteca do Mestrado.
-- Preferências do clima ficam no settings_json do world_profiles (sem
-- coluna nova); aqui só o último clima válido, para quando a Open-Meteo
-- estiver fora do ar.
-- ============================================================

ALTER TABLE world_profiles ADD COLUMN weather_cache_json TEXT;

-- ── Forja do Código (GitHub) ─────────────────────────────────
-- Uma integração por usuário. O token (opcional, só leitura) é guardado
-- criptografado com CREDENTIALS_ENCRYPTION_KEY e nunca volta ao frontend.
CREATE TABLE IF NOT EXISTS code_integrations (
  owner_id        TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL DEFAULT 'github' CHECK (provider IN ('github')),
  username        TEXT NOT NULL,
  mode            TEXT NOT NULL DEFAULT 'public' CHECK (mode IN ('public', 'token')),
  token_enc       TEXT,
  rules_json      TEXT NOT NULL DEFAULT '{}',
  forge_level     INTEGER NOT NULL DEFAULT 1,
  -- Números do GitHub no momento da última sincronização (PRs abertas etc.).
  stats_json      TEXT NOT NULL DEFAULT '{}',
  last_sync_at    TEXT,
  last_sync_status TEXT CHECK (last_sync_status IN ('ok', 'partial', 'error', 'rate_limited')),
  last_sync_error TEXT,
  coverage_from   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS code_repos (
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  repo_id      INTEGER NOT NULL,
  full_name    TEXT NOT NULL,
  description  TEXT,
  language     TEXT,
  html_url     TEXT NOT NULL,
  is_private   INTEGER NOT NULL DEFAULT 0,
  pushed_at    TEXT,
  monitored    INTEGER NOT NULL DEFAULT 1,
  favorite     INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, repo_id)
);
CREATE INDEX IF NOT EXISTS idx_code_repos_name ON code_repos(owner_id, full_name);

-- Atividade real importada. external_id é o SHA do commit, o id do PR/issue
-- ou da release: o UNIQUE impede importar (e pontuar) a mesma coisa duas vezes.
CREATE TABLE IF NOT EXISTS code_events (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('commit', 'pr_opened', 'pr_merged', 'issue_closed', 'release')),
  external_id  TEXT NOT NULL,
  repo_full_name TEXT NOT NULL,
  title        TEXT,
  url          TEXT,
  occurred_at  TEXT NOT NULL,
  day_key      TEXT NOT NULL,
  xp           INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, kind, external_id)
);
CREATE INDEX IF NOT EXISTS idx_code_events_owner_day ON code_events(owner_id, day_key);

-- Calendário de contribuições oficial (só no modo com token, via GraphQL).
CREATE TABLE IF NOT EXISTS code_contrib_days (
  owner_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_key   TEXT NOT NULL,
  count     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owner_id, day_key)
);

-- ── Biblioteca do Mestrado ───────────────────────────────────
-- Metadados bibliográficos COMPARTILHADOS (um registro por DOI, vindo das
-- APIs). Dados pessoais de leitura/fichamento ficam em user_papers.
CREATE TABLE IF NOT EXISTS research_papers (
  id             TEXT PRIMARY KEY,
  doi            TEXT UNIQUE,
  openalex_id    TEXT,
  title          TEXT NOT NULL,
  authors_json   TEXT NOT NULL DEFAULT '[]',
  year           INTEGER,
  venue          TEXT,
  volume         TEXT,
  issue          TEXT,
  pages          TEXT,
  publisher      TEXT,
  abstract       TEXT,
  keywords_json  TEXT NOT NULL DEFAULT '[]',
  cited_by       INTEGER,
  cited_by_source TEXT,
  cited_by_at    TEXT,
  url            TEXT,
  oa_url         TEXT,
  type           TEXT,
  sources_json   TEXT NOT NULL DEFAULT '[]',
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reading_categories (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, name)
);

CREATE TABLE IF NOT EXISTS user_papers (
  id                  TEXT PRIMARY KEY,
  owner_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paper_id            TEXT NOT NULL REFERENCES research_papers(id),
  academic_project_id TEXT REFERENCES academic_projects(id) ON DELETE SET NULL,
  category_id         TEXT REFERENCES reading_categories(id) ON DELETE SET NULL,
  chapter             TEXT,
  status              TEXT NOT NULL DEFAULT 'para_ler' CHECK (status IN ('para_ler', 'lendo', 'lido', 'fichado')),
  priority            TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('baixa', 'media', 'alta')),
  progress            INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  favorite            INTEGER NOT NULL DEFAULT 0,
  tags_json           TEXT NOT NULL DEFAULT '[]',
  notes               TEXT,
  -- Correções do usuário nos metadados (só para ele; o registro compartilhado não muda).
  overrides_json      TEXT NOT NULL DEFAULT '{}',
  position            INTEGER NOT NULL DEFAULT 0,
  read_at             TEXT,
  reviewed_at         TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, paper_id)
);
CREATE INDEX IF NOT EXISTS idx_user_papers_owner ON user_papers(owner_id, status);

-- Fichamento estruturado (1 por artigo do usuário).
CREATE TABLE IF NOT EXISTS paper_reviews (
  user_paper_id   TEXT PRIMARY KEY REFERENCES user_papers(id) ON DELETE CASCADE,
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fields_json     TEXT NOT NULL DEFAULT '{}',
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS paper_quotes (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_paper_id  TEXT NOT NULL REFERENCES user_papers(id) ON DELETE CASCADE,
  text           TEXT NOT NULL,
  page           TEXT,
  comment        TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_paper_quotes_paper ON paper_quotes(user_paper_id);

-- Preferências da biblioteca: meta semanal de leitura e projeto acadêmico ativo.
CREATE TABLE IF NOT EXISTS research_settings (
  owner_id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  weekly_goal         INTEGER NOT NULL DEFAULT 3 CHECK (weekly_goal BETWEEN 0 AND 50),
  active_project_id   TEXT REFERENCES academic_projects(id) ON DELETE SET NULL,
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Histórico de mudanças de status/categoria/progresso (auditoria simples).
CREATE TABLE IF NOT EXISTS user_paper_history (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_paper_id  TEXT NOT NULL REFERENCES user_papers(id) ON DELETE CASCADE,
  field          TEXT NOT NULL,
  old_value      TEXT,
  new_value      TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Conquistas (métricas calculadas em achievementsService) ──
INSERT OR IGNORE INTO achievements (id, code, title, description, icon, threshold, metric, tier) VALUES
  ('ach_code_first',    'code_first',    'Primeiro Commit na Forja', 'Teve o primeiro commit real contabilizado na Forja do Código.', 'Flame', 1,   'code_commits_total',  'bronze'),
  ('ach_code_artisan',  'code_artisan',  'Artesão de Software',      'Cem commits reais contabilizados na Forja.',                    'ShieldCheck', 100, 'code_commits_total',  'silver'),
  ('ach_code_merge',    'code_merge',    'Repositório em Evolução',  'Dez pull requests mesclados.',                                  'Target', 10, 'code_prs_merged',  'silver'),
  ('ach_code_release',  'code_release',  'Primeiro Projeto Publicado','Publicou a primeira release de um projeto.',                    'Rocket', 1,   'code_releases_total', 'gold'),
  ('ach_paper_first',   'paper_first',   'Primeiro Artigo',          'Salvou o primeiro artigo na Biblioteca do Mestrado.',           'BookOpen', 1, 'papers_saved',        'bronze'),
  ('ach_paper_reader',  'paper_reader',  'Leitor Científico',        'Leu dez artigos da biblioteca.',                                'BookOpen', 10, 'papers_read',        'silver'),
  ('ach_paper_review5', 'paper_review5', 'Pesquisador Dedicado',     'Fichou cinco artigos.',                                          'ClipboardList', 5,  'papers_reviewed',     'silver'),
  ('ach_paper_review25','paper_review25','Mestre dos Fichamentos',   'Fichou vinte e cinco artigos.',                                  'Trophy',   25, 'papers_reviewed',     'gold'),
  ('ach_paper_lib50',   'paper_lib50',   'Biblioteca do Conhecimento','Reuniu cinquenta artigos na biblioteca.',                       'Library', 50, 'papers_saved',        'gold');
