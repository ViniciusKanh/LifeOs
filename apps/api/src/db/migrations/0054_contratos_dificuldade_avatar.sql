-- ============================================================
-- 0054_contratos_dificuldade_avatar
-- Contratos (conjuntos de tarefas com bônus de XP/moedas ao concluir),
-- dificuldade das tarefas, recompensas por dificuldade configuráveis
-- por usuário e avatar RPG persistido no backend. Tudo aditivo.
-- ============================================================

-- Contrato = pacto com um objetivo, cumprido quando TODAS as suas
-- tarefas são concluídas. O bônus é pago uma única vez (xp_events).
CREATE TABLE IF NOT EXISTS contracts (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  objective     TEXT,
  difficulty    TEXT NOT NULL DEFAULT 'medio' CHECK (difficulty IN ('facil', 'medio', 'dificil', 'epico')),
  status        TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'concluido', 'arquivado')),
  due_date      TEXT,
  ai_generated  INTEGER NOT NULL DEFAULT 0,
  completed_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contracts_owner ON contracts(owner_id, status);

ALTER TABLE tasks ADD COLUMN contract_id TEXT REFERENCES contracts(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN difficulty TEXT CHECK (difficulty IS NULL OR difficulty IN ('facil', 'medio', 'dificil', 'epico'));

CREATE INDEX IF NOT EXISTS idx_tasks_contract ON tasks(owner_id, contract_id);

-- XP/moedas por dificuldade definidos pelo próprio usuário (Meu Perfil).
-- O backend sempre limita os valores (ver GAMIFICATION_RULES.difficulty).
CREATE TABLE IF NOT EXISTS gamification_settings (
  owner_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  difficulty_json  TEXT NOT NULL,
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Avatar RPG: imagem própria (data URI comprimida no cliente) e
-- preferências cosméticas do personagem, antes só no navegador.
ALTER TABLE users ADD COLUMN rpg_avatar_image TEXT;
ALTER TABLE users ADD COLUMN rpg_prefs_json TEXT;
