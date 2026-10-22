-- ============================================================
-- 0066_exercicios_detalhados
-- Registro de exercício mais rico (academia, luta, cardio...).
-- Somente aditivo: colunas novas opcionais em `workouts` e uma tabela
-- filha de séries. `kind`, `duration_minutes`, `intensity` e
-- `performed_at` continuam iguais — Timeline, Analytics, Forja,
-- Experimentos (exercise_minutes) e gamificação seguem lendo as mesmas
-- colunas. Registros antigos ficam com as colunas novas em NULL.
-- ============================================================

-- Chave estável do tipo (musculacao, luta, corrida, ...). `kind` segue
-- guardando o rótulo legível para compatibilidade.
ALTER TABLE workouts ADD COLUMN category TEXT;
-- Luta: modalidade (muay_thai, jiu_jitsu, boxe, mma, judo, ...).
ALTER TABLE workouts ADD COLUMN modality TEXT;
-- Esforço percebido (escala de Borg CR-10).
ALTER TABLE workouts ADD COLUMN rpe INTEGER CHECK (rpe IS NULL OR (rpe BETWEEN 1 AND 10));
-- Musculação: treino/grupo muscular em texto livre (ex.: "Treino A — peito e tríceps").
ALTER TABLE workouts ADD COLUMN muscle_groups TEXT;
-- Luta: rounds e duração de cada round (minutos).
ALTER TABLE workouts ADD COLUMN rounds INTEGER CHECK (rounds IS NULL OR rounds > 0);
ALTER TABLE workouts ADD COLUMN round_minutes REAL CHECK (round_minutes IS NULL OR round_minutes > 0);

-- Musculação: lista simples de exercícios (séries × reps × carga).
CREATE TABLE IF NOT EXISTS workout_sets (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workout_id  TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL DEFAULT 0,
  exercise    TEXT NOT NULL,
  sets        INTEGER CHECK (sets IS NULL OR sets > 0),
  reps        INTEGER CHECK (reps IS NULL OR reps > 0),
  load_kg     REAL CHECK (load_kg IS NULL OR load_kg >= 0),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_workout_sets_workout ON workout_sets(owner_id, workout_id, position);
