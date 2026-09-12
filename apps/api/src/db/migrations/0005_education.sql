-- ============================================================
-- 0005_education
-- Hierarquia: Educação → Formação → Curso/Disciplina → Projeto → Tarefa.
-- academic_projects (TCC, dissertação, tese...) reaproveita a
-- estrutura de "projects" (kind='academic') e ganha campos próprios
-- para milestones específicos do trabalho acadêmico.
-- ============================================================

CREATE TABLE IF NOT EXISTS educations (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL
                    CHECK (kind IN ('graduacao', 'pos_graduacao', 'mestrado', 'doutorado', 'curso_online', 'certificacao', 'curso_livre')),
  institution     TEXT,
  course_name     TEXT NOT NULL,
  started_at      TEXT,
  expected_end_at TEXT,
  progress_pct    INTEGER NOT NULL DEFAULT 0,
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_educations_owner ON educations(owner_id);

CREATE TABLE IF NOT EXISTS courses (
  id            TEXT PRIMARY KEY,
  education_id  TEXT NOT NULL REFERENCES educations(id) ON DELETE CASCADE,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  semester      TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_courses_education ON courses(education_id);

CREATE TABLE IF NOT EXISTS subjects (
  id             TEXT PRIMARY KEY,
  course_id      TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  professor      TEXT,
  workload_hours INTEGER,
  status         TEXT NOT NULL DEFAULT 'Planejada'
                   CHECK (status IN ('Planejada', 'Em andamento', 'Concluída', 'Trancada')),
  grades         TEXT,        -- JSON com notas/provas/trabalhos
  files          TEXT,        -- JSON com referências de arquivos anexados
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_subjects_course ON subjects(course_id);

-- TCC, dissertação, tese, artigo, projeto científico...
CREATE TABLE IF NOT EXISTS academic_projects (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE, -- vínculo com Kanban/Gantt genérico
  kind        TEXT NOT NULL
                CHECK (kind IN ('tcc', 'dissertacao', 'tese', 'artigo', 'projeto_cientifico', 'trabalho_final')),
  title       TEXT NOT NULL,
  advisor     TEXT,
  progress_pct INTEGER NOT NULL DEFAULT 0,
  defense_date TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_academic_projects_owner ON academic_projects(owner_id);
