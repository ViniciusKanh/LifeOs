-- ============================================================
-- 0001_users_auth
-- Usuários, sessão, papéis (role) e configurações administrativas.
-- Toda credencial sensível (Gemini, Turso, SMTP) fica em
-- admin_settings, sempre criptografada em nível de aplicação
-- antes de ser gravada (ver services/cryptoService.ts).
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  avatar_url      TEXT,
  language        TEXT NOT NULL DEFAULT 'pt-BR',
  timezone        TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  theme           TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
  onboarding_done INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Preferências e metas gerais do usuário (água, exercício, leitura...),
-- separadas de "users" para manter a tabela de identidade enxuta.
CREATE TABLE IF NOT EXISTS user_settings (
  user_id                 TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  water_goal_ml           INTEGER NOT NULL DEFAULT 2500,
  exercise_goal_weekly_min INTEGER NOT NULL DEFAULT 150,
  reading_goal_pages_daily INTEGER NOT NULL DEFAULT 20,
  preferred_work_hours   TEXT,          -- ex: "09:00-12:00,14:00-18:00"
  life_score_weights     TEXT,          -- JSON com pesos por dimensão
  notifications_config   TEXT,          -- JSON com flags de notificação
  ai_consent             INTEGER NOT NULL DEFAULT 0, -- consentimento p/ enviar dados à IA
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Tokens de recuperação de senha. Sempre com validade curta.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,       -- nunca armazenar o token em texto puro
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id);

-- Configurações globais de administração (Gemini, Turso, SMTP).
-- Linha única por "chave" de integração. Valor sensível sempre
-- criptografado (encrypted_value); a UI nunca recebe o valor puro
-- de volta, apenas um preview mascarado (masked_preview).
CREATE TABLE IF NOT EXISTS admin_settings (
  id               TEXT PRIMARY KEY,
  integration       TEXT NOT NULL CHECK (integration IN ('gemini', 'turso', 'smtp')),
  key_name          TEXT NOT NULL,        -- ex: 'api_key', 'auth_token', 'smtp_password'
  encrypted_value   TEXT,                 -- valor cifrado (AES-256-GCM)
  masked_preview    TEXT,                 -- ex: '••••••••••••AB23'
  is_active         INTEGER NOT NULL DEFAULT 0,
  extra_config      TEXT,                 -- JSON: modelo padrão, host, porta, etc.
  updated_by        TEXT REFERENCES users(id),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (integration, key_name)
);

-- Log de auditoria para ações administrativas. Nunca gravar
-- senha ou token completo aqui — apenas metadados da ação.
CREATE TABLE IF NOT EXISTS audit_logs (
  id           TEXT PRIMARY KEY,
  actor_id     TEXT REFERENCES users(id),
  action       TEXT NOT NULL,      -- ex: 'admin_settings.update'
  resource     TEXT,               -- ex: 'admin_settings:gemini.api_key'
  ip_address   TEXT,
  context      TEXT,               -- JSON com contexto não sensível
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);
