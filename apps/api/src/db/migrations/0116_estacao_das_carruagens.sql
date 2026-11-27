-- Estação das Carruagens (0.5.39): transporte de São Paulo numa tela própria.
-- Horários programados vêm do GTFS da SPTrans (dados públicos, globais, iguais
-- para todos os usuários) e o Olho Vivo continua opcional para o tempo real.
-- As tabelas gtfs_* são referência compartilhada e só o administrador importa.

CREATE TABLE IF NOT EXISTS gtfs_feed (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  source_url   TEXT,
  version      TEXT,
  status       TEXT NOT NULL DEFAULT 'vazio' CHECK (status IN ('vazio', 'importando', 'pronto', 'erro')),
  next_step    INTEGER NOT NULL DEFAULT 0,
  counts_json  TEXT NOT NULL DEFAULT '{}',
  error        TEXT,
  started_at   TEXT,
  imported_at  TEXT
);

CREATE TABLE IF NOT EXISTS gtfs_stops (
  stop_id  INTEGER PRIMARY KEY,
  name     TEXT NOT NULL,
  ref      TEXT,
  lat      REAL NOT NULL,
  lon      REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gtfs_stops_geo ON gtfs_stops (lat, lon);

CREATE TABLE IF NOT EXISTS gtfs_routes (
  route_id    TEXT PRIMARY KEY,
  short_name  TEXT NOT NULL,
  long_name   TEXT,
  route_type  INTEGER NOT NULL DEFAULT 3,
  color       TEXT,
  text_color  TEXT
);

CREATE TABLE IF NOT EXISTS gtfs_trips (
  trip_id       TEXT PRIMARY KEY,
  route_id      TEXT NOT NULL,
  service_id    TEXT NOT NULL,
  headsign      TEXT,
  direction_id  INTEGER
);

-- days: sete caracteres 0/1, de segunda a domingo.
CREATE TABLE IF NOT EXISTS gtfs_calendar (
  service_id  TEXT PRIMARY KEY,
  days        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gtfs_frequencies (
  trip_id       TEXT NOT NULL,
  start_sec     INTEGER NOT NULL,
  end_sec       INTEGER NOT NULL,
  headway_secs  INTEGER NOT NULL,
  PRIMARY KEY (trip_id, start_sec)
);

-- offset_sec: segundos desde a primeira parada da viagem (a SPTrans publica frequências, não horários fixos).
CREATE TABLE IF NOT EXISTS gtfs_stop_times (
  trip_id     TEXT NOT NULL,
  seq         INTEGER NOT NULL,
  stop_id     INTEGER NOT NULL,
  offset_sec  INTEGER NOT NULL,
  PRIMARY KEY (trip_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_gtfs_stop_times_stop ON gtfs_stop_times (stop_id);

ALTER TABLE transit_stops ADD COLUMN lat REAL;
ALTER TABLE transit_stops ADD COLUMN lon REAL;

-- Jornadas: origem → ponto de embarque → linha → ponto de desembarque → destino.
CREATE TABLE IF NOT EXISTS transit_journeys (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  origin_label    TEXT NOT NULL,
  origin_lat      REAL NOT NULL,
  origin_lon      REAL NOT NULL,
  dest_label      TEXT NOT NULL,
  dest_lat        REAL NOT NULL,
  dest_lon        REAL NOT NULL,
  board_stop_id   INTEGER NOT NULL,
  board_seq       INTEGER NOT NULL,
  alight_stop_id  INTEGER NOT NULL,
  alight_seq      INTEGER NOT NULL,
  trip_id         TEXT NOT NULL,
  walk_to_min     INTEGER NOT NULL CHECK (walk_to_min BETWEEN 0 AND 90),
  walk_from_min   INTEGER NOT NULL CHECK (walk_from_min BETWEEN 0 AND 90),
  walk_estimated  INTEGER NOT NULL DEFAULT 0,
  ride_min        INTEGER NOT NULL CHECK (ride_min BETWEEN 0 AND 300),
  is_primary      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_transit_journeys_owner ON transit_journeys (owner_id);

ALTER TABLE transit_departures ADD COLUMN journey_id TEXT;
ALTER TABLE transit_departures ADD COLUMN source TEXT;

INSERT OR IGNORE INTO achievements (id, code, title, description, icon, threshold, metric, tier) VALUES
  ('ach_transit_50', 'transit_50', 'Cocheiro Lendário', 'Saiu na hora certa cinquenta vezes.', 'Bus', 50, 'transit_on_time', 'gold');
