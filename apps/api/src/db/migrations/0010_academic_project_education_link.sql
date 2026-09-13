-- ============================================================
-- 0010_academic_project_education_link
-- Liga um projeto acadêmico (TCC/dissertação/tese/artigo) à
-- formação (educations) a que ele pertence. Sem isso não dá para
-- saber, por formação, se o usuário está em período de aulas ou
-- já só na fase de projeto — a distinção pedida para a tela de
-- Educação.
-- ============================================================

ALTER TABLE academic_projects ADD COLUMN education_id TEXT REFERENCES educations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_academic_projects_education ON academic_projects(education_id);
