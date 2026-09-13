-- ============================================================
-- 0013_email_verification
-- Todo novo cadastro passa a exigir confirmação por e-mail antes
-- de poder entrar. Contas já existentes (e contas criadas por um
-- admin em /admin/usuarios) continuam verificadas por padrão —
-- só o fluxo de autocadastro (/api/auth/register) grava
-- email_verified = 0 explicitamente.
-- ============================================================

ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,       -- nunca armazenar o token em texto puro
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_email_verification_user ON email_verification_tokens(user_id);
