-- ============================================================
-- 0047_mfa_sessions_terms
-- Segurança da conta e consentimento:
--  - MFA por aplicativo autenticador (TOTP, RFC 6238). O segredo fica
--    criptografado (AES-256-GCM, cryptoService) — nunca em texto puro.
--    mfa_last_step impede reutilizar o mesmo código dentro da janela.
--  - session_version: incrementar invalida todas as sessões do usuário
--    (troca/reset de senha, remoção de MFA pelo admin, "sair de todos").
--  - last_login_at / last_seen_at: visão do admin sobre uso da conta.
--  - terms_version / terms_accepted_at: aceite do Termo de Uso e da
--    Política de Privacidade (LGPD) — versão aceita fica registrada.
-- Tudo aditivo; nenhuma coluna existente é alterada.
-- ============================================================

ALTER TABLE users ADD COLUMN mfa_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN mfa_secret TEXT;
ALTER TABLE users ADD COLUMN mfa_pending_secret TEXT;
ALTER TABLE users ADD COLUMN mfa_last_step INTEGER;
ALTER TABLE users ADD COLUMN mfa_enabled_at TEXT;
ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN last_login_at TEXT;
ALTER TABLE users ADD COLUMN last_seen_at TEXT;
ALTER TABLE users ADD COLUMN terms_version TEXT;
ALTER TABLE users ADD COLUMN terms_accepted_at TEXT;

-- Códigos de recuperação do MFA: só o hash (sha256) é guardado; cada um vale uma vez.
CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mfa_recovery_user ON mfa_recovery_codes(user_id);
