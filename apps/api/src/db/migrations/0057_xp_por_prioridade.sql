-- ============================================================
-- 0057_xp_por_prioridade
-- O usuário configura em Missões quanto vale cada prioridade (Baixa,
-- Média, Alta) em XP e moedas — como já faz por dificuldade. Aditivo;
-- nulo = valores padrão do LifeOS.
-- ============================================================
ALTER TABLE gamification_settings ADD COLUMN priority_json TEXT;
