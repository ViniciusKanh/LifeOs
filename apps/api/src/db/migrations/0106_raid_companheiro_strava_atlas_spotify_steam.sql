-- 0106_raid_companheiro_strava_atlas_spotify_steam
-- Seis sistemas novos: Chefe da Semana (Raid), Companheiro, Strava → Saúde,
-- Atlas de Exploração, Trilha Sonora (Spotify) e Tempo de Jogo (Steam).
-- Nada aqui é destrutivo: só tabelas novas, colunas novas em workouts e
-- definições de conquistas (INSERT OR IGNORE).

-- ───────────── Raid ─────────────
-- O dano NÃO é gravado: é derivado das fontes reais (tarefas, hábitos,
-- treinos...) a cada leitura. Assim uma re-sincronização nunca duplica golpes.
-- Aqui fica só o que precisa ser congelado: vida máxima, dificuldade e
-- o desfecho (derrota + recompensa entregue uma única vez).
CREATE TABLE IF NOT EXISTS raids (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start    TEXT NOT NULL,
  week_end      TEXT NOT NULL,
  boss_key      TEXT NOT NULL,
  boss_level    INTEGER NOT NULL DEFAULT 1,
  max_hp        INTEGER NOT NULL CHECK (max_hp > 0),
  difficulty    TEXT NOT NULL DEFAULT 'normal' CHECK (difficulty IN ('leve', 'normal', 'desafiador')),
  baseline_json TEXT,
  status        TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'derrotado', 'encerrada')),
  defeated_at   TEXT,
  rewarded_at   TEXT,
  final_damage  INTEGER,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, week_start)
);
CREATE INDEX IF NOT EXISTS idx_raids_owner ON raids(owner_id, week_start);

CREATE TABLE IF NOT EXISTS raid_settings (
  owner_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  difficulty       TEXT NOT NULL DEFAULT 'normal' CHECK (difficulty IN ('leve', 'normal', 'desafiador')),
  healing_enabled  INTEGER NOT NULL DEFAULT 1,
  rest_weekdays    TEXT NOT NULL DEFAULT '[]',
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Pausas pontuais (viagem, doença, folga): o chefe não se cura nesses dias.
CREATE TABLE IF NOT EXISTS raid_rest_days (
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_key    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, day_key)
);

-- ───────────── Companheiro ─────────────
CREATE TABLE IF NOT EXISTS companions (
  owner_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  species       TEXT NOT NULL DEFAULT 'husky',
  color         TEXT NOT NULL DEFAULT 'cinza',
  equipped_json TEXT NOT NULL DEFAULT '{}',
  show_in_world INTEGER NOT NULL DEFAULT 1,
  -- Maior XP já alcançado: a evolução nunca regride.
  peak_xp       INTEGER NOT NULL DEFAULT 0,
  adopted_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS companion_care (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action     TEXT NOT NULL CHECK (action IN ('alimentar', 'hidratar', 'brincar', 'descansar', 'carinho')),
  day_key    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_companion_care_owner ON companion_care(owner_id, created_at);

-- ───────────── Strava ─────────────
CREATE TABLE IF NOT EXISTS strava_connections (
  owner_id          TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  athlete_id        TEXT NOT NULL UNIQUE,
  athlete_name      TEXT,
  athlete_username  TEXT,
  avatar_url        TEXT,
  access_token_enc  TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  expires_at        INTEGER NOT NULL,
  scope             TEXT,
  settings_json     TEXT NOT NULL DEFAULT '{}',
  connected_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_sync_at      TEXT,
  last_sync_status  TEXT,
  last_error        TEXT
);

-- Origem externa dos treinos. Treinos manuais continuam com source NULL.
ALTER TABLE workouts ADD COLUMN source TEXT;
ALTER TABLE workouts ADD COLUMN external_id TEXT;
ALTER TABLE workouts ADD COLUMN external_json TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_workouts_external ON workouts(owner_id, source, external_id) WHERE external_id IS NOT NULL;

-- Eventos do webhook: a chave única impede processar o mesmo aviso duas vezes.
CREATE TABLE IF NOT EXISTS strava_webhook_events (
  id          TEXT PRIMARY KEY,
  event_key   TEXT NOT NULL UNIQUE,
  athlete_id  TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id   TEXT NOT NULL,
  aspect      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'processado', 'ignorado', 'erro')),
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT
);

-- ───────────── Atlas ─────────────
CREATE TABLE IF NOT EXISTS atlas_settings (
  owner_id          TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  location_enabled  INTEGER NOT NULL DEFAULT 0,
  precise_location  INTEGER NOT NULL DEFAULT 0,
  use_strava_routes INTEGER NOT NULL DEFAULT 0,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS atlas_places (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  category       TEXT NOT NULL DEFAULT 'outro',
  lat            REAL NOT NULL,
  lng            REAL NOT NULL,
  neighborhood   TEXT,
  city           TEXT,
  state          TEXT,
  country        TEXT,
  country_code   TEXT,
  osm_ref        TEXT,
  favorite       INTEGER NOT NULL DEFAULT 0,
  visits         INTEGER NOT NULL DEFAULT 0,
  first_visit_at TEXT,
  last_visit_at  TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_atlas_places_owner ON atlas_places(owner_id, last_visit_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_places_osm ON atlas_places(owner_id, osm_ref) WHERE osm_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS atlas_checkins (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  place_id   TEXT NOT NULL REFERENCES atlas_places(id) ON DELETE CASCADE,
  method     TEXT NOT NULL CHECK (method IN ('manual', 'localizacao', 'rota')),
  visited_at TEXT NOT NULL,
  day_key    TEXT NOT NULL,
  xp         INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_atlas_checkins_owner ON atlas_checkins(owner_id, visited_at);

-- Névoa de guerra: células de ~500 m reveladas (PK garante idempotência).
CREATE TABLE IF NOT EXISTS atlas_cells (
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cell        TEXT NOT NULL,
  source      TEXT NOT NULL,
  revealed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, cell)
);

CREATE TABLE IF NOT EXISTS atlas_routes (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  source      TEXT NOT NULL CHECK (source IN ('manual', 'strava')),
  workout_id  TEXT REFERENCES workouts(id) ON DELETE SET NULL,
  points_json TEXT NOT NULL,
  distance_km REAL,
  started_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_routes_workout ON atlas_routes(owner_id, workout_id) WHERE workout_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS atlas_journal (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  place_id   TEXT REFERENCES atlas_places(id) ON DELETE SET NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  rating     INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  category   TEXT,
  tags_json  TEXT NOT NULL DEFAULT '[]',
  photo      TEXT,
  visited_on TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_atlas_journal_owner ON atlas_journal(owner_id, visited_on);

-- Cache compartilhado do retângulo de cada cidade (Nominatim), usado só como denominador.
CREATE TABLE IF NOT EXISTS atlas_region_cache (
  region_key TEXT PRIMARY KEY,
  bbox_json  TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ───────────── Spotify ─────────────
CREATE TABLE IF NOT EXISTS spotify_connections (
  owner_id          TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  spotify_user_id   TEXT NOT NULL,
  display_name      TEXT,
  product           TEXT,
  avatar_url        TEXT,
  access_token_enc  TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  expires_at        INTEGER NOT NULL,
  scope             TEXT,
  settings_json     TEXT NOT NULL DEFAULT '{}',
  connected_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_sync_at      TEXT,
  last_error        TEXT
);

CREATE TABLE IF NOT EXISTS spotify_plays (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id     TEXT NOT NULL,
  track_name   TEXT NOT NULL,
  artists_json TEXT NOT NULL DEFAULT '[]',
  artist_ids_json TEXT NOT NULL DEFAULT '[]',
  album_name   TEXT,
  album_image  TEXT,
  duration_ms  INTEGER NOT NULL DEFAULT 0,
  played_at    TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, played_at)
);
CREATE INDEX IF NOT EXISTS idx_spotify_plays_owner ON spotify_plays(owner_id, played_at);

CREATE TABLE IF NOT EXISTS spotify_artists_cache (
  artist_id   TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  genres_json TEXT NOT NULL DEFAULT '[]',
  fetched_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sessões de trabalho iniciadas pelo usuário na Trilha Sonora.
CREATE TABLE IF NOT EXISTS music_sessions (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('foco', 'estudos', 'dissertacao', 'codigo', 'leitura', 'projeto')),
  started_at TEXT NOT NULL,
  ended_at   TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_music_sessions_owner ON music_sessions(owner_id, started_at);

CREATE TABLE IF NOT EXISTS journey_playlists (
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot        TEXT NOT NULL CHECK (slot IN ('foco', 'codigo', 'estudos', 'leitura', 'relaxar', 'missoes', 'descanso')),
  playlist_id TEXT NOT NULL,
  name        TEXT NOT NULL,
  image       TEXT,
  url         TEXT,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, slot)
);

-- ───────────── Steam ─────────────
CREATE TABLE IF NOT EXISTS steam_accounts (
  owner_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  steam_id      TEXT NOT NULL,
  persona_name  TEXT,
  avatar_url    TEXT,
  profile_url   TEXT,
  visibility    INTEGER,
  settings_json TEXT NOT NULL DEFAULT '{}',
  connected_at  TEXT NOT NULL DEFAULT (datetime('now')),
  last_sync_at  TEXT,
  last_error    TEXT
);

CREATE TABLE IF NOT EXISTS steam_games (
  owner_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  appid             INTEGER NOT NULL,
  name              TEXT NOT NULL,
  img_icon_url      TEXT,
  playtime_forever  INTEGER NOT NULL DEFAULT 0,
  playtime_2weeks   INTEGER NOT NULL DEFAULT 0,
  rtime_last_played INTEGER,
  ach_total         INTEGER,
  ach_unlocked      INTEGER,
  ach_checked_at    TEXT,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, appid)
);

-- Um snapshot por jogo por dia (o último do dia sobrescreve). O tempo diário
-- é a diferença entre snapshots: não existe histórico antes da conexão.
CREATE TABLE IF NOT EXISTS steam_playtime_snapshots (
  owner_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  appid            INTEGER NOT NULL,
  day_key          TEXT NOT NULL,
  playtime_forever INTEGER NOT NULL,
  taken_at         TEXT NOT NULL,
  PRIMARY KEY (owner_id, appid, day_key)
);

CREATE TABLE IF NOT EXISTS steam_achievements (
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  appid       INTEGER NOT NULL,
  api_name    TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  icon        TEXT,
  unlock_time INTEGER NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, appid, api_name)
);
CREATE INDEX IF NOT EXISTS idx_steam_ach_owner ON steam_achievements(owner_id, unlock_time);

-- ───────────── Conquistas (métricas reais em achievementsService) ─────────────
INSERT OR IGNORE INTO achievements (id, code, title, description, icon, threshold, metric, tier) VALUES
  ('ach_raid_first',     'raid_first',     'Caçador de Chefes',      'Derrotou o primeiro Chefe da Semana.',                  'Swords',     1,  'raids_defeated',        'bronze'),
  ('ach_raid_veteran',   'raid_veteran',   'Veterano das Raids',     'Derrotou dez Chefes da Semana.',                        'Swords',     10, 'raids_defeated',        'gold'),
  ('ach_pet_explorer',   'pet_explorer',   'Laço de Aventura',       'O Companheiro chegou ao estágio Explorador.',           'PawPrint',   3,  'companion_stage',       'silver'),
  ('ach_pet_legend',     'pet_legend',     'Companheiro Lendário',   'O Companheiro chegou ao estágio Lendário.',             'PawPrint',   5,  'companion_stage',       'gold'),
  ('ach_strava_first',   'strava_first',   'Primeira Trilha Importada','Primeiro treino importado do Strava.',                 'Activity',   1,  'strava_activities',     'bronze'),
  ('ach_strava_50',      'strava_50',      'Atleta Sincronizado',    'Cinquenta treinos importados do Strava.',               'Activity',   50, 'strava_activities',     'silver'),
  ('ach_atlas_first',    'atlas_first',    'Primeira Exploração',    'Registrou o primeiro lugar no Atlas.',                  'MapPin',     1,  'atlas_places',          'bronze'),
  ('ach_atlas_urban',    'atlas_urban',    'Explorador Urbano',      'Descobriu 25 lugares no Atlas.',                        'MapPin',     25, 'atlas_places',          'silver'),
  ('ach_atlas_hoods',    'atlas_hoods',    'Descobridor de Bairros', 'Visitou 10 bairros diferentes.',                        'Map',        10, 'atlas_neighborhoods',   'silver'),
  ('ach_atlas_regional', 'atlas_regional', 'Viajante Regional',      'Visitou 5 cidades diferentes.',                         'Map',        5,  'atlas_cities',          'silver'),
  ('ach_atlas_nomad',    'atlas_nomad',    'Nômade',                 'Visitou 3 estados diferentes.',                         'Compass',    3,  'atlas_states',          'gold'),
  ('ach_atlas_carto',    'atlas_carto',    'Cartógrafo',             'Revelou 200 células (~46 km²) do mapa.',                'Compass',    200,'atlas_cells',           'gold'),
  ('ach_music_first',    'music_first',    'Primeira Trilha',        'Concluiu a primeira sessão na Trilha Sonora.',          'Music',      1,  'music_sessions_total',  'bronze'),
  ('ach_steam_link',     'steam_link',     'Primeira Conexão Steam', 'Conectou a conta Steam ao LifeOS.',                     'Gamepad2',   1,  'steam_connected',       'bronze'),
  ('ach_steam_collector','steam_collector','Colecionador',           'Tem 50 jogos na biblioteca da Steam.',                  'Gamepad2',   50, 'steam_games_owned',     'silver'),
  ('ach_steam_master',   'steam_master',   'Mestre das Conquistas',  'Cem conquistas Steam importadas para o LifeOS.',        'Trophy',     100,'steam_achievements',    'gold');
