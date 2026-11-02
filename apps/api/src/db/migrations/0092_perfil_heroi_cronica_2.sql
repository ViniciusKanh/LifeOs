-- Perfil do Herói 3.0 + Crônica da Jornada 2.0 — somente tabelas novas (aditivo).
-- XP, moedas, conquistas e inventário continuam nas fontes oficiais
-- (xp_events, coin_ledger, user_achievements, inventory_*): aqui só ficam
-- preferências do usuário e fotografias históricas da build.

-- Metas de recompensa: o usuário escolhe um alvo (recompensa, título, relíquia
-- ou conjunto). O progresso é sempre calculado a partir do saldo/coleção real.
CREATE TABLE IF NOT EXISTS hero_reward_goals (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('reward', 'title', 'relic', 'set')),
  target_id   TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  notified_at TEXT,
  UNIQUE (owner_id, kind, target_id)
);

-- Marcos da build: uma fotografia por semana (automação) ou por dia (manual).
-- Nunca é sobrescrita — o histórico da evolução fica preservado.
CREATE TABLE IF NOT EXISTS build_snapshots (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_key     TEXT NOT NULL,
  origin         TEXT NOT NULL DEFAULT 'auto' CHECK (origin IN ('auto', 'manual')),
  archetype_id   TEXT,
  archetype_name TEXT,
  affinity       INTEGER,
  scores         TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, period_key)
);
CREATE INDEX IF NOT EXISTS idx_build_snapshots_owner ON build_snapshots(owner_id, created_at);

-- Marcos favoritos da Crônica: guarda só a referência estável do evento original.
CREATE TABLE IF NOT EXISTS chronicle_marks (
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_key  TEXT NOT NULL,
  label      TEXT NOT NULL,
  event_at   TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, event_key)
);

-- Momentos memoráveis: fotos do Diário que o PRÓPRIO usuário autorizou exibir na Crônica.
CREATE TABLE IF NOT EXISTS chronicle_moments (
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_id   TEXT NOT NULL REFERENCES journal_entry_media(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, media_id)
);

-- Conquistas de maestria (raridade Mítica): contam conquistas oficiais desbloqueadas.
INSERT OR IGNORE INTO achievements (id, code, title, description, icon, threshold, metric, tier) VALUES
  ('ach_mastery_10', 'mastery_10', 'Colecionador de Feitos',  'Desbloqueou 10 conquistas oficiais.',  'Trophy', 10, 'achievements_unlocked_total', 'gold'),
  ('ach_mastery_25', 'mastery_25', 'Hall da Maestria',        'Desbloqueou 25 conquistas oficiais.',  'Trophy', 25, 'achievements_unlocked_total', 'platinum'),
  ('ach_mastery_50', 'mastery_50', 'Lenda Viva da Jornada',   'Desbloqueou 50 conquistas oficiais.',  'Crown',  50, 'achievements_unlocked_total', 'platinum');
