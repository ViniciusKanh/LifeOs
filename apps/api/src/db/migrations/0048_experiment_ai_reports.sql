-- ============================================================
-- 0048_experiment_ai_reports
-- Relatórios de IA dos Experimentos Pessoais (insights do LifeOS
-- Copilot). Guardamos o resultado para: (1) o usuário rever a
-- evolução das leituras ao longo do experimento e (2) não chamar o
-- Gemini de novo a cada abertura da tela. Aditiva: tabela nova.
-- O conteúdo é derivado só de agregados reais (ver
-- experimentCoachService.ts) e cada item vem rotulado como dado real,
-- inferência ou sugestão.
-- ============================================================

CREATE TABLE IF NOT EXISTS experiment_ai_reports (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  experiment_id  TEXT NOT NULL REFERENCES personal_experiments(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL DEFAULT 'insight' CHECK (kind IN ('insight', 'final')),
  content_json   TEXT NOT NULL,
  -- Quantos check-ins/observações existiam quando o relatório foi gerado:
  -- permite avisar "há dados novos desde a última análise".
  logs_count     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_experiment_ai_reports_exp ON experiment_ai_reports(owner_id, experiment_id, created_at DESC);
