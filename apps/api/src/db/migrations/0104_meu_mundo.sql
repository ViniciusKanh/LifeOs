-- ============================================================
-- 0104_meu_mundo (só aditiva)
-- Meu Mundo (Living World): só guarda o que é do PRÓPRIO mundo.
-- XP, moedas, missões, hábitos, inventário e resultados de IA continuam
-- nas suas fontes de verdade; aqui ficam preferências, aparência/posição do
-- avatar, decorações colocadas, eventos do mundo e execuções dos agentes.
-- ============================================================

CREATE TABLE IF NOT EXISTS world_profiles (
  owner_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  version       INTEGER NOT NULL DEFAULT 1,
  settings_json TEXT NOT NULL DEFAULT '{}',
  avatar_json   TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Decoração: cada linha é um item do inventário colocado num "slot" de um ambiente.
CREATE TABLE IF NOT EXISTS world_objects (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room        TEXT NOT NULL,
  slot_key    TEXT NOT NULL,
  item_key    TEXT NOT NULL,
  -- Cópia de apresentação (nome/arte) gravada ao colocar: o mundo não precisa
  -- recalcular o inventário a cada leitura. A posse é validada na colocação.
  item_name   TEXT NOT NULL,
  item_art    TEXT NOT NULL,
  item_art_set TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, slot_key)
);
CREATE INDEX IF NOT EXISTS idx_world_objects_owner ON world_objects(owner_id);

-- Eventos de domínio do próprio mundo (agentes, decoração). Eventos de outros
-- módulos (missões, hábitos…) são lidos de xp_events, sem cópia.
CREATE TABLE IF NOT EXISTS world_events (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  detail      TEXT,
  ref_id      TEXT,
  meta_json   TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_world_events_owner ON world_events(owner_id, created_at);

-- Execuções reais dos agentes (conselheiros do LifeOS). O estado visual vem daqui.
CREATE TABLE IF NOT EXISTS world_agent_runs (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_key    TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('running', 'done', 'failed')),
  question     TEXT,
  result_json  TEXT,
  error        TEXT,
  started_at   TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_world_agent_runs_owner ON world_agent_runs(owner_id, agent_key, started_at);
