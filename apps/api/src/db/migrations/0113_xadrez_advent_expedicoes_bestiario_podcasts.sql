-- 0113_xadrez_advent_expedicoes_bestiario_podcasts
-- Cinco integrações com APIs públicas gratuitas, todas com dados reais:
--  - Aventuras · Arena de Xadrez (Lichess: perfil, partidas e puzzles);
--  - Forja do Código · Advent of Code (estrelas e ranking privado);
--  - Atlas · Expedições da Semana (OpenStreetMap/Overpass);
--  - Aventuras · Bestiário (espécies registradas no iNaturalist);
--  - Biblioteca · Leitura em Áudio (Podcast Index).
-- Credenciais (token do Lichess, cookie do AoC, chave do Podcast Index) ficam
-- criptografadas e nunca voltam ao frontend. Não guardamos posição do usuário:
-- as expedições usam a cidade do Contexto do Dia ou um lugar já salvo no Atlas.

-- ───────────── Arena de Xadrez (Lichess) ─────────────
CREATE TABLE IF NOT EXISTS lichess_accounts (
  owner_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username         TEXT NOT NULL,
  token_enc        TEXT,
  profile_json     TEXT,
  peak_json        TEXT NOT NULL DEFAULT '{}',
  last_sync_at     TEXT,
  last_sync_status TEXT CHECK (last_sync_status IS NULL OR last_sync_status IN ('ok', 'parcial', 'erro')),
  last_sync_error  TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS lichess_games (
  owner_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id          TEXT NOT NULL,
  played_at        TEXT NOT NULL,
  day_key          TEXT NOT NULL,
  speed            TEXT,
  rated            INTEGER NOT NULL DEFAULT 0,
  result           TEXT NOT NULL CHECK (result IN ('vitoria', 'derrota', 'empate')),
  color            TEXT,
  my_rating        INTEGER,
  rating_diff      INTEGER,
  opponent         TEXT,
  opponent_rating  INTEGER,
  opening          TEXT,
  PRIMARY KEY (owner_id, game_id)
);
CREATE INDEX IF NOT EXISTS idx_lichess_games_day ON lichess_games(owner_id, day_key);
CREATE TABLE IF NOT EXISTS lichess_puzzles (
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  puzzle_id  TEXT NOT NULL,
  played_at  TEXT NOT NULL,
  day_key    TEXT NOT NULL,
  win        INTEGER NOT NULL DEFAULT 0,
  rating     INTEGER,
  PRIMARY KEY (owner_id, puzzle_id)
);

-- ───────────── Advent of Code ─────────────
CREATE TABLE IF NOT EXISTS aoc_accounts (
  owner_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  session_enc      TEXT NOT NULL,
  leaderboard_id   TEXT NOT NULL,
  member_id        TEXT,
  last_sync_at     TEXT,
  last_sync_status TEXT CHECK (last_sync_status IS NULL OR last_sync_status IN ('ok', 'parcial', 'erro')),
  last_sync_error  TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Ranking do ano (cache do JSON do leaderboard privado, sem o cookie).
CREATE TABLE IF NOT EXISTS aoc_years (
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year         INTEGER NOT NULL,
  members_json TEXT NOT NULL DEFAULT '[]',
  synced_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, year)
);
CREATE TABLE IF NOT EXISTS aoc_stars (
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year       INTEGER NOT NULL,
  day        INTEGER NOT NULL CHECK (day BETWEEN 1 AND 25),
  part       INTEGER NOT NULL CHECK (part IN (1, 2)),
  earned_at  TEXT NOT NULL,
  PRIMARY KEY (owner_id, year, day, part)
);

-- ───────────── Expedições da Semana (Overpass) ─────────────
CREATE TABLE IF NOT EXISTS expedition_settings (
  owner_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  radius_m         INTEGER NOT NULL DEFAULT 3000 CHECK (radius_m BETWEEN 500 AND 15000),
  center_place_id  TEXT REFERENCES atlas_places(id) ON DELETE SET NULL,
  kinds_json       TEXT NOT NULL DEFAULT '["parque","museu","biblioteca","mirante","trilha","cultura"]',
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS expedition_missions (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_key     TEXT NOT NULL,
  osm_ref      TEXT NOT NULL,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL,
  lat          REAL NOT NULL,
  lng          REAL NOT NULL,
  distance_m   INTEGER,
  status       TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'concluida', 'trocada')),
  completed_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, week_key, osm_ref)
);
CREATE INDEX IF NOT EXISTS idx_expedition_missions_week ON expedition_missions(owner_id, week_key);

-- ───────────── Bestiário (iNaturalist) ─────────────
CREATE TABLE IF NOT EXISTS bestiary_accounts (
  owner_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  inat_login       TEXT NOT NULL,
  observations     INTEGER NOT NULL DEFAULT 0,
  last_sync_at     TEXT,
  last_sync_status TEXT CHECK (last_sync_status IS NULL OR last_sync_status IN ('ok', 'parcial', 'erro')),
  last_sync_error  TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS bestiary_species (
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  taxon_id      INTEGER NOT NULL,
  name          TEXT NOT NULL,
  common_name   TEXT,
  rank          TEXT,
  iconic        TEXT,
  global_count  INTEGER,
  rarity        TEXT NOT NULL CHECK (rarity IN ('comum', 'incomum', 'rara', 'epica', 'lendaria')),
  my_count      INTEGER NOT NULL DEFAULT 1,
  photo_url     TEXT,
  wiki_url      TEXT,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, taxon_id)
);

-- ───────────── Leitura em Áudio (Podcast Index) ─────────────
CREATE TABLE IF NOT EXISTS podcast_accounts (
  owner_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  key_enc     TEXT NOT NULL,
  secret_enc  TEXT NOT NULL,
  masked      TEXT,
  monthly_goal INTEGER CHECK (monthly_goal IS NULL OR monthly_goal BETWEEN 1 AND 200),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS podcast_follows (
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feed_id     INTEGER NOT NULL,
  title       TEXT NOT NULL,
  author      TEXT,
  image_url   TEXT,
  site_url    TEXT,
  followed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, feed_id)
);
CREATE TABLE IF NOT EXISTS podcast_listens (
  owner_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  episode_id       INTEGER NOT NULL,
  feed_id          INTEGER NOT NULL,
  title            TEXT NOT NULL,
  podcast_title    TEXT,
  duration_seconds INTEGER,
  listened_at      TEXT NOT NULL DEFAULT (datetime('now')),
  day_key          TEXT NOT NULL,
  PRIMARY KEY (owner_id, episode_id)
);
CREATE INDEX IF NOT EXISTS idx_podcast_listens_day ON podcast_listens(owner_id, day_key);

-- ───────────── Conquistas (métricas reais em achievementsService) ─────────────
INSERT OR IGNORE INTO achievements (id, code, title, description, icon, threshold, metric, tier) VALUES
  ('ach_chess_wins_10',     'chess_wins_10',     'Peão Promovido',          'Venceu dez partidas no Lichess.',                       'Swords',      10,   'chess_wins',            'bronze'),
  ('ach_chess_wins_100',    'chess_wins_100',    'Mestre da Arena',         'Venceu cem partidas no Lichess.',                       'Crown',       100,  'chess_wins',            'gold'),
  ('ach_chess_puzzles_50',  'chess_puzzles_50',  'Tático Afiado',           'Resolveu cinquenta puzzles no Lichess.',                'Puzzle',      50,   'chess_puzzles',         'silver'),
  ('ach_chess_1500',        'chess_1500',        'Cavaleiro de 1500',       'Chegou a 1500 de rating em algum ritmo do Lichess.',    'Trophy',      1500, 'chess_peak_rating',     'silver'),
  ('ach_chess_2000',        'chess_2000',        'Grão-Mestre do Reino',    'Chegou a 2000 de rating em algum ritmo do Lichess.',    'Trophy',      2000, 'chess_peak_rating',     'gold'),
  ('ach_aoc_stars_10',      'aoc_stars_10',      'Elfo Aprendiz',           'Ganhou dez estrelas no Advent of Code.',                'Star',        10,   'aoc_stars',             'bronze'),
  ('ach_aoc_stars_50',      'aoc_stars_50',      'Engenheiro do Polo Norte', 'Ganhou cinquenta estrelas no Advent of Code.',         'Star',        50,   'aoc_stars',             'silver'),
  ('ach_aoc_full',          'aoc_full',          'Salvador do Natal',       'Completou todas as estrelas de um ano do Advent of Code.', 'Gift',      1,    'aoc_full_events',       'gold'),
  ('ach_expedition_5',      'expedition_5',      'Batedor',                 'Concluiu cinco expedições do Atlas.',                   'Compass',     5,    'expedition_missions',   'bronze'),
  ('ach_expedition_25',     'expedition_25',     'Desbravador',             'Concluiu vinte e cinco expedições do Atlas.',           'Compass',     25,   'expedition_missions',   'silver'),
  ('ach_bestiary_10',       'bestiary_10',       'Naturalista Iniciante',   'Dez espécies no Bestiário.',                            'Leaf',        10,   'bestiary_species',      'bronze'),
  ('ach_bestiary_50',       'bestiary_50',       'Guardião do Bestiário',   'Cinquenta espécies no Bestiário.',                      'Leaf',        50,   'bestiary_species',      'silver'),
  ('ach_bestiary_legend',   'bestiary_legend',   'Avistamento Lendário',    'Registrou uma espécie lendária (raríssima no iNaturalist).', 'Sparkles', 1, 'bestiary_legendary',    'gold'),
  ('ach_podcast_10',        'podcast_10',        'Ouvinte da Taverna',      'Ouviu dez episódios de podcast.',                       'Headphones',  10,   'podcast_episodes',      'bronze'),
  ('ach_podcast_hours_24',  'podcast_hours_24',  'Bardo Erudito',           'Vinte e quatro horas de podcasts ouvidas.',             'Headphones',  24,   'podcast_hours',         'silver');
