-- ============================================================
-- 0087_project_sharing
-- Compartilhamento de projetos ("Colaboração total"): convite por
-- e-mail mesmo padrão da Guilda (0074_guilda_parceiros), mas aqui o
-- convidado, ao aceitar, vira um registro em project_members (já
-- existente desde 0003_projects_tasks, nunca usado até agora) — com
-- acesso de leitura/escrita a TODAS as tarefas do projeto, não só um
-- resumo somente leitura como na Guilda.
-- ============================================================

CREATE TABLE IF NOT EXISTS project_invites (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  owner_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Sempre minúsculo/trim (normalizado no backend antes de gravar).
  invitee_email    TEXT NOT NULL,
  -- NULL até o convite ser aceito; o vínculo pendente é feito pelo
  -- e-mail verificado de quem está logado (inclusive quem cria a
  -- conta depois do convite).
  invitee_user_id  TEXT REFERENCES users(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'revoked')),
  message          TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  responded_at     TEXT
);

-- Um convite "vivo" (pendente ou aceito) por projeto + e-mail; recusados
-- e revogados ficam no histórico e permitem um convite novo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_project_invites_active
  ON project_invites(project_id, invitee_email)
  WHERE status IN ('pending', 'accepted');

CREATE INDEX IF NOT EXISTS idx_project_invites_owner ON project_invites(owner_id, created_at);
CREATE INDEX IF NOT EXISTS idx_project_invites_project ON project_invites(project_id, status);
CREATE INDEX IF NOT EXISTS idx_project_invites_invitee_email ON project_invites(invitee_email, status);
CREATE INDEX IF NOT EXISTS idx_project_invites_invitee_user ON project_invites(invitee_user_id, status);

-- project_members só tinha a PK composta (project_id, user_id) — faltava
-- um índice para "em quais projetos eu sou membro", usado em toda
-- checagem de acesso compartilhado (ver projectAccessService.ts).
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);
