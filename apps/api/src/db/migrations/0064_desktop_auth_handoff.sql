-- Login com Google no LifeOS Desktop: o OAuth acontece no navegador do
-- sistema e volta ao app por deep link (lifeos://) com um código de uso
-- único. Guardamos só o hash do código e o desafio PKCE do app que iniciou
-- o fluxo — sem o verificador (que nunca sai do app), o código não vale nada.
CREATE TABLE IF NOT EXISTS desktop_auth_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
