-- ============================================================
-- 0017_admin_settings_push_integration
-- admin_settings.integration tinha um CHECK fixo em ('gemini',
-- 'turso', 'smtp') — as chaves VAPID do Web Push (pushService.ts)
-- precisam de integration = 'push'. SQLite não permite ALTER TABLE
-- para mudar um CHECK existente, então recriamos a tabela com a
-- lista ampliada (mesmo padrão de qualquer migração de CHECK aqui).
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_settings_new (
  id               TEXT PRIMARY KEY,
  integration       TEXT NOT NULL CHECK (integration IN ('gemini', 'turso', 'smtp', 'push')),
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
