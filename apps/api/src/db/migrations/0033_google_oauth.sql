-- ============================================================
-- 0033_google_oauth
-- Login/cadastro com Google (OAuth 2.0): liga uma conta Google a um
-- usuário do LifeOS (novo ou já existente pelo e-mail).
--
-- users.google_id: id único da conta Google (sub do token), nulo pra
-- quem nunca usou login com Google. Índice único parcial (só quando
-- não nulo) evita conflito e não exige mudar o CHECK de nenhuma
-- coluna existente — ADD COLUMN simples, sem recriar a tabela.
--
-- admin_settings.integration precisa aceitar 'google_oauth' (Client
-- ID/Secret configurados pelo admin) — como qualquer mudança de CHECK
-- no SQLite, recria a tabela preservando os dados (mesmo padrão da
-- migration 0017).
-- ============================================================

ALTER TABLE users ADD COLUMN google_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS admin_settings_new (
  id               TEXT PRIMARY KEY,
  integration       TEXT NOT NULL CHECK (integration IN ('gemini', 'turso', 'smtp', 'push', 'google_oauth')),
  key_name          TEXT NOT NULL,
  encrypted_value   TEXT,
  masked_preview    TEXT,
  is_active         INTEGER NOT NULL DEFAULT 0,
  extra_config      TEXT,
  updated_by        TEXT REFERENCES users(id),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (integration, key_name)
);

INSERT INTO admin_settings_new SELECT * FROM admin_settings;
DROP TABLE admin_settings;
ALTER TABLE admin_settings_new RENAME TO admin_settings;
