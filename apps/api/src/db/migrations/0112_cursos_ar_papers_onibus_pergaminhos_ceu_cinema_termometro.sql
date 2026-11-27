-- 0112_cursos_ar_papers_onibus_pergaminhos_ceu_cinema_termometro
-- Oito integrações com APIs públicas gratuitas, cada uma na sua tela:
--  - Educação: Cursos em Vídeo (playlists do YouTube Data API);
--  - Saúde: Ar do Treino (Open-Meteo Air Quality, sem chave);
--  - Biblioteca do Mestrado: Papers em Alta (Hugging Face Hub, sem chave);
--  - Hoje: Hora de Sair (SPTrans Olho Vivo, token de cadastro);
--  - Taverna: Pergaminho do Dia (Wikipédia "Neste dia", sem chave);
--  - Meu Mundo: Vitral do Céu (NASA APOD);
--  - Sala de Cinema (nova tela, TMDB);
--  - Banco do Reino: Termômetro do Reino (Banco Central SGS, sem chave).
-- Chaves pessoais ficam criptografadas e nunca voltam ao frontend. Caches de dados
-- públicos (APOD, Wikipédia, SGS) são globais: não têm dado de usuário.

-- ───────────── Chaves pessoais das APIs públicas ─────────────
CREATE TABLE IF NOT EXISTS public_api_keys (
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider    TEXT NOT NULL CHECK (provider IN ('youtube', 'nasa', 'tmdb', 'sptrans')),
  key_enc     TEXT NOT NULL,
  masked      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, provider)
);

-- ───────────── Cursos em Vídeo (YouTube) ─────────────
CREATE TABLE IF NOT EXISTS video_courses (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  playlist_id    TEXT NOT NULL,
  title          TEXT NOT NULL,
  channel        TEXT,
  thumbnail_url  TEXT,
  subject_id     TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  status         TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'concluido', 'arquivado')),
  completed_at   TEXT,
  synced_at      TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, playlist_id)
);
CREATE TABLE IF NOT EXISTS video_lessons (
  id                TEXT PRIMARY KEY,
  course_id         TEXT NOT NULL REFERENCES video_courses(id) ON DELETE CASCADE,
  owner_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id          TEXT NOT NULL,
  position          INTEGER NOT NULL DEFAULT 0,
  title             TEXT NOT NULL,
  duration_seconds  INTEGER,
  thumbnail_url     TEXT,
  unavailable       INTEGER NOT NULL DEFAULT 0,
  done_at           TEXT,
  done_day          TEXT,
  UNIQUE (course_id, video_id)
);
CREATE INDEX IF NOT EXISTS idx_video_lessons_owner_day ON video_lessons(owner_id, done_day);

-- ───────────── Ar do Treino (previsão horária guardada para validar o bônus) ─────────────
CREATE TABLE IF NOT EXISTS air_quality_days (
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_key      TEXT NOT NULL,
  hourly_json  TEXT NOT NULL,
  fetched_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, day_key)
);

-- ───────────── Papers em Alta (Hugging Face) ─────────────
CREATE TABLE IF NOT EXISTS hf_paper_triage (
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  arxiv_id       TEXT NOT NULL,
  title          TEXT NOT NULL,
  upvotes        INTEGER,
  decision       TEXT NOT NULL CHECK (decision IN ('salvo', 'dispensado')),
  user_paper_id  TEXT REFERENCES user_papers(id) ON DELETE SET NULL,
  day_key        TEXT NOT NULL,
  decided_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, arxiv_id)
);

-- ───────────── Hora de Sair (SPTrans) ─────────────
CREATE TABLE IF NOT EXISTS transit_stops (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stop_code     INTEGER NOT NULL,
  name          TEXT NOT NULL,
  address       TEXT,
  walk_minutes  INTEGER NOT NULL DEFAULT 5 CHECK (walk_minutes BETWEEN 0 AND 60),
  ride_minutes  INTEGER CHECK (ride_minutes IS NULL OR ride_minutes BETWEEN 1 AND 240),
  lines_json    TEXT NOT NULL DEFAULT '[]',
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, stop_code)
);
-- Uma partida por dia (a missão "Chegar sem atraso" é diária).
CREATE TABLE IF NOT EXISTS transit_departures (
  owner_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_key          TEXT NOT NULL,
  stop_code        INTEGER NOT NULL,
  line             TEXT,
  event_id         TEXT,
  event_title      TEXT,
  recommended_at   TEXT,
  left_at          TEXT NOT NULL,
  on_time          INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owner_id, day_key)
);

-- ───────────── Pergaminho do Dia (Wikipédia) ─────────────
CREATE TABLE IF NOT EXISTS onthisday_cache (
  md          TEXT NOT NULL,
  lang        TEXT NOT NULL,
  json        TEXT NOT NULL,
  fetched_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (md, lang)
);
CREATE TABLE IF NOT EXISTS lore_scrolls (
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_key     TEXT NOT NULL,
  year        INTEGER,
  text        TEXT NOT NULL,
  page_title  TEXT,
  page_url    TEXT,
  thumb_url   TEXT,
  read_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, day_key)
);

-- ───────────── Vitral do Céu (NASA APOD) ─────────────
CREATE TABLE IF NOT EXISTS apod_cache (
  date        TEXT PRIMARY KEY,
  json        TEXT NOT NULL,
  fetched_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sky_album (
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date          TEXT NOT NULL,
  title         TEXT NOT NULL,
  media_type    TEXT,
  thumb_url     TEXT,
  collected_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, date)
);

-- ───────────── Sala de Cinema (TMDB) ─────────────
CREATE TABLE IF NOT EXISTS cinema_items (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_id         INTEGER NOT NULL,
  media_type      TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  title           TEXT NOT NULL,
  original_title  TEXT,
  year            INTEGER,
  poster_path     TEXT,
  overview        TEXT,
  genres_json     TEXT NOT NULL DEFAULT '[]',
  runtime_minutes INTEGER,
  seasons         INTEGER,
  status          TEXT NOT NULL DEFAULT 'quero_ver' CHECK (status IN ('quero_ver', 'assistindo', 'visto', 'abandonado')),
  rating          INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 10),
  review          TEXT,
  watched_at      TEXT,
  watched_day     TEXT,
  added_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, media_type, tmdb_id)
);
CREATE INDEX IF NOT EXISTS idx_cinema_items_owner_status ON cinema_items(owner_id, status, watched_day);
CREATE TABLE IF NOT EXISTS cinema_settings (
  owner_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  monthly_goal  INTEGER CHECK (monthly_goal IS NULL OR monthly_goal BETWEEN 1 AND 60),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ───────────── Termômetro do Reino (Banco Central SGS) ─────────────
CREATE TABLE IF NOT EXISTS sgs_points (
  series  INTEGER NOT NULL,
  date    TEXT NOT NULL,
  value   REAL NOT NULL,
  PRIMARY KEY (series, date)
);
CREATE TABLE IF NOT EXISTS sgs_fetch (
  series      INTEGER PRIMARY KEY,
  fetched_at  TEXT NOT NULL
);

-- ───────────── Conquistas (métricas reais em achievementsService) ─────────────
INSERT OR IGNORE INTO achievements (id, code, title, description, icon, threshold, metric, tier) VALUES
  ('ach_video_lessons_10', 'video_lessons_10', 'Aluno da Tela Brilhante', 'Concluiu dez aulas de cursos em vídeo.',                 'PlayCircle',   10,  'video_lessons_done',   'bronze'),
  ('ach_video_course_1',   'video_course_1',   'Formado na Escola do Vídeo', 'Concluiu todas as aulas de um curso em vídeo.',        'GraduationCap', 1,  'video_courses_done',   'silver'),
  ('ach_video_course_5',   'video_course_5',   'Erudito das Playlists',   'Concluiu cinco cursos em vídeo.',                         'GraduationCap', 5,  'video_courses_done',   'gold'),
  ('ach_clean_air_5',      'clean_air_5',      'Fôlego de Montanha',      'Cinco treinos ao ar livre na janela de ar bom.',          'Wind',         5,   'clean_air_workouts',   'bronze'),
  ('ach_hf_triage_20',     'hf_triage_20',     'Curador da Fronteira',    'Fez a triagem de vinte papers em alta.',                  'Flame',        20,  'hf_papers_triaged',    'bronze'),
  ('ach_transit_10',       'transit_10',       'Pontual como a Guarda',   'Saiu na hora certa para dez compromissos.',               'Bus',          10,  'transit_on_time',      'silver'),
  ('ach_scroll_30',        'scroll_30',        'Guardião dos Pergaminhos', 'Leu trinta pergaminhos do dia.',                         'ScrollText',   30,  'lore_scrolls_read',    'silver'),
  ('ach_sky_30',           'sky_30',           'Cartógrafo das Estrelas', 'Colecionou trinta céus no álbum do Vitral.',              'Sparkles',     30,  'sky_album_count',      'silver'),
  ('ach_cinema_10',        'cinema_10',        'Crítico da Taverna',      'Assistiu e deu nota a dez filmes ou séries.',             'Clapperboard', 10,  'cinema_rated',         'bronze'),
  ('ach_cinema_genres_5',  'cinema_genres_5',  'Explorador de Gêneros',   'Viu títulos de cinco gêneros diferentes.',                'Film',         5,   'cinema_genres',        'silver');
