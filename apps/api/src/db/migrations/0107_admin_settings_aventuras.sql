-- Adiciona 'strava', 'spotify' e 'steam' às integrações aceitas em admin_settings
-- (credenciais dos apps das Aventuras). Sem isso o CHECK rejeitava o INSERT e o
-- "Salvar" da tela de Configurações falhava. SQLite não permite ALTER de CHECK:
-- recria a tabela preservando todos os dados, mesmo padrão de 0017, 0033 e 0086.
CREATE TABLE IF NOT EXISTS admin_settings_new (
  id               TEXT PRIMARY KEY,
  integration       TEXT NOT NULL CHECK (integration IN ('gemini', 'turso', 'smtp', 'push', 'google_oauth', 'redis', 'strava', 'spotify', 'steam')),
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
