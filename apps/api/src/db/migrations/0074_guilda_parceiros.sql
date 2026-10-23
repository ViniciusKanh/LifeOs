-- ============================================================
-- 0074_guilda_parceiros
-- Guilda — parceiro de compromisso. O dono compartilha um Contrato ou
-- uma Meta com outro usuário (pelo e-mail). O convidado só enxerga um
-- RESUMO calculado no servidor (nunca as tabelas do dono) e pode deixar
-- testemunhos/incentivos. Tudo aditivo.
-- ============================================================

CREATE TABLE IF NOT EXISTS guild_shares (
  id               TEXT PRIMARY KEY,
  owner_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type      TEXT NOT NULL CHECK (entity_type IN ('contract', 'goal')),
  entity_id        TEXT NOT NULL,
  -- Sempre minúsculo/trim (normalizado no backend antes de gravar).
  invitee_email    TEXT NOT NULL,
  -- NULL até o convite ser aceito; o vínculo pendente é feito pelo e-mail
  -- verificado de quem está logado (inclusive quem cria a conta depois).
  invitee_user_id  TEXT REFERENCES users(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'revoked')),
  message          TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  responded_at     TEXT
);

-- Um convite "vivo" (pendente ou aceito) por item + e-mail; recusados e
-- revogados ficam no histórico e permitem um convite novo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_guild_shares_active
  ON guild_shares(owner_id, entity_type, entity_id, invitee_email)
  WHERE status IN ('pending', 'accepted');

CREATE INDEX IF NOT EXISTS idx_guild_shares_owner ON guild_shares(owner_id, created_at);
CREATE INDEX IF NOT EXISTS idx_guild_shares_entity ON guild_shares(owner_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_guild_shares_invitee_email ON guild_shares(invitee_email, status);
CREATE INDEX IF NOT EXISTS idx_guild_shares_invitee_user ON guild_shares(invitee_user_id, status);

CREATE TABLE IF NOT EXISTS guild_cheers (
  id            TEXT PRIMARY KEY,
  share_id      TEXT NOT NULL REFERENCES guild_shares(id) ON DELETE CASCADE,
  from_user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('testemunho', 'incentivo')),
  text          TEXT CHECK (text IS NULL OR length(text) <= 140),
  day_key       TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Limite duro: 1 testemunho por dia por compartilhamento.
CREATE UNIQUE INDEX IF NOT EXISTS uq_guild_cheers_testemunho_day
  ON guild_cheers(share_id, day_key)
  WHERE kind = 'testemunho';

CREATE INDEX IF NOT EXISTS idx_guild_cheers_share ON guild_cheers(share_id, created_at);
