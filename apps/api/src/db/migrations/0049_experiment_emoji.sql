-- ============================================================
-- 0049_experiment_emoji
-- Emoji escolhido pelo usuário (ou sugerido pelo modelo/IA) para
-- identificar o experimento no painel. Aditiva e opcional: nulo cai
-- no emoji padrão da categoria no frontend.
-- ============================================================

ALTER TABLE personal_experiments ADD COLUMN emoji TEXT;
