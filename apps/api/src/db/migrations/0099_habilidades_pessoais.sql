-- ============================================================
-- 0099_habilidades_pessoais
-- Árvore de Habilidades 2.0: o usuário (ou a IA, com confirmação) cria as
-- próprias habilidades em quatro troncos — Saúde, Educação, Pessoal e
-- Trabalho — com sub-habilidades em qualquer profundidade (limitada no
-- serviço). Nível só sobe com prova aprovada (quiz/desafio gerado e corrigido
-- pela IA), registrada em `skill_assessments`.
--
-- Somente aditivo. As tabelas da árvore fixa (0098) continuam no banco, sem
-- uso pela interface. As 7 conquistas da 0098 passam a medir a nova árvore;
-- os desbloqueios antigos (critério que deixou de existir) são removidos para
-- que nenhuma conquista apareça como obtida sem ter sido cumprida — serão
-- concedidas de novo quando o novo critério for atingido.
-- ============================================================

CREATE TABLE IF NOT EXISTS personal_skills (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id     TEXT REFERENCES personal_skills(id) ON DELETE CASCADE,
  domain        TEXT NOT NULL CHECK (domain IN ('saude', 'educacao', 'pessoal', 'trabalho')),
  name          TEXT NOT NULL,
  description   TEXT,
  icon          TEXT NOT NULL DEFAULT 'sparkles',
  max_level     INTEGER NOT NULL DEFAULT 5 CHECK (max_level BETWEEN 1 AND 10),
  level         INTEGER NOT NULL DEFAULT 0,
  -- [{level, title, criteria}] — o que precisa ser demonstrado em cada nível.
  levels_json   TEXT NOT NULL DEFAULT '[]',
  proof_mode    TEXT NOT NULL DEFAULT 'quiz' CHECK (proof_mode IN ('quiz', 'desafio', 'misto')),
  -- Vínculo opcional com a origem real da prática (minutos medidos, nunca digitados).
  link_kind     TEXT CHECK (link_kind IS NULL OR link_kind IN ('modalidade', 'formacao', 'disciplina', 'projeto')),
  link_ref      TEXT,
  -- Requisito opcional: minutos de prática acumulados por nível antes de liberar a prova.
  practice_minutes_per_level INTEGER CHECK (practice_minutes_per_level IS NULL OR practice_minutes_per_level BETWEEN 0 AND 6000),
  source        TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ia')),
  position      INTEGER NOT NULL DEFAULT 0,
  last_level_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (level >= 0 AND level <= max_level)
);

CREATE INDEX IF NOT EXISTS idx_personal_skills_owner ON personal_skills(owner_id, domain, parent_id, position);
CREATE INDEX IF NOT EXISTS idx_personal_skills_parent ON personal_skills(parent_id);

CREATE TABLE IF NOT EXISTS skill_assessments (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id      TEXT NOT NULL REFERENCES personal_skills(id) ON DELETE CASCADE,
  target_level  INTEGER NOT NULL CHECK (target_level BETWEEN 1 AND 10),
  kind          TEXT NOT NULL CHECK (kind IN ('quiz', 'desafio', 'misto')),
  -- aberta → corrigindo (trava contra envio duplo) → aprovada | reprovada; expirada por tempo/abandono.
  status        TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'corrigindo', 'aprovada', 'reprovada', 'expirada')),
  -- Perguntas com gabarito/rubrica: nunca enviados ao cliente antes da entrega.
  items_json    TEXT NOT NULL,
  answers_json  TEXT,
  result_json   TEXT,
  score         INTEGER CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  pass_score    INTEGER NOT NULL DEFAULT 70,
  model         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL,
  submitted_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_skill_assessments_skill ON skill_assessments(owner_id, skill_id, created_at);
CREATE INDEX IF NOT EXISTS idx_skill_assessments_owner ON skill_assessments(owner_id, status, created_at);
-- No máximo uma prova em andamento por habilidade.
CREATE UNIQUE INDEX IF NOT EXISTS uq_skill_assessments_open ON skill_assessments(owner_id, skill_id) WHERE status IN ('aberta', 'corrigindo');

-- Conquistas oficiais da árvore passam a medir provas aprovadas e a árvore pessoal.
UPDATE achievements SET title = 'Primeiro Nível Comprovado', description = 'Passou na primeira prova de nível de uma habilidade da sua árvore.', metric = 'skill_levels_verified', threshold = 1 WHERE id = 'ach_skill_first';
UPDATE achievements SET title = 'Dez Níveis Comprovados', description = 'Somou dez níveis comprovados por provas na Árvore de Habilidades.', metric = 'skill_levels_verified', threshold = 10 WHERE id = 'ach_skill_ten';
UPDATE achievements SET title = 'Mestria Comprovada', description = 'Levou uma habilidade ao nível máximo passando em todas as provas.', metric = 'skills_maxed', threshold = 1 WHERE id = 'ach_skill_branch';
UPDATE achievements SET title = 'Vida em Equilíbrio', description = 'Tem nível comprovado nos quatro troncos: Saúde, Educação, Pessoal e Trabalho.', metric = 'skill_domains_verified', threshold = 4 WHERE id = 'ach_skill_multi';
UPDATE achievements SET title = 'Árvore Plantada', description = 'Criou seis habilidades na sua Árvore de Habilidades.', metric = 'skills_created', threshold = 6 WHERE id = 'ach_skill_six';
UPDATE achievements SET title = 'Galhos e Ramificações', description = 'Organizou uma habilidade com três ou mais sub-habilidades.', metric = 'skills_branched', threshold = 1 WHERE id = 'ach_skill_builder';
UPDATE achievements SET title = 'Lenda da Árvore', description = 'Somou cinquenta níveis comprovados por provas.', metric = 'skill_levels_verified', threshold = 50 WHERE id = 'ach_skill_maxed';
DELETE FROM user_achievements WHERE achievement_id IN ('ach_skill_first', 'ach_skill_ten', 'ach_skill_branch', 'ach_skill_multi', 'ach_skill_six', 'ach_skill_builder', 'ach_skill_maxed');
