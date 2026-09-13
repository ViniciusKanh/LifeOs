-- ============================================================
-- 0011_education_dashboard
-- Suporte real (nada de mock) para o painel completo de uma
-- formação: progresso por disciplina, prazos acadêmicos, sessões
-- de estudo (para o gráfico de horas na semana) e o checklist do
-- semestre. Tudo com owner_id próprio, como o resto do app.
-- ============================================================

ALTER TABLE subjects ADD COLUMN progress_pct INTEGER NOT NULL DEFAULT 0;

-- Meta semanal de estudo (minutos) usada só como denominador da %
-- exibida no painel — o numerador (minutos estudados) sempre vem de
-- study_sessions, nunca é estimado. Valor inicial documentado: 20h/semana.
ALTER TABLE educations ADD COLUMN weekly_study_goal_minutes INTEGER NOT NULL DEFAULT 1200;

CREATE TABLE IF NOT EXISTS academic_deadlines (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  education_id TEXT NOT NULL REFERENCES educations(id) ON DELETE CASCADE,
  subject_id   TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  due_date     TEXT NOT NULL,
  done         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_academic_deadlines_education ON academic_deadlines(education_id);

CREATE TABLE IF NOT EXISTS study_sessions (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  education_id TEXT NOT NULL REFERENCES educations(id) ON DELETE CASCADE,
  subject_id   TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  occurred_at  TEXT NOT NULL, -- data (YYYY-MM-DD) em que o estudo aconteceu
  duration_minutes INTEGER NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_study_sessions_education ON study_sessions(education_id);
CREATE INDEX IF NOT EXISTS idx_study_sessions_occurred ON study_sessions(occurred_at);

CREATE TABLE IF NOT EXISTS semester_checklist (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  education_id TEXT NOT NULL REFERENCES educations(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  done         INTEGER NOT NULL DEFAULT 0,
  due_date     TEXT,
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_semester_checklist_education ON semester_checklist(education_id);
